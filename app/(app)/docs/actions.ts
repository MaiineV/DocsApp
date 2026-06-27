'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveTeam } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { casMergeYdoc } from '@/lib/yjs/persist'

// Crea un documento vacío en el team activo y abre el editor.
// El team_id se deriva del server (no del cliente); RLS igual lo valida.
export async function createDocument() {
  const team = await getActiveTeam()
  if (!team) redirect('/onboarding')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // title vacío → la UI muestra el "Sin título"/"Untitled" localizado.
  const { data, error } = await supabase
    .from('documents')
    .insert({ team_id: team.id, created_by: user.id, title: '' })
    .select('id')
    .single()

  if (error || !data) {
    const msg = error?.message ?? getDictionary(await getLocale()).errors.docCreateFailed
    redirect(`/docs?error=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/docs')
  redirect(`/docs/${data.id}`)
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

// Borra el documento. RLS exige rol editor o superior.
export async function deleteDocument(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('documents').delete().eq('id', id)

  if (error) {
    redirect(`/docs/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/docs')
  redirect('/docs')
}
