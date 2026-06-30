'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveTeam } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { casMergeYdoc } from '@/lib/yjs/persist'
import { softDeleteDoc, restoreDoc, purgeDoc } from '@/lib/trash'
import type { SearchResult } from '@/lib/types'

// Crea un documento vacío y abre el editor. Si `parentId` viene, el doc es hijo
// de ese (y hereda su team — el trigger exige mismo team); si no, va al team
// activo como raíz. El team_id se deriva del server; RLS + trigger lo validan.
// `idempotencyKey`: un doble-submit con la misma key NO crea dos — el índice
// único (created_by, key) lo dedupea y abrimos el doc ya creado.
export async function createDocument(parentId: string | null = null, idempotencyKey?: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let teamId: string
  if (parentId) {
    const { data: parent } = await supabase
      .from('documents')
      .select('team_id')
      .eq('id', parentId)
      .maybeSingle()
    if (!parent) {
      redirect(`/docs?error=${encodeURIComponent(getDictionary(await getLocale()).errors.docCreateFailed)}`)
    }
    teamId = parent.team_id as string
  } else {
    const team = await getActiveTeam()
    if (!team) redirect('/onboarding')
    teamId = team.id
  }

  // title vacío → la UI muestra el "Sin título"/"Untitled" localizado.
  const { data, error } = await supabase
    .from('documents')
    .insert({
      team_id: teamId,
      created_by: user.id,
      title: '',
      parent_id: parentId,
      idempotency_key: idempotencyKey ?? null,
    })
    .select('id')
    .single()

  if (error) {
    // Doble-submit con la misma key → el doc ya existe: abrirlo (idempotente).
    if (error.code === '23505' && idempotencyKey) {
      const { data: existing } = await supabase
        .from('documents')
        .select('id')
        .eq('created_by', user.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existing) {
        revalidatePath('/docs', 'layout')
        redirect(`/docs/${existing.id}`)
      }
    }
    redirect(`/docs?error=${encodeURIComponent(error.message)}`)
  }
  if (!data) {
    redirect(`/docs?error=${encodeURIComponent(getDictionary(await getLocale()).errors.docCreateFailed)}`)
  }

  revalidatePath('/docs', 'layout')
  redirect(`/docs/${data.id}`)
}

// Mueve un documento bajo otro padre (o a raíz con null). El trigger DB rechaza
// padre de otro team / auto-padre / ciclo; la RLS exige editor+.
export async function moveDocument(
  id: string,
  newParentId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .update({ parent_id: newParentId })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, error: error.message } // trigger: ciclo/mismo-team
  if (!data || data.length === 0) {
    return { ok: false, error: getDictionary(await getLocale()).errors.noEditPermission }
  }

  revalidatePath('/docs', 'layout')
  return { ok: true }
}

// Persiste el snapshot Yjs (autosave colaborativo). `snapshotB64` =
// Y.encodeStateAsUpdate(doc) en base64; `content` = JSON de bloques denormalizado
// para SSR/listado. CAS+merge garantiza que no se pisan ediciones concurrentes
// (ver lib/yjs/persist). No revalida: el contenido se ve en vivo por Realtime y
// la cache `content` es best-effort. RLS (editor+) es el guard real.
export async function persistYdoc(
  id: string,
  snapshotB64: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const res = await casMergeYdoc(supabase, id, snapshotB64, content)
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

// Guarda el título (LWW). El título no es colaborativo en vivo en Fase 2; cada
// editor lo guarda por su cuenta. RLS (editor+) gatea: 0 filas = sin permiso.
export async function persistTitle(
  id: string,
  title: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .update({ title: title.trim() })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'No tenés permiso para editar este documento.' }
  }

  revalidatePath('/docs')
  revalidatePath(`/docs/${id}`)
  return { ok: true }
}

// Manda el documento a la PAPELERA (soft-delete) junto con su subárbol (cascada
// estilo Notion). Recuperable desde /docs/trash. RLS exige editor+ (viewer → 403).
export async function deleteDocument(id: string) {
  const supabase = await createClient()
  const res = await softDeleteDoc(supabase, id)

  if (!res.ok) {
    redirect(`/docs/${id}?error=${encodeURIComponent(res.error ?? 'No se pudo borrar.')}`)
  }

  revalidatePath('/docs', 'layout')
  revalidatePath('/docs/trash')
  redirect('/docs')
}

// Restaura un doc (y su subárbol) desde la papelera. RLS editor+.
export async function restoreDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const res = await restoreDoc(supabase, id)
  if (res.ok) {
    revalidatePath('/docs', 'layout')
    revalidatePath('/docs/trash')
  }
  return { ok: res.ok, error: res.error }
}

// Borra DEFINITIVAMENTE (hard delete) un doc en papelera (y su subárbol). RLS editor+.
export async function purgeDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const res = await purgeDoc(supabase, id)
  if (res.ok) revalidatePath('/docs/trash')
  return { ok: res.ok, error: res.error }
}

// Búsqueda full-text de documentos visibles. La RLS de `documents` ya limita a los
// equipos donde sos miembro → la búsqueda es multi-equipo y segura sin filtros
// extra. Combina FTS sobre `search_text` (título+contenido, índice GIN) con un
// ILIKE de título (cubre prefijos "as you type" que websearch no matchea).
// Dedupe por id, top 20. Se llama desde el cliente (debounced).
export async function searchDocuments(rawQuery: string): Promise<SearchResult[]> {
  const q = rawQuery.trim()
  if (q.length < 2) return []

  const supabase = await createClient()
  const fields = 'id, title, teams(name), updated_at'

  const [fts, byTitle] = await Promise.all([
    supabase
      .from('documents')
      .select(fields)
      .is('deleted_at', null)
      .textSearch('search_text', q, { type: 'websearch', config: 'simple' })
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('documents')
      .select(fields)
      .is('deleted_at', null)
      .ilike('title', `%${q}%`)
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  type Row = { id: string; title: string; teams: { name: string } | null }
  const seen = new Set<string>()
  const out: SearchResult[] = []
  for (const row of [
    ...((fts.data ?? []) as unknown as Row[]),
    ...((byTitle.data ?? []) as unknown as Row[]),
  ]) {
    if (seen.has(row.id) || out.length >= 20) continue
    seen.add(row.id)
    out.push({ id: row.id, title: row.title, team: row.teams?.name ?? '' })
  }
  return out
}
