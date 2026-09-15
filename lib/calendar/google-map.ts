import type { EventKind } from '@/lib/types'

// Pure mapping between team_events rows and Google Calendar event resources.
// The kind (event/deadline) travels in extendedProperties so a round trip keeps it.

export type GoogleDateTime = { date?: string; dateTime?: string; timeZone?: string }

export type GoogleEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  start?: GoogleDateTime
  end?: GoogleDateTime
  updated?: string
  colorId?: string
  extendedProperties?: { private?: Record<string, string> }
}

export type GoogleEventInput = {
  summary: string
  description: string
  start: GoogleDateTime
  end: GoogleDateTime
  colorId?: string
  extendedProperties: { private: Record<string, string> }
}

export type LocalEventInput = {
  id: string
  team_id: string
  title: string
  description: string
  kind: EventKind
  all_day: boolean
  starts_at: string
  ends_at: string
}

// Row shape accepted by the apply_google_sync RPC.
export type PulledEvent = {
  google_event_id: string
  title: string
  description: string
  kind: EventKind
  all_day: boolean
  starts_at: string
  ends_at: string
  google_updated_at: string | null
}

const DEADLINE_COLOR_ID = '11' // Google "tomato"
const KIND_KEY = 'docsapp_kind'

export function toGoogleEvent(ev: LocalEventInput): GoogleEventInput {
  const start: GoogleDateTime = ev.all_day
    ? { date: ev.starts_at.slice(0, 10) }
    : { dateTime: ev.starts_at }
  const end: GoogleDateTime = ev.all_day ? { date: ev.ends_at.slice(0, 10) } : { dateTime: ev.ends_at }
  return {
    summary: ev.title,
    description: ev.description,
    start,
    end,
    ...(ev.kind === 'deadline' ? { colorId: DEADLINE_COLOR_ID } : {}),
    extendedProperties: {
      private: { [KIND_KEY]: ev.kind, docsapp_event_id: ev.id, docsapp_team_id: ev.team_id },
    },
  }
}

// Null when the Google event cannot be represented (cancelled, or no usable dates).
export function fromGoogleEvent(g: GoogleEvent): PulledEvent | null {
  if (g.status === 'cancelled' || !g.start || !g.end) return null
  const kind: EventKind = g.extendedProperties?.private?.[KIND_KEY] === 'deadline' ? 'deadline' : 'event'
  const base = {
    google_event_id: g.id,
    title: (g.summary ?? '').trim() || '(sin título)',
    description: g.description ?? '',
    kind,
    google_updated_at: g.updated ?? null,
  }
  if (g.start.date && g.end.date) {
    const starts = Date.parse(`${g.start.date}T00:00:00Z`)
    const ends = Date.parse(`${g.end.date}T00:00:00Z`)
    if (Number.isNaN(starts) || Number.isNaN(ends)) return null
    return {
      ...base,
      all_day: true,
      starts_at: new Date(starts).toISOString(),
      ends_at: new Date(Math.max(ends, starts + 86_400_000)).toISOString(),
    }
  }
  if (g.start.dateTime && g.end.dateTime) {
    const starts = Date.parse(g.start.dateTime)
    const ends = Date.parse(g.end.dateTime)
    if (Number.isNaN(starts) || Number.isNaN(ends)) return null
    return {
      ...base,
      all_day: false,
      starts_at: new Date(starts).toISOString(),
      ends_at: new Date(Math.max(ends, starts)).toISOString(),
    }
  }
  return null
}

// Partition an incremental sync page into rows to upsert and ids to delete.
export function splitSyncItems(items: readonly GoogleEvent[]): {
  upserts: PulledEvent[]
  deletedIds: string[]
} {
  const upserts: PulledEvent[] = []
  const deletedIds: string[] = []
  for (const g of items) {
    if (g.status === 'cancelled') {
      deletedIds.push(g.id)
      continue
    }
    const row = fromGoogleEvent(g)
    if (row) upserts.push(row)
  }
  return { upserts, deletedIds }
}
