'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDictionary, getLocale } from '@/lib/i18n'
import type { Role } from '@/lib/types'

type Result = { ok: boolean; error?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Crea (o re-crea, rotando el token) una invitación. El token de 256 bits se
// genera en el server. invited_by debe ser el llamante (lo exige la RLS). Upsert
// sobre (team_id,email): re-invitar invalida el link viejo. Devuelve el token
// para que el cliente arme el link con su origin.
export async function createInvitation(
  teamId: string,
  email: string,
  role: Role,
  ttlDays: number,
): Promise<Result & { token?: string }> {
  const t = getDictionary(await getLocale())
  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalizedEmail) || normalizedEmail.length > 320) {
    return { ok: false, error: t.errors.invalidEmail }
  }
  if (role === 'owner') return { ok: false, error: t.errors.noOwnerInvite }

  const ttl = Math.min(Math.max(Math.round(ttlDays) || 7, 1), 30)
  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000).toISOString()
  const token = randomBytes(32).toString('hex')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }

  const { data, error } = await supabase
    .from('invitations')
    .upsert(
      {
        team_id: teamId,
        email: normalizedEmail,
        role,
        token,
        invited_by: user.id,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'team_id,email' },
    )
    .select('token')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: t.errors.noInvitePermission }
  }

  revalidatePath(`/teams/${teamId}`)
  return { ok: true, token: (data[0] as { token: string }).token }
}

// Revoca (borra) una invitación pendiente. RLS: admin+ del team.
export async function revokeInvitation(teamId: string, invitationId: string): Promise<Result> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', invitationId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: getDictionary(await getLocale()).errors.noRevokePermission }
  }

  revalidatePath(`/teams/${teamId}`)
  return { ok: true }
}

// Cambia el rol de un miembro. La RLS (memberships_update: admin+, y owner solo
// lo asigna un owner) + el trigger del último owner son el guard real: si la
// operación no está permitida, el UPDATE afecta 0 filas o el trigger lanza error.
export async function changeMemberRole(
  teamId: string,
  userId: string,
  role: Role,
): Promise<Result> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .update({ role })
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('user_id')

  if (error) return { ok: false, error: error.message } // p.ej. trigger del último owner
  if (!data || data.length === 0) {
    return { ok: false, error: getDictionary(await getLocale()).errors.noRolePermission }
  }

  revalidatePath(`/teams/${teamId}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}

// Remueve un miembro del team. RLS: admin+ remueve a otros; cualquiera puede
// removerse a sí mismo. El trigger impide dejar el team sin owner.
export async function removeMember(teamId: string, userId: string): Promise<Result> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('user_id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: getDictionary(await getLocale()).errors.noRemovePermission }
  }

  revalidatePath(`/teams/${teamId}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}
