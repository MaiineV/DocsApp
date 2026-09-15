'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { createEvent, updateEvent, type EventInput } from '@/app/(app)/teams/[id]/calendar/actions'
import { useI18n } from '@/components/i18n-provider'
import { allDayKeys, isoToLocalInput, localInputToIso, toAllDayRange } from '@/lib/calendar/dates'
import type { CalendarEvent, EventKind } from '@/lib/types'
import { Field, Input, Select, controlClasses } from '@/components/ui/input'
import { buttonClasses } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'

type FormTeam = { id: string; name: string }

function defaultTimed(day: string): { start: string; end: string } {
  return { start: `${day}T09:00`, end: `${day}T10:00` }
}

// Create / edit form for a team event. Dates are converted to ISO (UTC) here:
// all-day → UTC midnights (exclusive end), timed → the browser's local time.
export default function EventForm({
  teams,
  initial,
  defaultDay,
  onDone,
  onCancel,
}: {
  teams: FormTeam[]
  initial?: CalendarEvent
  defaultDay?: string
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const day = defaultDay ?? new Date().toISOString().slice(0, 10)
  const initialAllDay = initial ? allDayKeys(initial) : null
  const initialTimed = initial && !initial.all_day ? { start: isoToLocalInput(initial.starts_at), end: isoToLocalInput(initial.ends_at) } : defaultTimed(day)

  const [teamId, setTeamId] = useState(initial?.team_id ?? teams[0]?.id ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [kind, setKind] = useState<EventKind>(initial?.kind ?? 'event')
  const [allDay, setAllDay] = useState(initial?.all_day ?? kind === 'deadline')
  const [startDate, setStartDate] = useState(initialAllDay && initial?.all_day ? initialAllDay.start : day)
  const [endDate, setEndDate] = useState(initialAllDay && initial?.all_day ? initialAllDay.endInclusive : day)
  const [startAt, setStartAt] = useState(initialTimed.start)
  const [endAt, setEndAt] = useState(initialTimed.end)
  const [description, setDescription] = useState(initial?.description ?? '')

  function buildInput(): EventInput | { error: string } {
    const trimmed = title.trim()
    if (!trimmed) return { error: t.calendar.titleRequired }
    if (!teamId) return { error: t.calendar.invalidEvent }
    let starts_at: string
    let ends_at: string
    if (allDay) {
      if (!startDate || !endDate) return { error: t.calendar.invalidEvent }
      if (endDate < startDate) return { error: t.calendar.endsBeforeStarts }
      ;({ starts_at, ends_at } = toAllDayRange(startDate, endDate))
    } else {
      const s = localInputToIso(startAt)
      const e = localInputToIso(endAt)
      if (!s || !e) return { error: t.calendar.invalidEvent }
      if (e < s) return { error: t.calendar.endsBeforeStarts }
      starts_at = s
      ends_at = e
    }
    return { teamId, title: trimmed, description: description.trim(), kind, all_day: allDay, starts_at, ends_at }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const input = buildInput()
    if ('error' in input) {
      setError(input.error)
      return
    }
    startTransition(async () => {
      const res = initial ? await updateEvent(initial.id, input) : await createEvent(input)
      if (res.ok) onDone()
      else setError(res.error ?? t.calendar.saveError)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold text-fg">{initial ? t.calendar.edit : t.calendar.newEvent}</h3>

      {teams.length > 1 && !initial ? (
        <Field label={t.calendar.team}>
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label={t.calendar.titleLabel}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder={t.calendar.titlePlaceholder}
          autoFocus
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t.calendar.kind}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
            <option value="event">{t.calendar.kindEvent}</option>
            <option value="deadline">{t.calendar.kindDeadline}</option>
          </Select>
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm text-fg">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4" />
          {t.calendar.allDay}
        </label>
      </div>

      {allDay ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t.calendar.starts}>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label={t.calendar.ends}>
            <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          <Field label={t.calendar.starts}>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          </Field>
          <Field label={t.calendar.ends}>
            <Input type="datetime-local" value={endAt} min={startAt} onChange={(e) => setEndAt(e.target.value)} required />
          </Field>
        </div>
      )}

      <Field label={t.calendar.description}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          rows={3}
          className={`${controlClasses} resize-y`}
        />
      </Field>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? t.calendar.saving : initial ? t.calendar.save : t.calendar.create}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={buttonClasses('ghost', 'sm')}>
          {t.calendar.cancel}
        </button>
      </div>
    </form>
  )
}
