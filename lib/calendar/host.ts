import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { decryptToken, encryptToken } from '@/lib/calendar/crypto'
import { refreshAccessToken } from '@/lib/calendar/oauth'

// Access tokens for Google calls. Two flavours:
// - the team host's token (any member may trigger a sync; credentials come back
//   encrypted from a member-gated RPC and are decrypted here);
// - the current user's own token (connect / host / share flows).

const EXPIRY_MARGIN_MS = 60_000

type EncryptedCreds = {
  refresh_token_enc: string
  access_token_enc: string | null
  access_expires_at: string | null
}

async function ensureAccessToken(
  creds: EncryptedCreds,
  persist: (accessEnc: string, expiresAt: Date) => Promise<void>,
): Promise<string> {
  if (creds.access_token_enc && creds.access_expires_at) {
    if (new Date(creds.access_expires_at).getTime() - EXPIRY_MARGIN_MS > Date.now()) {
      return decryptToken(creds.access_token_enc)
    }
  }
  const { accessToken, expiresAt } = await refreshAccessToken(decryptToken(creds.refresh_token_enc))
  await persist(encryptToken(accessToken), expiresAt)
  return accessToken
}

export type TeamCalendarLink = {
  host_user_id: string
  host_email: string
  google_calendar_id: string
  sync_token: string | null
  last_synced_at: string | null
  refresh_token_enc: string
  access_token_enc: string | null
  access_expires_at: string | null
}

// Raw link + encrypted credentials of the team's host. Null if not hosted.
export const getTeamCalendarLink = cache(async (teamId: string): Promise<TeamCalendarLink | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_team_calendar_credentials', { p_team_id: teamId })
  if (error?.code === '42501') return null
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as TeamCalendarLink[]
  return rows[0] ?? null
})

export type HostContext = {
  teamId: string
  hostUserId: string
  hostEmail: string
  calendarId: string
  syncToken: string | null
  lastSyncedAt: string | null
  accessToken: string
}

export const getHostContext = cache(async (teamId: string): Promise<HostContext | null> => {
  const link = await getTeamCalendarLink(teamId)
  if (!link) return null
  const supabase = await createClient()
  const accessToken = await ensureAccessToken(link, async (accessEnc, expiresAt) => {
    const { error } = await supabase.rpc('store_google_access_token', {
      p_team_id: teamId,
      p_access_enc: accessEnc,
      p_expires_at: expiresAt.toISOString(),
    })
    if (error) throw new Error(error.message)
  })
  return {
    teamId,
    hostUserId: link.host_user_id,
    hostEmail: link.host_email,
    calendarId: link.google_calendar_id,
    syncToken: link.sync_token,
    lastSyncedAt: link.last_synced_at,
    accessToken,
  }
})

export type OwnConnection = { userId: string; googleEmail: string; accessToken: string }

// The current user's own Google connection with a valid access token. Null if
// they never connected.
export const getOwnConnection = cache(async (): Promise<OwnConnection | null> => {
  const user = await getAuthUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('google_connections')
    .select('google_email, refresh_token_enc, access_token_enc, access_expires_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!data) return null
  const creds = data as EncryptedCreds & { google_email: string }
  const accessToken = await ensureAccessToken(creds, async (accessEnc, expiresAt) => {
    await supabase
      .from('google_connections')
      .update({ access_token_enc: accessEnc, access_expires_at: expiresAt.toISOString() })
      .eq('user_id', user.id)
  })
  return { userId: user.id, googleEmail: creds.google_email, accessToken }
})
