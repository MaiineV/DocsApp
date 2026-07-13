'use server'

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { getActiveTeam } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { casMergeYdoc } from '@/lib/yjs/persist'
import { softDeleteDoc, restoreDoc, purgeDoc } from '@/lib/trash'
import { restoreVersion } from '@/lib/versions'
import { positionAfter, POSITION_GAP } from '@/lib/doc-position'
import { toCommentUser, type CommentUser } from '@/lib/comments'
import type { SearchResult, TeamMember } from '@/lib/types'

// Crea un documento vacío y abre el editor. Si `parentId` viene, el doc es hijo
// de ese (y hereda su team — el trigger exige mismo team); si no, va al team
// activo como raíz. El team_id se deriva del server; RLS + trigger lo validan.
// `idempotencyKey`: un doble-submit con la misma key NO crea dos — el índice
// único (created_by, key) lo dedupea y abrimos el doc ya creado.
export async function createDocument(parentId: string | null = null, idempotencyKey?: string) {
  const supabase = await createClient()
  const user = await getAuthUser()
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

// Mueve un documento bajo otro padre (o a raíz con null), ubicándolo justo
// DESPUÉS del hermano `afterId` (null = primer lugar). La posición se calcula
// server-side (midpoint entre vecinos) → robusto ante árboles stale del cliente;
// si el gap float64 se agota, renormaliza vía RPC y recalcula. El trigger DB
// rechaza padre de otro team / auto-padre / ciclo; la RLS exige editor+ (0 filas
// = sin permiso). OJO share: mover un doc adentro/afuera de una raíz compartida
// con subpáginas lo publica/despublica (get_shared_tree recorre parent_id).
export async function moveDocument(
  id: string,
  newParentId: string | null,
  afterId: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from('documents')
    .select('team_id')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return { ok: false, error: t.errors.docMoveFailed }
  const teamId = doc.team_id as string

  const fetchSiblings = async () => {
    let q = supabase
      .from('documents')
      .select('id, position')
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .neq('id', id)
      .order('position', { ascending: true })
    q = newParentId === null ? q.is('parent_id', null) : q.eq('parent_id', newParentId)
    const { data } = await q
    return (data ?? []) as { id: string; position: number }[]
  }

  let siblings = await fetchSiblings()
  let position = positionAfter(siblings, afterId)
  if (position === null) {
    // Gap float64 agotado en ese hueco → renormalizar el grupo y recalcular.
    await supabase.rpc('resequence_sibling_positions', {
      p_team_id: teamId,
      p_parent_id: newParentId,
    })
    siblings = await fetchSiblings()
    position = positionAfter(siblings, afterId) ?? (siblings.length + 1) * POSITION_GAP
  }

  const { data, error } = await supabase
    .from('documents')
    .update({ parent_id: newParentId, position })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, error: error.message } // trigger: ciclo/mismo-team
  if (!data || data.length === 0) {
    return { ok: false, error: t.errors.noEditPermission }
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
// SIN revalidatePath: en Next 16 cualquier revalidate desde una action purga
// TODO el Client Cache (comportamiento temporal documentado) y esta action
// dispara por tipeo → mataba el prefetch warm de la navegación instantánea.
// La sidebar del editor se refresca client-side vía DocTitleProvider; otros
// usuarios ven el rename en su próxima navegación (igual que antes: el
// revalidate nunca propagó nada cross-cliente).
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
    return { ok: false, error: getDictionary(await getLocale()).errors.noEditPermission }
  }

  return { ok: true }
}

// Guarda el emoji/ícono del doc (LWW, mismo patrón que persistTitle). null =
// quitar ícono. RLS (editor+) gatea: 0 filas = sin permiso.
export async function persistIcon(
  id: string,
  icon: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const value = icon?.trim() || null
  if (value && value.length > 16) {
    return { ok: false, error: getDictionary(await getLocale()).errors.noEditPermission }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .update({ icon: value })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: getDictionary(await getLocale()).errors.noEditPermission }
  }

  revalidatePath('/docs', 'layout')
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
  const fields = 'id, title, icon, teams(name), updated_at'

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

  type Row = { id: string; title: string; icon: string | null; teams: { name: string } | null }
  const seen = new Set<string>()
  const out: SearchResult[] = []
  for (const row of [
    ...((fts.data ?? []) as unknown as Row[]),
    ...((byTitle.data ?? []) as unknown as Row[]),
  ]) {
    if (seen.has(row.id) || out.length >= 20) continue
    seen.add(row.id)
    out.push({ id: row.id, title: row.title, icon: row.icon, team: row.teams?.name ?? '' })
  }
  return out
}

