import { cache } from 'react'
import type { PartialBlock } from '@blocknote/core'
import { createAnonApiClient } from '@/lib/supabase/api'
import { readDocBody } from '@/lib/api/doc-body'
import { renderHtml } from '@/lib/api/markdown'
import { sanitizeHtml } from '@/lib/api/html'

// Pipeline de la vista pública `/share`. Todo va por el cliente ANON (sin sesión) y
// las RPCs SECURITY DEFINER `get_shared_doc` / `get_shared_tree`, que nunca exponen
// la tabla documents: solo el set compartido. Módulo aparte de `lib/shares.ts` (la
// gestión con cookies) para no arrastrar jsdom/dompurify/blocknote al bundle de la
// app autenticada.

export type SharedDoc = {
  rootId: string
  includeSubpages: boolean
  id: string
  title: string
  icon: string | null
  html: string
  parentId: string | null
}

type SharedDocRow = {
  root_id: string
  include_subpages: boolean
  id: string
  title: string
  icon: string | null
  content: string | null
  ydoc_state: string | null
  parent_id: string | null
}

// Resuelve un documento dentro de un link público y lo renderiza a HTML sanitizado
// read-only. `docId` undefined = la raíz del share. null si el token es inválido/
// revocado o el doc no está en el set compartido (→ notFound en la page).
export const fetchSharedDoc = cache(async function fetchSharedDoc(
  token: string,
  docId?: string,
): Promise<SharedDoc | null> {
  const supabase = createAnonApiClient()
  const { data, error } = await supabase.rpc('get_shared_doc', {
    p_token: token,
    p_doc_id: docId ?? null,
  })
  const row = (data as SharedDocRow[] | null)?.[0]
  if (error || !row) return null

  const blocks = (await readDocBody(
    { content: row.content, ydoc_state: row.ydoc_state },
    'json',
  )) as PartialBlock[]
  const html = sanitizeHtml(await renderHtml(blocks))

  return {
    rootId: row.root_id,
    includeSubpages: row.include_subpages,
    id: row.id,
    title: row.title,
    icon: row.icon,
    html,
    parentId: row.parent_id,
  }
})

export type SharedTreeRow = {
  id: string
  title: string
  icon: string | null
  parent_id: string | null
  position: number
}

// Filas (id,title,parent_id,position) del set compartido para el nav público
// (raíz + descendientes si include_subpages). [] si el token es inválido/revocado.
export async function fetchSharedTree(token: string): Promise<SharedTreeRow[]> {
  const supabase = createAnonApiClient()
  const { data } = await supabase.rpc('get_shared_tree', { p_token: token })
  return (data as SharedTreeRow[] | null) ?? []
}
