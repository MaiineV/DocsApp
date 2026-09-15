import { describe, it, expect } from 'vitest'
import {
  addDays,
  allDayKeys,
  bucketByDay,
  dayKey,
  eventDayKeys,
  monthGrid,
  monthRange,
  parseMonthParam,
  shiftMonth,
  toAllDayRange,
} from '@/lib/calendar/dates'

describe('parseMonthParam', () => {
  it('should parse a valid YYYY-MM value', () => {
    // Arrange / Act
    const ym = parseMonthParam('2026-09')
    // Assert
    expect(ym).toEqual({ year: 2026, month: 9 })
  })

  it('should fall back to the current month when the value is invalid', () => {
    const now = new Date(2026, 2, 15)
    expect(parseMonthParam('nope', now)).toEqual({ year: 2026, month: 3 })
    expect(parseMonthParam('2026-13', now)).toEqual({ year: 2026, month: 3 })
    expect(parseMonthParam(undefined, now)).toEqual({ year: 2026, month: 3 })
  })
})

describe('shiftMonth', () => {
  it('should wrap across year boundaries in both directions', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 6 }, -18)).toEqual({ year: 2024, month: 12 })
  })
})

describe('monthGrid', () => {
  it('should start on Monday and pad with neighbouring days', () => {
    // Arrange: September 2026 starts on a Tuesday.
    const grid = monthGrid({ year: 2026, month: 9 }, 1)
    // Assert
    expect(grid).toHaveLength(5)
    expect(grid[0][0]).toEqual({ key: '2026-08-31', day: 31, inMonth: false })
    expect(grid[0][1]).toEqual({ key: '2026-09-01', day: 1, inMonth: true })
    expect(grid[4][6]).toEqual({ key: '2026-10-04', day: 4, inMonth: false })
  })

  it('should produce six rows when the month spans six weeks', () => {
    // May 2027 starts on Saturday and has 31 days → 6 rows with Monday start.
    const grid = monthGrid({ year: 2027, month: 5 }, 1)
    expect(grid).toHaveLength(6)
    expect(grid.every((row) => row.length === 7)).toBe(true)
  })
})

describe('monthRange', () => {
  it('should include a week of padding either side of the month', () => {
    const { from, to } = monthRange({ year: 2026, month: 9 })
    expect(from).toBe('2026-08-25T00:00:00.000Z')
    expect(to).toBe('2026-10-08T00:00:00.000Z')
  })
})

describe('all-day ranges', () => {
  it('should store UTC midnights with an exclusive end', () => {
    const range = toAllDayRange('2026-09-10', '2026-09-12')
    expect(range).toEqual({
      starts_at: '2026-09-10T00:00:00.000Z',
      ends_at: '2026-09-13T00:00:00.000Z',
    })
  })

  it('should clamp an end before the start to a single day', () => {
    const range = toAllDayRange('2026-09-10', '2026-09-01')
    expect(range.ends_at).toBe('2026-09-11T00:00:00.000Z')
  })

  it('should round-trip through allDayKeys', () => {
    const range = toAllDayRange('2026-09-10', '2026-09-12')
    expect(allDayKeys({ all_day: true, ...range })).toEqual({
      start: '2026-09-10',
      endInclusive: '2026-09-12',
    })
  })
})

describe('dayKey and eventDayKeys', () => {
  it('should resolve the day in the given time zone', () => {
    const instant = new Date('2026-09-10T02:30:00Z')
    expect(dayKey(instant, 'UTC')).toBe('2026-09-10')
    expect(dayKey(instant, 'America/Argentina/Buenos_Aires')).toBe('2026-09-09')
  })

  it('should span every day of a multi-day timed event', () => {
    const keys = eventDayKeys(
      { all_day: false, starts_at: '2026-09-10T22:00:00Z', ends_at: '2026-09-12T01:00:00Z' },
      'UTC',
    )
    expect(keys).toEqual(['2026-09-10', '2026-09-11', '2026-09-12'])
  })

  it('should treat an end exactly at midnight as the previous day', () => {
    const keys = eventDayKeys(
      { all_day: false, starts_at: '2026-09-10T20:00:00Z', ends_at: '2026-09-11T00:00:00Z' },
      'UTC',
    )
    expect(keys).toEqual(['2026-09-10'])
  })

  it('should ignore the viewer time zone for all-day events', () => {
    const keys = eventDayKeys(
      { all_day: true, starts_at: '2026-09-10T00:00:00Z', ends_at: '2026-09-11T00:00:00Z' },
      'Pacific/Auckland',
    )
    expect(keys).toEqual(['2026-09-10'])
  })
})

describe('bucketByDay', () => {
  it('should group events under each day they touch', () => {
    // Arrange
    const a = { id: 'a', all_day: true, starts_at: '2026-09-10T00:00:00Z', ends_at: '2026-09-12T00:00:00Z' }
    const b = { id: 'b', all_day: false, starts_at: '2026-09-11T10:00:00Z', ends_at: '2026-09-11T11:00:00Z' }
    // Act
    const map = bucketByDay([a, b], 'UTC')
    // Assert
    expect(map.get('2026-09-10')?.map((e) => e.id)).toEqual(['a'])
    expect(map.get('2026-09-11')?.map((e) => e.id)).toEqual(['a', 'b'])
    expect(map.has('2026-09-12')).toBe(false)
  })
})

describe('addDays', () => {
  it('should roll over month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
