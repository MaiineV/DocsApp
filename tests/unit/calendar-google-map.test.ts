import { describe, it, expect } from 'vitest'
import { fromGoogleEvent, splitSyncItems, toGoogleEvent } from '@/lib/calendar/google-map'

const timed = {
  id: 'ev-1',
  team_id: 'team-1',
  title: 'Demo',
  description: 'Sprint review',
  kind: 'event' as const,
  all_day: false,
  starts_at: '2026-09-10T14:00:00.000Z',
  ends_at: '2026-09-10T15:00:00.000Z',
}

const allDay = {
  ...timed,
  id: 'ev-2',
  kind: 'deadline' as const,
  all_day: true,
  starts_at: '2026-09-10T00:00:00.000Z',
  ends_at: '2026-09-11T00:00:00.000Z',
}

describe('toGoogleEvent', () => {
  it('should map a timed event to dateTime bounds and carry the kind', () => {
    const g = toGoogleEvent(timed)
    expect(g.start).toEqual({ dateTime: timed.starts_at })
    expect(g.end).toEqual({ dateTime: timed.ends_at })
    expect(g.summary).toBe('Demo')
    expect(g.colorId).toBeUndefined()
    expect(g.extendedProperties.private).toEqual({
      docsapp_kind: 'event',
      docsapp_event_id: 'ev-1',
      docsapp_team_id: 'team-1',
    })
  })

  it('should map an all-day deadline to date bounds with the deadline colour', () => {
    const g = toGoogleEvent(allDay)
    expect(g.start).toEqual({ date: '2026-09-10' })
    expect(g.end).toEqual({ date: '2026-09-11' })
    expect(g.colorId).toBe('11')
    expect(g.extendedProperties.private.docsapp_kind).toBe('deadline')
  })
})

describe('fromGoogleEvent', () => {
  it('should round-trip a timed event', () => {
    const row = fromGoogleEvent({ id: 'g1', updated: '2026-09-01T00:00:00.000Z', ...toGoogleEvent(timed) })
    expect(row).toEqual({
      google_event_id: 'g1',
      title: 'Demo',
      description: 'Sprint review',
      kind: 'event',
      all_day: false,
      starts_at: timed.starts_at,
      ends_at: timed.ends_at,
      google_updated_at: '2026-09-01T00:00:00.000Z',
    })
  })

  it('should round-trip an all-day deadline', () => {
    const row = fromGoogleEvent({ id: 'g2', ...toGoogleEvent(allDay) })
    expect(row?.all_day).toBe(true)
    expect(row?.kind).toBe('deadline')
    expect(row?.starts_at).toBe(allDay.starts_at)
    expect(row?.ends_at).toBe(allDay.ends_at)
  })

  it('should normalise an offset dateTime to UTC', () => {
    const row = fromGoogleEvent({
      id: 'g3',
      start: { dateTime: '2026-09-10T11:00:00-03:00' },
      end: { dateTime: '2026-09-10T12:00:00-03:00' },
    })
    expect(row?.starts_at).toBe('2026-09-10T14:00:00.000Z')
    expect(row?.ends_at).toBe('2026-09-10T15:00:00.000Z')
  })

  it('should default the kind to event and the title when missing', () => {
    const row = fromGoogleEvent({ id: 'g4', start: { date: '2026-09-10' }, end: { date: '2026-09-11' } })
    expect(row?.kind).toBe('event')
    expect(row?.title).toBe('(sin título)')
  })

  it('should return null for cancelled or dateless events', () => {
    expect(fromGoogleEvent({ id: 'x', status: 'cancelled' })).toBeNull()
    expect(fromGoogleEvent({ id: 'y' })).toBeNull()
    expect(fromGoogleEvent({ id: 'z', start: { date: 'bad' }, end: { date: 'bad' } })).toBeNull()
  })
})

describe('splitSyncItems', () => {
  it('should separate cancelled ids from rows to upsert', () => {
    const { upserts, deletedIds } = splitSyncItems([
      { id: 'gone', status: 'cancelled' },
      { id: 'keep', start: { date: '2026-09-10' }, end: { date: '2026-09-11' } },
      { id: 'skip' },
    ])
    expect(deletedIds).toEqual(['gone'])
    expect(upserts.map((u) => u.google_event_id)).toEqual(['keep'])
  })
})
