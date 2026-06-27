'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveTeam } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { casMergeYdoc } from '@/lib/yjs/persist'

// Crea un documento vacío y abre el editor. Si `parentId` viene, el doc es hijo
// de ese (y hereda su team — el trigger exige mismo team); si no, va al team
// activo como raíz. El team_id se deriva del server; RLS + trigger lo validan.
export async function createDocument(parentId: string | null = null) {
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
    .insert({ team_id: teamId, created_by: user.id, title: '', parent_id: parentId })
    .select('id')
    .single()

  if (error || !data) {
    const msg = error?.message ?? getDictionary(await getLocale()).errors.docCreateFailed
    redirect(`/docs?error=${encodeURIComponent(msg)}`)
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

// Borra el documento. RLS exige rol editor o superior. Los hijos NO se borran:
// suben a raíz (parent_id pasa a null por ON DELETE SET NULL).
export async function deleteDocument(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('documents').delete().eq('id', id)

  if (error) {
    redirect(`/docs/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/docs', 'layout')
  redirect('/docs')
}
