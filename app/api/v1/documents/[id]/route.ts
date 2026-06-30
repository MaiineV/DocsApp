import { z } from 'zod'
import type { PartialBlock } from '@blocknote/core'
import { revalidatePath } from 'next/cache'
import { authenticateRequest, isAuthError } from '@/lib/api/auth'
import { fail, ok, noContent, type ApiErrorCode } from '@/lib/api/respond'
import { contentToBlocks } from '@/lib/api/markdown'
import { readDocBody, replaceDocBody, type ReadFormat } from '@/lib/api/doc-body'
import { softDeleteDoc } from '@/lib/trash'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

// GET /api/v1/documents/:id?format=markdown|json — doc + cuerpo. Default markdown
// (lo que pidió el caso de uso: leer/escribir .md). json es lossless (blocks).
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth.error
  const { id } = await params

  const format: ReadFormat =
    new URL(request.url).searchParams.get('format') === 'json' ? 'json' : 'markdown'

  const { data: doc, error } = await auth.supabase
    .from('documents')
    .select('id, title, team_id, parent_id, updated_at, content, ydoc_state')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return fail('internal', error.message)
  if (!doc) return fail('not_found', 'Documento no encontrado o sin acceso.')

  const content = await readDocBody(doc, format)
  return ok({
    document: {
      id: doc.id,
      title: doc.title,
      team_id: doc.team_id,
      parent_id: doc.parent_id,
      updated_at: doc.updated_at,
      format,
      content,
    },
  })
}

const patchSchema = z
  .object({
    title: z.string().max(500).optional(),
    content: z.union([z.string(), z.array(z.unknown())]).optional(),
    format: z.enum(['markdown', 'json']).optional(),
  })
  .refine((d) => d.title !== undefined || d.content !== undefined, {
    message: 'Nada para actualizar: enviá title y/o content.',
  })

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
}

// PATCH /api/v1/documents/:id — edita título y/o cuerpo. El cuerpo se reemplaza
// (delta Yjs) con CAS+merge y se emite en vivo por Realtime. RLS (editor+) gatea.
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth.error
  const { supabase, user, jwt } = auth
  const { id } = await params

  let json: unknown
  try {
    json = await request.json()
  } catch {
    json = {}
  }
  const parsed = patchSchema.safeParse(json ?? {})
  if (!parsed.success) {
    return fail('bad_request', parsed.error.issues[0]?.message ?? 'Body inválido.')
  }
  const { title, content, format } = parsed.data

  let titleUpdated = false
  let bodyUpdated = false
  let broadcast = false
  let version: number | undefined

  if (title !== undefined) {
    const { data, error } = await supabase
      .from('documents')
      .update({ title: title.trim() })
      .eq('id', id)
      .select('id')
    if (error) return fail('internal', error.message)
    if (!data || data.length === 0) {
      return fail('forbidden', 'Sin permiso para editar este documento (o no existe).')
    }
    titleUpdated = true
  }

  if (content !== undefined) {
    let blocks: PartialBlock[]
    try {
      blocks = await contentToBlocks(content, format)
    } catch (e) {
      return fail('bad_request', `No se pudo parsear el contenido: ${(e as Error).message}`)
    }
    const { res, broadcast: b } = await replaceDocBody(supabase, jwt, user.id, id, blocks)
    if (!res.ok) {
      return fail(STATUS_TO_CODE[res.status] ?? 'internal', res.error ?? 'No se pudo guardar el documento.')
    }
    bodyUpdated = true
    broadcast = b
    version = res.version
  }

  revalidatePath('/docs', 'layout')
  revalidatePath(`/docs/${id}`)
  return ok({ ok: true, titleUpdated, bodyUpdated, broadcast, version })
}

// DELETE /api/v1/documents/:id — manda el doc a la PAPELERA (soft-delete) junto
// con su subárbol (recuperable desde la web). RLS (editor+) gatea.
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth.error
  const { id } = await params

  const res = await softDeleteDoc(auth.supabase, id)
  if (!res.ok) {
    return fail(STATUS_TO_CODE[res.status] ?? 'internal', res.error ?? 'No se pudo borrar el documento.')
  }

  revalidatePath('/docs', 'layout')
  return noContent()
}
