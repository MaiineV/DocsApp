import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Acceso a documentos con `React.cache` para deduplicar entre el layout y la
// page del doc (que antes hacían el mismo fetch dos veces).

export const getDocument = cache(async (id: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('id, title, content, team_id, updated_at, ydoc_state, parent_id')
    .eq('id', id)
    .is('deleted_at', null) // un doc en la papelera no se abre
    .maybeSingle()
  return data
})

export type TeamDocRow = {
  id: string
  title: string
  parent_id: string | null
  updated_at: string
}

// Docs del team (para el árbol del sidebar y la lista de @menciones). RLS:
// solo devuelve los del team donde el usuario es miembro.
export const listTeamDocs = cache(async (teamId: string): Promise<TeamDocRow[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('id, title, parent_id, updated_at')
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  return (data ?? []) as TeamDocRow[]
})
