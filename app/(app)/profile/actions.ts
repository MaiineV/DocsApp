'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDictionary, getLocale } from '@/lib/i18n'

type Result = { ok: boolean; error?: string }

// Setea/cambia el nickname del usuario actual (el row de profiles existe por el
// trigger/backfill). RLS: solo el propio perfil.
export async function updateProfile(nickname: string): Promise<Result> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }

  const trimmed = nickname.trim().slice(0, 50)
  const { error } = await supabase
    .from('profiles')
    .update({ nickname: trimmed || null })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/', 'layout')
  revalidatePath('/profile')
  return { ok: true }
}

// Guarda la URL pública del avatar (el archivo ya se subió a Storage desde el
// cliente, a la carpeta propia <uid>/).
export async function updateAvatar(avatarUrl: string): Promise<Result> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl || null })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/', 'layout')
  revalidatePath('/profile')
  return { ok: true }
}

// Cambia la contraseña (solo cuentas con identidad email; la UI no muestra el
// form para cuentas de Google).
export async function changePassword(newPassword: string): Promise<Result> {
  const t = getDictionary(await getLocale())
  if (newPassword.length < 6) return { ok: false, error: t.profile.passwordTooShort }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
