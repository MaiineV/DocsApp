import { createClient } from '@/lib/supabase/server'
import { getHostContext, getTeamCalendarLink } from '@/lib/calendar/host'
import { splitSyncItems, toGoogleEvent, type LocalEventInput } from '@/lib/calendar/google-map'
import {
  GoogleApiError,
  deleteEvent as gDeleteEvent,
  insertEvent as gInsertEvent,
  listEvents,
  updateEvent as gUpdateEvent,
} from '@/lib/calendar/google-client'
import type { TeamEvent } from '@/lib/types'

// Two-way sync between a team's events and its Google calendar (hosted by an
// owner). Pull is incremental (syncToken); push covers rows never uploaded or
// edited after their last sync. Safe to call from any member: RLS-sensitive
// writes go through member-gated RPCs.

export const SYNC_THROTTLE_MS = 60_000

export type SyncOutcome =
  | { status: 'skipped'; reason: 'not_hosted' | 'throttled' }
  | { status: 'ok'; pulled: number; pushed: number }
  | { status: 'error'; message: string }

type PendingRow = Pick<
  TeamEvent,
  'id' | 'team_id' | 'title' | 'description' | 'kind' | 'all_day' | 'starts_at' | 'ends_at' | 'google_event_id' | 'updated_at' | 'synced_at'
>

const PENDING_SELECT =
  'id, team_id, title, description, kind, all_day, starts_at, ends_at, google_event_id, updated_at, synced_at'

function isPending(row: PendingRow): boolean {
  if (!row.google_event_id || !row.synced_at) return true
  return new Date(row.updated_at).getTime() > new Date(row.synced_at).getTime()
}

// Push one row (insert or update in Google) and record the result. Returns false
// when Google rejected it; the row stays pending for the next sync.
export async function pushEvent(
  host: { calendarId: string; accessToken: string },
  row: LocalEventInput & { google_event_id: string | null },
): Promise<boolean> {
  const supabase = await createClient()
  const body = toGoogleEvent(row)
  try {
    let g
    if (row.google_event_id) {
      try {
        g = await gUpdateEvent(host.accessToken, host.calendarId, row.google_event_id, body)
      } catch (e) {
        if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) {
          g = await gInsertEvent(host.accessToken, host.calendarId, body)
        } else {
          throw e
        }
      }
    } else {
      g = await gInsertEvent(host.accessToken, host.calendarId, body)
    }
    await supabase.rpc('mark_event_synced', {
      p_event_id: row.id,
      p_google_event_id: g.id,
      p_google_updated_at: g.updated ?? new Date().toISOString(),
    })
    return true
  } catch (e) {
    console.error('[calendar] push failed', row.id, e instanceof Error ? e.message : e)
    return false
  }
}

// Delete in Google. Throws on a real failure so the caller can keep the row and
// avoid re-importing a ghost on the next pull.
export async function pushDelete(
  host: { calendarId: string; accessToken: string },
  googleEventId: string,
): Promise<void> {
  await gDeleteEvent(host.accessToken, host.calendarId, googleEventId)
}

export function changedSomething(outcome: SyncOutcome): boolean {
  return outcome.status === 'ok' && outcome.pulled + outcome.pushed > 0
}

export async function syncTeam(teamId: string, opts: { force?: boolean } = {}): Promise<SyncOutcome> {
  try {
    const link = await getTeamCalendarLink(teamId)
    if (!link) return { status: 'skipped', reason: 'not_hosted' }
    if (
      !opts.force &&
      link.last_synced_at &&
      Date.now() - new Date(link.last_synced_at).getTime() < SYNC_THROTTLE_MS
    ) {
      return { status: 'skipped', reason: 'throttled' }
    }
    const host = await getHostContext(teamId)
    if (!host) return { status: 'skipped', reason: 'not_hosted' }

    const supabase = await createClient()

    // Pull
    let list = await listEvents(host.accessToken, host.calendarId, host.syncToken)
    if (list.fullSyncRequired) list = await listEvents(host.accessToken, host.calendarId, null)
    if (list.fullSyncRequired) throw new Error('Google pidió full sync dos veces')
    const { upserts, deletedIds } = splitSyncItems(list.items)
    const { error: applyError } = await supabase.rpc('apply_google_sync', {
      p_team_id: teamId,
      p_upserts: upserts,
      p_deleted_google_ids: deletedIds,
      p_sync_token: list.nextSyncToken,
    })
    if (applyError) throw new Error(applyError.message)

    // Push pending
    const { data } = await supabase.from('team_events').select(PENDING_SELECT).eq('team_id', teamId)
    const pending = ((data ?? []) as PendingRow[]).filter(isPending)
    let pushed = 0
    for (const row of pending) {
      if (await pushEvent(host, row)) pushed++
    }

    return { status: 'ok', pulled: upserts.length + deletedIds.length, pushed }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[calendar] sync failed', teamId, message)
    return { status: 'error', message }
  }
}

// Sync several teams without letting one failure hide the others.
export async function syncTeams(teamIds: string[], opts: { force?: boolean } = {}): Promise<SyncOutcome[]> {
  const results = await Promise.allSettled(teamIds.map((id) => syncTeam(id, opts)))
  return results.map((r) =>
    r.status === 'fulfilled' ? r.value : { status: 'error', message: String(r.reason) },
  )
}
