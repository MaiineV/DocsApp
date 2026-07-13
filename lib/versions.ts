import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PartialBlock } from '@blocknote/core'
import { createClient } from '@/lib/supabase/server'
import { readDocBody, replaceDocBody } from '@/lib/api/doc-body'

// Historial de versiones (Fase 14). La captura la hace el trigger
// `documents_capture_version` en cada guardado de ydoc_state (coalescing 10
// min, cap 50); acá viven la lectura y el restore. RLS gatea todo a editor+
// del team del documento.

export type DocVersionRow = {
  id: string
  title: string
  created_by: string | null
  created_at: string
}

export type RestoreResult = {
  ok: boolean
  status: number
  error?: string
  titleChanged?: boolean
}

// Versiones de un doc, más nuevas primero. SIN ydoc_state/content (pesados):
// la lista solo necesita metadata; el preview pide la versión puntual.
export const listVersions = cache(async (docId: string): Promise<DocVersionRow[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('document_versions')
    .select('id, title, created_by, created_at')
    .eq('document_id', docId)
    .order('created_at', { ascending: false })
  return (data ?? []) as DocVersionRow[]
})

// Una versión con su payload. El doble .eq es el guard de pertenencia
// (una versionId ajena a este doc → null, no 500).
export const getVersion = cache(
  async (docId: string, versionId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('document_versions')
      .select('id, title, ydoc_state, content, created_by, created_at')
      .eq('id', versionId)
      .eq('document_id', docId)
      .maybeSingle()
    return data as
      | (DocVersionRow & { ydoc_state: string | null; content: string })
      | null
  },
)

// Restaura el doc al estado de una versión, de forma NO destructiva:
//  1. checkpoint explícito del estado ACTUAL (además de preservar lo que se
//     pisa, su fila fresca hace que el trigger saltee el UPDATE del restore);
//  2. reconstruye los bloques de la versión (snapshot Yjs, fallback a la
//     cache `content` para versiones legacy);
//  3. reemplaza el cuerpo vía el pipeline delta del PATCH v1 (CAS + merge +
//     broadcast en vivo a los editores abiertos);
//  4. restaura también el título si cambió (LWW, como persistTitle).
// Las anclas de comentarios no sobreviven al rebuild (los hilos quedan en el
// map `threads`) — mismo comportamiento que el PATCH v1; el UI lo advierte.
export async function restoreVersion(
  supabase: SupabaseClient,
  jwt: string,
  userId: string,
  docId: string,
  versionId: string,
): Promise<RestoreResult> {
  const version = await getVersion(docId, versionId)
  if (!version) return { ok: false, status: 404, error: 'Versión no encontrada.' }

  const { data: current } = await supabase
    .from('documents')
    .select('title, ydoc_state, content')
    .eq('id', docId)
    .is('deleted_at', null) // no restaurar sobre un doc en la papelera
    .maybeSingle()
  if (!current) return { ok: false, status: 404, error: 'Documento no encontrado.' }

  // Checkpoint pre-restore. La policy de INSERT (editor+ y created_by propio)
  // corta acá con un error limpio antes de mutar nada.
  const { error: checkpointError } = await supabase.from('document_versions').insert({
    document_id: docId,
    title: current.title as string,
    ydoc_state: current.ydoc_state as string | null,
    content: (current.content as string) ?? '',
    created_by: userId,
  })
  if (checkpointError) {
    return { ok: false, status: 403, error: checkpointError.message }
  }

  const blocks = (await readDocBody(
    { content: version.content, ydoc_state: version.ydoc_state },
    'json',
  )) as PartialBlock[]
  // BlockNote no acepta initialContent vacío; una versión "vacía" = un párrafo.
  const safeBlocks: PartialBlock[] = blocks.length > 0 ? blocks : [{ type: 'paragraph' }]

  const { res } = await replaceDocBody(supabase, jwt, userId, docId, safeBlocks)
  if (!res.ok) return { ok: false, status: res.status, error: res.error }

  let titleChanged = false
  if (version.title !== current.title) {
    const { data: updated } = await supabase
      .from('documents')
      .update({ title: version.title })
      .eq('id', docId)
      .select('id')
    titleChanged = (updated?.length ?? 0) > 0
  }

  return { ok: true, status: 200, titleChanged }
}
