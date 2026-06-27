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

// Sube el avatar y guarda su URL. El upload va por fetch directo al endpoint de
// Storage con el bearer token del usuario (ver más abajo), porque supabase-js NO
// propaga el token a su sub-cliente de Storage. Devuelve la URL pública.
export async function uploadAvatar(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const [
    {
      data: { user },
    },
    {
      data: { session },
    },
  ] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()])
  if (!user || !session) return { ok: false, error: t.errors.notAuthenticated }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: t.profile.avatarType }
  if (!file.type.startsWith('image/')) return { ok: false, error: t.profile.avatarType }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: t.profile.avatarTooBig }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`

  // Upload por fetch directo al endpoint de Storage con el bearer token del
  // usuario. supabase-js NO pasa el token a su sub-cliente de Storage (va con la
  // anon key → auth.uid() null → la RLS rechaza); con el header explícito, Storage
  // ve al usuario y la policy de carpeta propia <uid>/ pasa. El header no lo pisa
  // ninguna capa intermedia.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const res = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Content-Type': file.type,
      'x-upsert': 'true',
    },
    body: file,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return { ok: false, error: detail || `Upload ${res.status}` }
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${path}`
  const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  revalidatePath('/profile')
  return { ok: true, url: publicUrl }
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
