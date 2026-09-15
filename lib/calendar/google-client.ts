import type { GoogleEvent, GoogleEventInput } from '@/lib/calendar/google-map'

// Thin fetch wrapper over the Google Calendar v3 REST API. Server-only.

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

export class GoogleApiError extends Error {
  status: number
  reason: string | null
  constructor(status: number, message: string, reason: string | null = null) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
    this.reason = reason
  }
}

type GoogleErrorBody = {
  error?: { message?: string; errors?: { reason?: string }[]; status?: string } | string
  error_description?: string
}

async function readError(res: Response): Promise<GoogleApiError> {
  let body: GoogleErrorBody = {}
  try {
    body = (await res.json()) as GoogleErrorBody
  } catch {
    // non-JSON error body
  }
  const err = body.error
  if (typeof err === 'string') {
    return new GoogleApiError(res.status, body.error_description ?? err, err)
  }
  return new GoogleApiError(
    res.status,
    err?.message ?? `Google API ${res.status}`,
    err?.errors?.[0]?.reason ?? err?.status ?? null,
  )
}

async function call<T>(
  accessToken: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(`${CALENDAR_BASE}${path}`)
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v)
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  })
  if (!res.ok) throw await readError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const enc = encodeURIComponent

export async function createCalendar(
  accessToken: string,
  summary: string,
  timeZone: string,
): Promise<{ id: string }> {
  return call(accessToken, 'POST', '/calendars', { body: { summary, timeZone } })
}

export async function setCalendarColor(
  accessToken: string,
  calendarId: string,
  hex: string,
): Promise<void> {
  await call(accessToken, 'PATCH', `/users/me/calendarList/${enc(calendarId)}`, {
    query: { colorRgbFormat: 'true' },
    body: { backgroundColor: hex, foregroundColor: '#ffffff', selected: true },
  })
}

export async function insertAcl(
  accessToken: string,
  calendarId: string,
  email: string,
  role: 'reader' | 'writer' = 'writer',
): Promise<{ id: string }> {
  return call(accessToken, 'POST', `/calendars/${enc(calendarId)}/acl`, {
    query: { sendNotifications: 'true' },
    body: { role, scope: { type: 'user', value: email } },
  })
}

export async function deleteAcl(accessToken: string, calendarId: string, aclId: string): Promise<void> {
  try {
    await call(accessToken, 'DELETE', `/calendars/${enc(calendarId)}/acl/${enc(aclId)}`)
  } catch (e) {
    if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return
    throw e
  }
}

export async function insertEvent(
  accessToken: string,
  calendarId: string,
  body: GoogleEventInput,
): Promise<GoogleEvent> {
  return call(accessToken, 'POST', `/calendars/${enc(calendarId)}/events`, { body })
}

export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  body: GoogleEventInput,
): Promise<GoogleEvent> {
  return call(accessToken, 'PUT', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { body })
}

// Idempotent: an event already gone in Google is not an error.
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  try {
    await call(accessToken, 'DELETE', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`)
  } catch (e) {
    if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return
    throw e
  }
}

type EventsPage = { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }

export type ListResult =
  | { fullSyncRequired: true }
  | { fullSyncRequired: false; items: GoogleEvent[]; nextSyncToken: string | null }

// Incremental listing: with a syncToken only changes since then come back; a 410
// means the token expired and the caller must run a full listing.
export async function listEvents(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
): Promise<ListResult> {
  const items: GoogleEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | null = null
  const base: Record<string, string | undefined> = syncToken
    ? { syncToken }
    : { showDeleted: 'true', singleEvents: 'true', maxResults: '2500' }
  if (syncToken) base.showDeleted = 'true'
  try {
    do {
      const page: EventsPage = await call(accessToken, 'GET', `/calendars/${enc(calendarId)}/events`, {
        query: { ...base, pageToken },
      })
      items.push(...(page.items ?? []))
      pageToken = page.nextPageToken
      if (page.nextSyncToken) nextSyncToken = page.nextSyncToken
    } while (pageToken)
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 410 && syncToken) return { fullSyncRequired: true }
    throw e
  }
  return { fullSyncRequired: false, items, nextSyncToken }
}
