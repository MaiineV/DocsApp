import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { authenticateRequest, isAuthError } from '@/lib/api/auth'
import { fail, ok, created } from '@/lib/api/respond'
import { contentToBlocks } from '@/lib/api/markdown'
import { seedBody } from '@/lib/api/doc-body'

export const runtime = 'nodejs'

type Params = { params: Promise<{ teamId: string }> }

// GET /api/v1/teams/:teamId/documents — lista de docs del team (plano, con
// parent_id para reconstruir el árbol). RLS: solo devuelve los de teams donde el
// usuario es miembro (si no es miembro, lista vacía).
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth.error
  const { teamId } = await params

  const { data, error } = await auth.supabase
    .from('documents')
    .select('id, title, parent_id, updated_at')
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (error) return fail('internal', error.message)

  return ok({ documents: data ?? [] })
}

const createSchema = z.object({
  title: z.string().max(500).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  content: z.union([z.string(), z.array(z.unknown())]).optional(),
  format: z.enum(['markdown', 'json']).optional(),
})

// POST /api/v1/teams/:teamId/documents — crea un doc en el team. `content`
// opcional (markdown string o blocks JSON) siembra el cuerpo. team_id viene del
// path; RLS (editor+) y el trigger (parent mismo team) validan. Sin broadcast: el
// doc es nuevo, nadie lo tiene abierto.
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth.error
  const { supabase, user } = auth
  const { teamId } = await params

  let json: unknown
  try {
    json = await request.json()
  } catch {
    json = {}
  }
  const parsed = createSchema.safeParse(json ?? {})
  if (!parsed.success) {
    return fail('bad_request', parsed.error.issues[0]?.message ?? 'Body inválido.')
  }
  const { title, parent_id, content, format } = parsed.data

  let seed: { ydocState: string; content: string } | null = null
  if (content !== undefined) {
    try {
      seed = seedBody(await contentToBlocks(content, format))
    } catch (e) {
      return fail('bad_request', `No se pudo parsear el contenido: ${(e as Error).message}`)
    }
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({
      team_id: teamId,
      created_by: user.id,
      title: (title ?? '').trim(),
      parent_id: parent_id ?? null,
      ...(seed ? { ydoc_state: seed.ydocState, content: seed.content } : {}),
    })
    .select('id, title, team_id, parent_id, updated_at')
    .single()
  if (error) {
    // RLS (editor+) o trigger (parent de otro team / ciclo) lo rechazan.
    return fail('forbidden', error.message)
  }

  revalidatePath('/docs', 'layout')
  return created({ document: data })
}
