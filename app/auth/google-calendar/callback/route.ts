import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { encryptToken } from '@/lib/calendar/crypto'
import {
  CALLBACK_PATH,
  exchangeCode,
  fetchGoogleEmail,
  OAUTH_STATE_COOKIE,
  siteOrigin,
} from '@/lib/calendar/oauth'

function back(origin: string, status: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/profile/calendar?google=${status}`, origin))
  res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: '/auth/google-calendar' })
  return res
}

// Google redirects here with `code` + `state`. Stores the (encrypted) refresh
// token for the signed-in DocsApp user.
export async function GET(request: Request): Promise<Response> {
  const origin = siteOrigin(request)
  const url = new URL(request.url)
  const user = await getAuthUser()
  if (!user) return NextResponse.redirect(new URL('/login?next=/profile/calendar', origin))

  const cookieHeader = request.headers.get('cookie') ?? ''
  const expected = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  if (url.searchParams.get('error') || !code || !state || !expected || state !== expected) {
    return back(origin, 'denied')
  }

  try {
    const tokens = await exchangeCode(code, `${origin}${CALLBACK_PATH}`)
    if (!tokens.refresh_token) return back(origin, 'no_refresh')
    const email = await fetchGoogleEmail(tokens.access_token)
    if (!email) return back(origin, 'error')

    const supabase = await createClient()
    const { error } = await supabase.from('google_connections').upsert(
      {
        user_id: user.id,
        google_email: email,
        refresh_token_enc: encryptToken(tokens.refresh_token),
        access_token_enc: encryptToken(tokens.access_token),
        access_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope ?? '',
      },
      { onConflict: 'user_id' },
    )
    if (error) return back(origin, 'error')
    return back(origin, 'connected')
  } catch (e) {
    console.error('[calendar] oauth callback failed', e instanceof Error ? e.message : e)
    return back(origin, 'error')
  }
}
