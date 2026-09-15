'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { getMyTeams } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { decryptToken } from '@/lib/calendar/crypto'
import { teamColor } from '@/lib/calendar/colors'
import { getHostContext, getOwnConnection } from '@/lib/calendar/host'
import { revokeToken } from '@/lib/calendar/oauth'
import { createCalendar, deleteAcl, insertAcl, setCalendarColor } from '@/lib/calendar/google-client'
import { syncTeam, syncTeams } from '@/lib/calendar/sync'

type Result = { ok: boolean; error?: string }

function revalidate(teamId?: string) {
  revalidatePath('/profile/calendar')
  if (teamId) revalidatePath(`/teams/${teamId}/calendar`)
}

function message(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

// Revoke at Google (best effort) and drop the row. FKs cascade: hosted teams are
// unhosted and their shares removed.
export async function disconnectGoogle(): Promise<Result> {
  const t = getDictionary(await getLocale())
  const user = await getAuthUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }
  const supabase = await createClient()

  const { data } = await supabase
    .from('google_connections')
    .select('refresh_token_enc')
    .eq('user_id', user.id)
    .maybeSingle()
  if (data) {
    try {
      await revokeToken(decryptToken((data as { refresh_token_enc: string }).refresh_token_enc))
    } catch {
      // key rotated or token unreadable: still disconnect locally
    }
  }
  const { error } = await supabase.from('google_connections').delete().eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }
  revalidate()
  return { ok: true }
}

// Owner only (RLS on team_calendar_links). Creates the secondary calendar in the
// owner's Google account and uploads the team's existing events.
export async function hostTeamCalendar(teamId: string, timeZone: string): Promise<Result> {
  const t = getDictionary(await getLocale())
  const [teams, own] = await Promise.all([getMyTeams(), getOwnConnection()])
  const team = teams.find((x) => x.id === teamId)
  if (!team || team.role !== 'owner') return { ok: false, error: t.google.ownerOnly }
  if (!own) return { ok: false, error: t.google.notConnected }

  const tz = /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(timeZone) ? timeZone : 'UTC'
  let calendarId: string
  try {
    const cal = await createCalendar(own.accessToken, `DocsApp · ${team.name}`, tz)
    calendarId = cal.id
    await setCalendarColor(own.accessToken, calendarId, teamColor(team)).catch(() => undefined)
  } catch (e) {
    return { ok: false, error: message(e, t.google.hostError) }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('team_calendar_links')
    .insert({ team_id: teamId, host_user_id: own.userId, google_calendar_id: calendarId })
  if (error) return { ok: false, error: error.message }

  await syncTeam(teamId, { force: true })
  revalidate(teamId)
  return { ok: true }
}

// Host only (RLS). The Google calendar is left untouched; local rows forget
// their Google ids so a later re-host uploads them to the new calendar.
export async function unhostTeamCalendar(teamId: string): Promise<Result> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('team_calendar_links')
    .delete()
    .eq('team_id', teamId)
    .select('team_id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: t.google.hostOnly }

  await supabase
    .from('team_events')
    .update({ google_event_id: null, google_updated_at: null, synced_at: null })
    .eq('team_id', teamId)
  revalidate(teamId)
  return { ok: true }
}

// Share the host's calendar with the caller's Google account (ACL writer).
export async function shareTeamCalendarWithMe(teamId: string): Promise<Result> {
  const t = getDictionary(await getLocale())
  const [own, host] = await Promise.all([getOwnConnection(), getHostContext(teamId).catch(() => null)])
  if (!own) return { ok: false, error: t.google.notConnected }
  if (!host) return { ok: false, error: t.google.notHosted }
  if (host.hostUserId === own.userId) return { ok: true }

  let aclId: string
  try {
    const acl = await insertAcl(host.accessToken, host.calendarId, own.googleEmail, 'writer')
    aclId = acl.id
  } catch (e) {
    return { ok: false, error: message(e, t.google.shareError) }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('team_calendar_shares')
    .upsert({ team_id: teamId, user_id: own.userId, google_acl_id: aclId }, { onConflict: 'team_id,user_id' })
  if (error) return { ok: false, error: error.message }
  revalidate(teamId)
  return { ok: true }
}

export async function unshareTeamCalendarWithMe(teamId: string): Promise<Result> {
  const t = getDictionary(await getLocale())
  const user = await getAuthUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }
  const supabase = await createClient()

  const { data } = await supabase
    .from('team_calendar_shares')
    .select('google_acl_id')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!data) return { ok: true }

  try {
    const host = await getHostContext(teamId)
    if (host) await deleteAcl(host.accessToken, host.calendarId, (data as { google_acl_id: string }).google_acl_id)
  } catch (e) {
    return { ok: false, error: message(e, t.google.shareError) }
  }

  const { error } = await supabase
    .from('team_calendar_shares')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }
  revalidate(teamId)
  return { ok: true }
}

// Forced sync of one team, or of every hosted team the user belongs to.
export async function syncNow(teamId: string | null): Promise<Result> {
  const t = getDictionary(await getLocale())
  if (teamId) {
    const out = await syncTeam(teamId, { force: true })
    revalidate(teamId)
    if (out.status === 'error') return { ok: false, error: out.message }
    if (out.status === 'skipped' && out.reason === 'not_hosted') return { ok: false, error: t.google.notHosted }
    return { ok: true }
  }
  const teams = await getMyTeams()
  await syncTeams(
    teams.map((x) => x.id),
    { force: true },
  )
  revalidate()
  return { ok: true }
}
