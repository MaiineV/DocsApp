'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/next'

// Preserva `next` (saneado) en la URL de error para no perderlo si falla.
function withNext(path: string, params: Record<string, string>, next: string): string {
  const sp = new URLSearchParams(params)
  if (next !== '/docs') sp.set('next', next)
  return `${path}?${sp.toString()}`
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next') as string | null)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(withNext('/login', { error: error.message }, next))
  }
  redirect(next)
}

export async function signup(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next') as string | null)

  const supabase = await createClient()

  // origin para el link de confirmación por email (PKCE → /auth/callback).
  const h = await headers()
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? h.get('origin') ?? `https://${h.get('host')}`
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  })

  if (error) {
    redirect(withNext('/signup', { error: error.message }, next))
  }

  // Con "Confirm email" ON, signUp NO crea sesión: hay que confirmar por mail.
  // (Si estuviera OFF, data.session vendría seteada y entramos directo.)
  if (!data.session) {
    redirect(withNext('/signup', { pending: '1' }, next))
  }
  redirect(next)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
