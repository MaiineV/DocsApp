'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getDictionary, getLocale } from '@/lib/i18n'
import { ACTIVE_TEAM_COOKIE, activeTeamCookieOptions } from '@/lib/teams'

// Acepta la invitación (POST, nunca GET → un preview/unfurl no la consume).
// La RPC valida token + email del llamante; acá solo dejamos el team nuevo como
// activo y caemos adentro. En error (mismatch/expirada/usada) volvemos a la
// página con el mensaje.
export async function acceptInvitation(token: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })

  if (error) {
    // El RPC lanza con errcode P0003 (expirada) / P0004 (otro email) / P0002 (usada).
    const e = getDictionary(await getLocale()).errors
    const msg =
      error.code === 'P0003'
        ? e.inviteExpired
        : error.code === 'P0004'
          ? e.inviteWrongEmail
          : e.inviteInvalid
    redirect(`/invite/${token}?error=${encodeURIComponent(msg)}`)
  }

  const teamId = data as string | null
  if (teamId) {
    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_TEAM_COOKIE, teamId, activeTeamCookieOptions())
  }

  revalidatePath('/', 'layout')
  redirect('/docs')
}

// Mismatch de email: cerrar sesión y volver a este mismo invite tras loguear con
// la cuenta correcta (preserva el link vía ?next).
export async function switchAccount(token: string) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)
}
