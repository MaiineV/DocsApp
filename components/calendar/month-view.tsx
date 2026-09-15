'use client'

import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import Link from 'next/link'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import {
  bucketByDay,
  compareEvents,
  dayKey,
  monthGrid,
  monthKey,
  shiftMonth,
  type YearMonth,
} from '@/lib/calendar/dates'
import type { CalendarEvent } from '@/lib/types'
import { buttonClasses } from '@/components/ui/button'
import { Skeleton } from '@/components/skeleton'
import EventForm from '@/components/calendar/event-form'
import EventPanel from '@/components/calendar/event-panel'

export type CalendarTeam = { id: string; name: string; color: string; canEdit: boolean }

type Panel =
  | { mode: 'idle' }
  | { mode: 'day'; day: string }
  | { mode: 'event'; event: CalendarEvent }
  | { mode: 'create'; day: string }
  | { mode: 'edit'; event: CalendarEvent }

const MAX_CHIPS = 3
const WEEKDAY_SAMPLE = Date.UTC(2024, 0, 1) // a Monday

const noop = () => () => {}
const readTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const serverTimeZone = () => null

// Month grid of team events. Buckets in the browser time zone, so the grid only
// renders after hydration (a skeleton stands in during SSR).
export default function MonthView({
  month,
  events,
  teams,
  basePath,
  showLegend,
}: {
  month: YearMonth
  events: CalendarEvent[]
  teams: CalendarTeam[]
  basePath: string
  showLegend: boolean
}) {
  const { t, locale } = useI18n()
  const tz = useSyncExternalStore(noop, readTimeZone, serverTimeZone)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [panel, setPanel] = useState<Panel>({ mode: 'idle' })

  const editableTeams = teams.filter((x) => x.canEdit)
  const canCreate = editableTeams.length > 0
  const colorOf = new Map(teams.map((x) => [x.id, x.color]))

  const prev = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)))
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(WEEKDAY_SAMPLE + i * 86_400_000)))

  const visible = events.filter((ev) => !hidden.has(ev.team_id))
  const grid = monthGrid(month, 1)
  const buckets = tz ? bucketByDay(visible, tz) : new Map<string, CalendarEvent[]>()
  const todayKey = tz ? dayKey(new Date(), tz) : ''

  const findEvent = (id: string) => events.find((ev) => ev.id === id) ?? null
  // Keep the open event panel in sync with fresh server data after a mutation.
  const currentEvent =
    panel.mode === 'event' || panel.mode === 'edit' ? findEvent(panel.event.id) : null

  function toggleTeam(id: string) {
    setHidden((prevSet) => {
      const nextSet = new Set(prevSet)
      if (nextSet.has(id)) nextSet.delete(id)
      else nextSet.add(id)
      return nextSet
    })
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label={t.calendar.title}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold capitalize text-fg">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <Link href={`${basePath}?m=${monthKey(prev)}`} aria-label={t.calendar.prevMonth} className={buttonClasses('ghost', 'sm')}>
              ‹
            </Link>
            <Link href={basePath} className={buttonClasses('secondary', 'sm')}>
              {t.calendar.today}
            </Link>
            <Link href={`${basePath}?m=${monthKey(next)}`} aria-label={t.calendar.nextMonth} className={buttonClasses('ghost', 'sm')}>
              ›
            </Link>
          </div>
        </div>

        {showLegend && teams.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={t.calendar.legend}>
            {teams.map((team) => {
              const off = hidden.has(team.id)
              return (
                <li key={team.id}>
                  <button
                    type="button"
                    aria-pressed={!off}
                    onClick={() => toggleTeam(team.id)}
                    title={t.calendar.legendHint}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-ghost ${off ? 'text-subtle line-through' : 'text-fg'}`}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: off ? 'transparent' : team.color, boxShadow: `inset 0 0 0 1.5px ${team.color}` }}
                    />
                    {team.name}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        {tz === null ? (
          <Skeleton className="mt-4 h-[28rem] w-full" />
        ) : (
          <div role="grid" className="mt-4 overflow-hidden rounded-lg border border-border">
            <div role="row" className="grid grid-cols-7 border-b border-border bg-surface-sunken text-center text-[11px] font-medium uppercase tracking-wide text-muted">
              {weekdays.map((w) => (
                <div key={w} role="columnheader" className="py-1.5">
                  {w}
                </div>
              ))}
            </div>
            {grid.map((row, ri) => (
              <div key={ri} role="row" className="grid grid-cols-7 border-b border-border last:border-b-0">
                {row.map((cell) => {
                  const dayEvents = (buckets.get(cell.key) ?? []).toSorted(compareEvents)
                  const isToday = cell.key === todayKey
                  const overflow = dayEvents.length - MAX_CHIPS
                  return (
                    <div
                      key={cell.key}
                      role="gridcell"
                      className={`min-h-[5.5rem] border-r border-border p-1 last:border-r-0 ${cell.inMonth ? '' : 'bg-surface-sunken/60 text-subtle'}`}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setPanel({ mode: 'day', day: cell.key })}
                          aria-label={cell.key}
                          className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium transition-colors hover:bg-ghost ${isToday ? 'bg-primary text-primary-fg hover:bg-primary-hover' : ''}`}
                        >
                          {cell.day}
                        </button>
                        {canCreate ? (
                          <button
                            type="button"
                            onClick={() => setPanel({ mode: 'create', day: cell.key })}
                            aria-label={fmt(t.calendar.addOn, { date: cell.key })}
                            className="inline-flex size-6 items-center justify-center rounded-md text-subtle opacity-0 transition-opacity hover:bg-ghost hover:text-fg focus-visible:opacity-100 [[role=gridcell]:hover_&]:opacity-100"
                          >
                            +
                          </button>
                        ) : null}
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, MAX_CHIPS).map((ev) => (
                          <li key={ev.id}>
                            <EventChip
                              event={ev}
                              color={colorOf.get(ev.team_id) ?? '#71717a'}
                              locale={locale}
                              tz={tz}
                              onClick={() => setPanel({ mode: 'event', event: ev })}
                            />
                          </li>
                        ))}
                        {overflow > 0 ? (
                          <li>
                            <button
                              type="button"
                              onClick={() => setPanel({ mode: 'day', day: cell.key })}
                              className="w-full truncate rounded px-1 text-left text-[11px] text-muted hover:bg-ghost"
                            >
                              {fmt(t.calendar.more, { n: overflow })}
                            </button>
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        {panel.mode === 'create' ? (
          <EventForm
            teams={editableTeams}
            defaultDay={panel.day}
            onDone={() => setPanel({ mode: 'day', day: panel.day })}
            onCancel={() => setPanel({ mode: 'idle' })}
          />
        ) : null}
        {panel.mode === 'edit' && currentEvent ? (
          <EventForm
            teams={editableTeams}
            initial={currentEvent}
            onDone={() => setPanel({ mode: 'event', event: currentEvent })}
            onCancel={() => setPanel({ mode: 'event', event: currentEvent })}
          />
        ) : null}
        {panel.mode === 'event' && currentEvent ? (
          <EventPanel
            event={currentEvent}
            color={colorOf.get(currentEvent.team_id) ?? '#71717a'}
            canEdit={teams.find((x) => x.id === currentEvent.team_id)?.canEdit ?? false}
            onEdit={() => setPanel({ mode: 'edit', event: currentEvent })}
            onDeleted={() => setPanel({ mode: 'idle' })}
            onClose={() => setPanel({ mode: 'idle' })}
          />
        ) : null}
        {(panel.mode === 'event' || panel.mode === 'edit') && !currentEvent ? (
          <p className="text-sm text-muted">{t.calendar.eventGone}</p>
        ) : null}
        {panel.mode === 'day' && tz ? (
          <DayList
            day={panel.day}
            events={(buckets.get(panel.day) ?? []).toSorted(compareEvents)}
            colorOf={colorOf}
            locale={locale}
            tz={tz}
            canCreate={canCreate}
            onCreate={() => setPanel({ mode: 'create', day: panel.day })}
            onSelect={(ev) => setPanel({ mode: 'event', event: ev })}
            onClose={() => setPanel({ mode: 'idle' })}
          />
        ) : null}
        {panel.mode === 'idle' && tz ? (
          <Upcoming
            events={visible.filter((ev) => ev.ends_at >= new Date().toISOString()).toSorted(compareEvents).slice(0, 8)}
            colorOf={colorOf}
            locale={locale}
            tz={tz}
            onSelect={(ev) => setPanel({ mode: 'event', event: ev })}
          />
        ) : null}
      </aside>
    </div>
  )
}

export function formatEventTime(ev: CalendarEvent, locale: string, tz: string): string {
  if (ev.all_day) return ''
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(
    new Date(ev.starts_at),
  )
}

function EventChip({
  event,
  color,
  locale,
  tz,
  onClick,
}: {
  event: CalendarEvent
  color: string
  locale: string
  tz: string
  onClick: () => void
}) {
  const time = formatEventTime(event, locale, tz)
  const style: CSSProperties = { backgroundColor: `${color}22`, borderColor: color }
  return (
    <button
      type="button"
      onClick={onClick}
      title={event.title}
      style={style}
      className={`flex w-full items-center gap-1 truncate rounded border-l-2 px-1 py-0.5 text-left text-[11px] leading-tight text-fg hover:brightness-95 ${event.kind === 'deadline' ? 'font-semibold' : ''}`}
    >
      {event.kind === 'deadline' ? <span aria-hidden>⏰</span> : null}
      {time ? <span className="shrink-0 text-muted">{time}</span> : null}
      <span className="truncate">{event.title}</span>
    </button>
  )
}

function EventRowButton({
  event,
  color,
  locale,
  tz,
  onSelect,
  showDate,
}: {
  event: CalendarEvent
  color: string
  locale: string
  tz: string
  onSelect: (ev: CalendarEvent) => void
  showDate: boolean
}) {
  const { t } = useI18n()
  const date = showDate
    ? new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        timeZone: event.all_day ? 'UTC' : tz,
      }).format(new Date(event.starts_at))
    : ''
  const time = event.all_day ? t.calendar.allDay : formatEventTime(event, locale, tz)
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-ghost"
    >
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0">
        <span className="block truncate text-sm text-fg">
          {event.kind === 'deadline' ? '⏰ ' : ''}
          {event.title}
        </span>
        <span className="block text-xs text-muted">
          {[date, time].filter(Boolean).join(' · ')}
          {' · '}
          {event.team_name}
        </span>
      </span>
    </button>
  )
}

