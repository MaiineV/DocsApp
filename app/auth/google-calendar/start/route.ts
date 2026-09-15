import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/user'
import {
  buildAuthUrl,
  CALLBACK_PATH,
  isGoogleConfigured,
  OAUTH_STATE_COOKIE,
  siteOrigin,
} from '@/lib/calendar/oauth'

// Starts the Google Calendar OAuth flow for the signed-in user.
export async function GET(request: Request): Promise<Response> {
  const origin = siteOrigin(request)
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login?next=/profile/calendar', origin))
  }
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL('/profile/calendar?google=unconfigured', origin))
  }

  const state = randomBytes(24).toString('base64url')
  const res = NextResponse.redirect(buildAuthUrl(`${origin}${CALLBACK_PATH}`, state))
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/auth/google-calendar',
    maxAge: 600,
  })
  return res
}
