'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getMyTeams, ACTIVE_TEAM_COOKIE, activeTeamCookieOptions } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'

// Crea el primer (o un nuevo) team con el usuario como owner, vía la RPC
// SECURITY DEFINER que resuelve el bootstrap respetando RLS. Deja el team nuevo
// como activo para que el usuario caiga adentro.
export async function createTeam(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const t = getDictionary(await getLocale())
  if (!name) {
    redirect(`/onboarding?error=${encodeURIComponent(t.errors.teamNameRequired)}`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_team_with_owner', { p_name: name })

  if (error || !data) {
    redirect(`/onboarding?error=${encodeURIComponent(error?.message ?? t.errors.createTeamFailed)}`)
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_TEAM_COOKIE, (data as { id: string }).id, activeTeamCookieOptions())

  revalidatePath('/', 'layout')
  redirect('/docs')
}

// Cambia el team activo (cookie). Valida que el usuario sea miembro (getMyTeams
// está filtrado por RLS). Si el id no es suyo, no hace nada y vuelve a /docs.
export async function setActiveTeam(teamId: string) {
  const teams = await getMyTeams()
  if (teams.some((t) => t.id === teamId)) {
    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_TEAM_COOKIE, teamId, activeTeamCookieOptions())
    revalidatePath('/', 'layout')
  }
  redirect('/docs')
}
