import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { getTeamCalendarLink } from '@/lib/calendar/host'
import type { CalendarEvent, TeamCalendarStatus, TeamEvent } from '@/lib/types'

const EVENT_SELECT = 'id, team_id, title, description, kind, all_day, starts_at, ends_at'

type EventRow = Pick<TeamEvent, 'id' | 'team_id' | 'title' | 'description' | 'kind' | 'all_day' | 'starts_at' | 'ends_at'>

// Events of one team overlapping [from, to). RLS: members only.
export const listTeamEvents = cache(
  async (teamId: string, from: string, to: string): Promise<EventRow[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('team_events')
      .select(EVENT_SELECT)
      .eq('team_id', teamId)
      .lt('starts_at', to)
      .gt('ends_at', from)
      .order('starts_at', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []) as EventRow[]
  },
)

// Events of every team the user belongs to, overlapping [from, to).
export const listMyEvents = cache(async (from: string, to: string): Promise<CalendarEvent[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('team_events')
    .select(`${EVENT_SELECT}, teams(name, color)`)
    .lt('starts_at', to)
    .gt('ends_at', from)
    .order('starts_at', { ascending: true })
  if (error) throw new Error(error.message)
  type Row = EventRow & { teams: { name: string; color: string | null } | null }
  return ((data ?? []) as unknown as Row[]).map(({ teams, ...ev }) => ({
    ...ev,
    team_name: teams?.name ?? '',
    team_color: teams?.color ?? null,
  }))
})

export const getTeamCalendarStatus = cache(async (teamId: string): Promise<TeamCalendarStatus> => {
  const user = await getAuthUser()
  const supabase = await createClient()
  const [link, { data: share }] = await Promise.all([
    getTeamCalendarLink(teamId),
    user
      ? supabase
          .from('team_calendar_shares')
          .select('team_id')
          .eq('team_id', teamId)
          .eq('user_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  return {
    hosted: link !== null,
    host_user_id: link?.host_user_id ?? null,
    host_email: link?.host_email ?? null,
    last_synced_at: link?.last_synced_at ?? null,
    shared_with_me: share !== null,
  }
})

// Whether the current user connected Google, plus the account email. No tokens.
export const getMyGoogleEmail = cache(async (): Promise<string | null> => {
  const user = await getAuthUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('google_connections')
    .select('google_email')
    .eq('user_id', user.id)
    .maybeSingle()
  return (data as { google_email: string } | null)?.google_email ?? null
})