function DayList({
  day,
  events,
  colorOf,
  locale,
  tz,
  canCreate,
  onCreate,
  onSelect,
  onClose,
}: {
  day: string
  events: CalendarEvent[]
  colorOf: Map<string, string>
  locale: string
  tz: string
  canCreate: boolean
  onCreate: () => void
  onSelect: (ev: CalendarEvent) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const label = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  )
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold capitalize text-fg">{label}</h3>
        <button type="button" onClick={onClose} className={buttonClasses('ghost', 'sm')} aria-label={t.calendar.close}>
          ✕
        </button>
      </div>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.calendar.emptyDay}</p>
      ) : (
        <ul className="mt-2">
          {events.map((ev) => (
            <li key={ev.id}>
              <EventRowButton
                event={ev}
                color={colorOf.get(ev.team_id) ?? '#71717a'}
                locale={locale}
                tz={tz}
                onSelect={onSelect}
                showDate={false}
              />
            </li>
          ))}
        </ul>
      )}
      {canCreate ? (
        <button type="button" onClick={onCreate} className={buttonClasses('secondary', 'sm', 'mt-3')}>
          {t.calendar.newEvent}
        </button>
      ) : null}
    </div>
  )
}

function Upcoming({
  events,
  colorOf,
  locale,
  tz,
  onSelect,
}: {
  events: CalendarEvent[]
  colorOf: Map<string, string>
  locale: string
  tz: string
  onSelect: (ev: CalendarEvent) => void
}) {
  const { t } = useI18n()
  return (
    <div className="rounded-lg border border-border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t.calendar.upcoming}</h3>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.calendar.empty}</p>
      ) : (
        <ul className="mt-2">
          {events.map((ev) => (
            <li key={ev.id}>
              <EventRowButton
                event={ev}
                color={colorOf.get(ev.team_id) ?? '#71717a'}
                locale={locale}
                tz={tz}
                onSelect={onSelect}
                showDate
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
