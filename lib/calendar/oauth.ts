import { GoogleApiError } from '@/lib/calendar/google-client'

// Google OAuth 2.0 (authorization code, offline access) for the Calendar
// integration. Independent from Supabase Auth: works for email/password accounts.

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar']

export const OAUTH_STATE_COOKIE = 'gcal_oauth_state'
export const CALLBACK_PATH = '/auth/google-calendar/callback'

// Public origin for OAuth redirect URIs (must match the Google Cloud console).
export function siteOrigin(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_TOKEN_ENC_KEY,
  )
}

function clientId(): string {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!id) throw new Error('GOOGLE_OAUTH_CLIENT_ID no configurada.')
  return id
}

function clientSecret(): string {
  const s = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!s) throw new Error('GOOGLE_OAUTH_CLIENT_SECRET no configurada.')
  return s
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', state)
  return url.toString()
}

type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  id_token?: string
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string
    error_description?: string
  }
  if (!res.ok) {
    throw new GoogleApiError(res.status, body.error_description ?? body.error ?? 'token error', body.error ?? null)
  }
  return body
}

export function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  return tokenRequest({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = await tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token',
  })
  return { accessToken: body.access_token, expiresAt: new Date(Date.now() + body.expires_in * 1000) }
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const body = (await res.json()) as { email?: string }
  return body.email ?? null
}

// Best effort: a failed revoke must not block disconnecting locally.
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      cache: 'no-store',
    })
  } catch {
    // ignore
  }
}
