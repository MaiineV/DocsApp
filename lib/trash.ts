import type { SupabaseClient } from '@supabase/supabase-js'
import { collectDescendantIds, type DocRow } from '@/lib/doc-tree'

export type TrashResult = { ok: boolean; status: number; error?: string; count?: number }

// Ids del subárbol de `id` (incluido) entre los docs del MISMO team en el estado
// pedido (activos o en papelera). Reusa `collectDescendantIds` (puro, ya testeado).
// La RLS limita lo que se ve/actualiza; este cálculo solo arma el conjunto.
async function subtreeIds(
  supabase: SupabaseClient,
  id: string,
  trashed: boolean,
): Promise<string[] | null> {
  const { data: doc, error } = await supabase
    .from('documents')
    .select('team_id')
    .eq('id', id)
    .maybeSingle()
  if (error || !doc) return null

  let q = supabase.from('documents').select('id, parent_id').eq('team_id', doc.team_id as string)
  q = trashed ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
  const { data: rows } = await q

  const list: DocRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    title: '',
    parent_id: (r.parent_id as string | null) ?? null,
  }))
  return [id, ...collectDescendantIds(list, id)]
}

// Manda a la papelera el doc + su subárbol ACTIVO. RLS (editor+) gatea el UPDATE:
// para un viewer afecta 0 filas → 403.
export async function softDeleteDoc(supabase: SupabaseClient, id: string): Promise<TrashResult> {
  const ids = await subtreeIds(supabase, id, false)
  if (!ids) return { ok: false, status: 404, error: 'Documento no encontrado o sin acceso.' }

  const { data, error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .is('deleted_at', null)
    .select('id')
  if (error) return { ok: false, status: 500, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, status: 403, error: 'Sin permiso para borrar este documento.' }
  }
  return { ok: true, status: 200, count: data.length }
}

// Restaura el doc + su subárbol que está en la papelera.
export async function restoreDoc(supabase: SupabaseClient, id: string): Promise<TrashResult> {
  const ids = await subtreeIds(supabase, id, true)
  if (!ids) return { ok: false, status: 404, error: 'Documento no encontrado o sin acceso.' }

  const { data, error } = await supabase
    .from('documents')
    .update({ deleted_at: null })
    .in('id', ids)
    .not('deleted_at', 'is', null)
    .select('id')
  if (error) return { ok: false, status: 500, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, status: 403, error: 'Sin permiso para restaurar este documento.' }
  }
  return { ok: true, status: 200, count: data.length }
}

// Borra DEFINITIVAMENTE (hard delete) el doc + su subárbol en papelera.
export async function purgeDoc(supabase: SupabaseClient, id: string): Promise<TrashResult> {
  const ids = await subtreeIds(supabase, id, true)
  if (!ids) return { ok: false, status: 404, error: 'Documento no encontrado o sin acceso.' }

  const { data, error } = await supabase
    .from('documents')
    .delete()
    .in('id', ids)
    .not('deleted_at', 'is', null) // solo lo que está en la papelera
    .select('id')
  if (error) return { ok: false, status: 500, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, status: 403, error: 'Sin permiso para borrar definitivamente.' }
  }
  return { ok: true, status: 200, count: data.length }
}
