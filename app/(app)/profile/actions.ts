'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { getDictionary, getLocale } from '@/lib/i18n'

type Result = { ok: boolean; error?: string }

// Setea/cambia el nickname del usuario actual (el row de profiles existe por el
// trigger/backfill). RLS: solo el propio perfil.
export async function updateProfile(nickname: string): Promise<Result> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const user = await getAuthUser()
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

// (La subida de foto de perfil quedó diferida: storage-api no autentica el token
// del usuario en uploads y se optó por no usar la service role key por ahora. El
// avatar se muestra como inicial con color; el backend de Storage queda listo.)

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
