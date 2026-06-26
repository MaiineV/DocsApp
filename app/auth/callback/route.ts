import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/auth/next'

// Callback de Supabase Auth (PKCE): confirmación de email, magic links, OAuth.
// Intercambia el `code` por una sesión (setea las cookies) y redirige al `next`
// saneado. El proxy permite /auth sin sesión.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin))
    }
  }

  return NextResponse.redirect(
    new URL('/login?error=' + encodeURIComponent('No se pudo confirmar la sesión'), url.origin),
  )
}
