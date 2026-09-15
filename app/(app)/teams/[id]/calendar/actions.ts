'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { getDictionary, getLocale } from '@/lib/i18n'
import { getHostContext } from '@/lib/calendar/host'
import { pushDelete, pushEvent } from '@/lib/calendar/sync'
import type { EventKind } from '@/lib/types'

type Result = { ok: boolean; error?: string }

export type EventInput = {
  teamId: string
  title: string
  description: string
  kind: EventKind
  all_day: boolean
  starts_at: string
  ends_at: string
}

const EventSchema = z
  .object({
    teamId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000),
    kind: z.enum(['event', 'deadline']),
    all_day: z.boolean(),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
  })
  .refine((v) => Date.parse(v.ends_at) >= Date.parse(v.starts_at), { path: ['ends_at'] })

const EVENT_COLUMNS = 'id, team_id, title, description, kind, all_day, starts_at, ends_at, google_event_id'

type EventRow = z.infer<typeof EventSchema> & { id: string; team_id: string; google_event_id: string | null }

function revalidate(teamId: string) {
  revalidatePath(`/teams/${teamId}/calendar`)
  revalidatePath('/profile/calendar')
}

// Upload to the team's Google calendar once the response is sent. A failure
// leaves the row pending and the next sync retries it.
function schedulePush(row: EventRow) {
  after(async () => {
    const host = await getHostContext(row.team_id)
    if (host) await pushEvent(host, row)
  })
}

// RLS: editor+ of the team (insert fails with 0 rows otherwise).
export async function createEvent(input: EventInput): Promise<Result & { id?: string }> {
  const t = getDictionary(await getLocale())
  const parsed = EventSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t.calendar.invalidEvent }
  const user = await getAuthUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }

  const { teamId, ...fields } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('team_events')
    .insert({ team_id: teamId, created_by: user.id, ...fields })
    .select(EVENT_COLUMNS)
    .single()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: t.errors.noEventPermission }

  schedulePush(data as EventRow)
  revalidate(teamId)
  return { ok: true, id: (data as EventRow).id }
}

export async function updateEvent(id: string, input: EventInput): Promise<Result> {
  const t = getDictionary(await getLocale())
  const parsed = EventSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: t.calendar.invalidEvent }

  const { teamId, ...fields } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('team_events')
    .update(fields)
    .eq('id', id)
    .eq('team_id', teamId)
    .select(EVENT_COLUMNS)
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: t.errors.noEventPermission }

  schedulePush(data[0] as EventRow)
  revalidate(teamId)
  return { ok: true }
}

// Google first, then the row: a ghost left in Google would come back on the
// next pull as a new event.
export async function deleteEvent(id: string): Promise<Result> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('team_events')
    .select('id, team_id, google_event_id')
    .eq('id', id)
    .maybeSingle()
  if (!row) return { ok: false, error: t.errors.noEventPermission }
  const ev = row as { id: string; team_id: string; google_event_id: string | null }

  if (ev.google_event_id) {
    try {
      const host = await getHostContext(ev.team_id)
      if (host) await pushDelete(host, ev.google_event_id)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : t.calendar.deleteError }
    }
  }

  const { data, error } = await supabase.from('team_events').delete().eq('id', id).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: t.errors.noEventPermission }

  revalidate(ev.team_id)
  return { ok: true }
}
