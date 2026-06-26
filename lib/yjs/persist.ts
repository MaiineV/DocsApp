import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeBase64Updates } from '@/lib/yjs/encoding'

export type PersistResult = {
  ok: boolean
  status: number
  version?: number
  error?: string
}

// Persiste el snapshot Yjs con MERGE + optimistic concurrency (CAS), no overwrite.
//
// Por qué merge y no "guardar el último estado": en serverless no hay sesión de
// fila, y dos editores podrían guardar casi a la vez. Si el último pisara, podría
// borrar una edición concurrente que no había recibido. En cambio leemos el
// estado guardado, lo mergeamos con el entrante (los merges de Yjs son
// conmutativos/idempotentes → el estado solo crece y converge) y escribimos con
// `WHERE ydoc_version = <leída>`. Si otra escritura ganó (0 filas), reintentamos
// con la versión nueva. La RLS de UPDATE (editor+) sigue siendo el guard real:
// para un viewer el UPDATE devuelve 0 filas siempre y el loop acotado corta.
export async function casMergeYdoc(
  supabase: SupabaseClient,
  id: string,
  snapshotB64: string,
  content?: string,
): Promise<PersistResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error: readErr } = await supabase
      .from('documents')
      .select('ydoc_state, ydoc_version')
      .eq('id', id)
      .maybeSingle()

    if (readErr) return { ok: false, status: 500, error: readErr.message }
    if (!row) return { ok: false, status: 403, error: 'Documento no encontrado o sin acceso.' }

    const version = row.ydoc_version as number
    const stored = row.ydoc_state as string | null
    const merged = stored ? mergeBase64Updates([stored, snapshotB64]) : snapshotB64

    const { data, error } = await supabase
      .from('documents')
      .update({
        ydoc_state: merged,
        ydoc_version: version + 1,
        ...(content !== undefined ? { content } : {}),
      })
      .eq('id', id)
      .eq('ydoc_version', version)
      .select('id')

    if (error) return { ok: false, status: 500, error: error.message }
    if (data && data.length > 0) return { ok: true, status: 200, version: version + 1 }
    // 0 filas: perdió el CAS (otro escribió) o RLS denegó (viewer) → reintentar.
  }
  return { ok: false, status: 409, error: 'Conflicto de versión o sin permiso para editar.' }
}