// Resuelve autores de comentarios (id → nombre + avatar) para el UI de hilos de
// BlockNote (`resolveUsers`). Se llama desde el editor (cliente) con los ids de los
// autores; el `UserStore` de BlockNote cachea, así que corre pocas veces. Seguro:
// el select a `documents` está gateado por RLS (hay que ser miembro para ver el
// doc) y `list_team_members` por `is_team_member`; solo devuelve username+avatar.
export async function resolveDocUsers(
  docId: string,
  userIds: string[],
): Promise<CommentUser[]> {
  if (userIds.length === 0) return []

  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('documents')
    .select('team_id')
    .eq('id', docId)
    .maybeSingle()
  if (!doc) return []

  const { data: members } = await supabase.rpc('list_team_members', {
    p_team_id: doc.team_id as string,
  })
  const want = new Set(userIds)
  return ((members ?? []) as TeamMember[])
    .filter((m) => want.has(m.user_id))
    .map(toCommentUser)
}

// ---------------------------------------------------------------------------
// Links view-only públicos (Notion "Share to web", Fase 12).
// ---------------------------------------------------------------------------

type ShareResult = { ok: boolean; error?: string; token?: string }

// Crea (o actualiza el scope de) el link público de un doc. Idempotente: si ya hay
// uno activo lo reusa (actualizando include_subpages si cambió) y devuelve su token
// — así el toggle "incluir subpáginas" del diálogo llama a esta misma action. El
// token de 256 bits vive crudo en la URL (es el secreto). RLS `document_shares`
// exige editor+ (un viewer recibe un error de policy). Devuelve el token para que
// el cliente arme el link con su origin.
export async function createShareLink(
  docId: string,
  includeSubpages: boolean,
): Promise<ShareResult> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }

  // ¿Ya hay un link activo? Reusarlo (idempotente), ajustando el scope si cambió.
  const { data: existing } = await supabase
    .from('document_shares')
    .select('id, token, include_subpages')
    .eq('document_id', docId)
    .is('revoked_at', null)
    .maybeSingle()
  if (existing) {
    if ((existing.include_subpages as boolean) !== includeSubpages) {
      await supabase
        .from('document_shares')
        .update({ include_subpages: includeSubpages })
        .eq('id', existing.id as string)
    }
    revalidatePath(`/docs/${docId}`)
    return { ok: true, token: existing.token as string }
  }

  const token = randomBytes(32).toString('base64url')
  const { data, error } = await supabase
    .from('document_shares')
    .insert({
      document_id: docId,
      token,
      include_subpages: includeSubpages,
      created_by: user.id,
    })
    .select('token')

  if (error) {
    // Carrera: otro submit creó el link entre el check y el insert (índice único
    // parcial activo) → devolver el que quedó.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('document_shares')
        .select('token')
        .eq('document_id', docId)
        .is('revoked_at', null)
        .maybeSingle()
      if (raced) {
        revalidatePath(`/docs/${docId}`)
        return { ok: true, token: raced.token as string }
      }
    }
    return { ok: false, error: t.errors.noSharePermission }
  }
  if (!data || data.length === 0) return { ok: false, error: t.errors.noSharePermission }

  revalidatePath(`/docs/${docId}`)
  return { ok: true, token: (data[0] as { token: string }).token }
}

// Revoca (desactiva) el link público de un doc. Soft: set revoked_at → el link da
// 404 y re-compartir genera un token nuevo. RLS exige editor+ (0 filas = sin permiso).
export async function revokeShareLink(docId: string): Promise<ShareResult> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('document_id', docId)
    .is('revoked_at', null)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: t.errors.noSharePermission }

  revalidatePath(`/docs/${docId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Historial de versiones (Fase 14).
// ---------------------------------------------------------------------------

// Restaura un documento al estado de una versión del historial. No destructivo:
// restoreVersion checkpointea el estado actual antes de pisarlo. El JWT de la
// sesión va solo como Bearer del broadcast Realtime best-effort (mismo modelo
// de confianza que el provider del editor); la authz real es RLS.
export async function restoreDocVersion(
  docId: string,
  versionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const t = getDictionary(await getLocale())
  const user = await getAuthUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }

  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const res = await restoreVersion(supabase, session?.access_token ?? '', user.id, docId, versionId)
  if (!res.ok) return { ok: false, error: res.error ?? t.versions.restoreError }

  revalidatePath(`/docs/${docId}`)
  revalidatePath(`/docs/${docId}/versions`)
  if (res.titleChanged) revalidatePath('/docs', 'layout') // el título vive en la sidebar
  return { ok: true }
}
