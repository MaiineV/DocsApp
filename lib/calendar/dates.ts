// Pure date helpers for the calendar. Day keys are 'YYYY-MM-DD'. Timed events are
// bucketed in the viewer's time zone; all-day events are stored as UTC midnights
// with an exclusive end, so their day keys come straight from the ISO date part.

export type YearMonth = { year: number; month: number } // month 1-12

export type GridCell = { key: string; day: number; inMonth: boolean }

export type DayKeyable = { all_day: boolean; starts_at: string; ends_at: string }

const MONTH_RE = /^(\d{4})-(\d{2})$/
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const pad = (n: number): string => String(n).padStart(2, '0')

export function monthKey(ym: YearMonth): string {
  return `${ym.year}-${pad(ym.month)}`
}

export function parseMonthParam(value: string | null | undefined, now = new Date()): YearMonth {
  const m = value ? MONTH_RE.exec(value) : null
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    if (year >= 1970 && year <= 2200 && month >= 1 && month <= 12) return { year, month }
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export function daysInMonth(ym: YearMonth): number {
  return new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate()
}

export function dayKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

export function addDays(key: string, n: number): string {
  const m = DAY_RE.exec(key)
  if (!m) throw new Error(`Invalid day key: ${key}`)
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n))
  return dayKeyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

// Day key of an instant in the given IANA time zone.
export function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Rows of 7 cells covering the month, padded with the neighbours' days.
export function monthGrid(ym: YearMonth, weekStartsOn: 0 | 1 = 1): GridCell[][] {
  const first = new Date(Date.UTC(ym.year, ym.month - 1, 1))
  const lead = (first.getUTCDay() - weekStartsOn + 7) % 7
  const total = daysInMonth(ym)
  const rows = Math.ceil((lead + total) / 7)
  const cells: GridCell[][] = []
  for (let r = 0; r < rows; r++) {
    const row: GridCell[] = []
    for (let c = 0; c < 7; c++) {
      const offset = r * 7 + c - lead
      const d = new Date(Date.UTC(ym.year, ym.month - 1, 1 + offset))
      row.push({
        key: dayKeyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
        day: d.getUTCDate(),
        inMonth: offset >= 0 && offset < total,
      })
    }
    cells.push(row)
  }
  return cells
}

// Fetch window for a month view: the month plus one week either side, so events
// in the padding cells show up whatever the viewer's time zone.
export function monthRange(ym: YearMonth): { from: string; to: string } {
  const from = new Date(Date.UTC(ym.year, ym.month - 1, 1 - 7))
  const to = new Date(Date.UTC(ym.year, ym.month, 1 + 7))
  return { from: from.toISOString(), to: to.toISOString() }
}

// All-day range from inclusive day keys → UTC midnights with exclusive end.
export function toAllDayRange(startKey: string, endKeyInclusive: string): {
  starts_at: string
  ends_at: string
} {
  const s = DAY_RE.exec(startKey)
  const e = DAY_RE.exec(endKeyInclusive)
  if (!s || !e) throw new Error('Invalid day key')
  const starts = Date.UTC(Number(s[1]), Number(s[2]) - 1, Number(s[3]))
  const ends = Date.UTC(Number(e[1]), Number(e[2]) - 1, Number(e[3]) + 1)
  return {
    starts_at: new Date(starts).toISOString(),
    ends_at: new Date(Math.max(ends, starts + 86_400_000)).toISOString(),
  }
}

// Inverse of toAllDayRange: inclusive day keys of a stored all-day event.
export function allDayKeys(ev: DayKeyable): { start: string; endInclusive: string } {
  const start = ev.starts_at.slice(0, 10)
  const endExclusive = ev.ends_at.slice(0, 10)
  const endInclusive = endExclusive > start ? addDays(endExclusive, -1) : start
  return { start, endInclusive }
}

// Day keys an event occupies, for bucketing into grid cells.
export function eventDayKeys(ev: DayKeyable, timeZone: string): string[] {
  let start: string
  let end: string
  if (ev.all_day) {
    ;({ start, endInclusive: end } = allDayKeys(ev))
  } else {
    const s = new Date(ev.starts_at)
    const e = new Date(ev.ends_at)
    start = dayKey(s, timeZone)
    // An end exactly at midnight belongs to the previous day.
    const endAdjusted = e.getTime() > s.getTime() ? new Date(e.getTime() - 1) : e
    end = dayKey(endAdjusted, timeZone)
  }
  const keys: string[] = []
  let k = start
  for (let i = 0; i < 366 && k <= end; i++) {
    keys.push(k)
    k = addDays(k, 1)
  }
  return keys
}

export function bucketByDay<E extends DayKeyable>(
  events: readonly E[],
  timeZone: string,
): Map<string, E[]> {
  const map = new Map<string, E[]>()
  for (const ev of events) {
    for (const key of eventDayKeys(ev, timeZone)) {
      const list = map.get(key)
      if (list) list.push(ev)
      else map.set(key, [ev])
    }
  }
  return map
}

// Sort: all-day first, then by start, then by title.
export function compareEvents(a: DayKeyable & { title: string }, b: DayKeyable & { title: string }): number {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
  if (a.starts_at !== b.starts_at) return a.starts_at < b.starts_at ? -1 : 1
  return a.title.localeCompare(b.title)
}

// 'YYYY-MM-DDTHH:mm' (as typed in a datetime-local input, local time) → ISO UTC.
export function localInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ISO UTC → 'YYYY-MM-DDTHH:mm' in the browser's local time (datetime-local value).
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
