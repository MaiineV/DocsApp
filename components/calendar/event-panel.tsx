'use client'

import { useState, useTransition } from 'react'
import { deleteEvent } from '@/app/(app)/teams/[id]/calendar/actions'
import { useI18n } from '@/components/i18n-provider'
import { allDayKeys } from '@/lib/calendar/dates'
import type { CalendarEvent } from '@/lib/types'
import { buttonClasses } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'

function formatRange(ev: CalendarEvent, locale: string): string {
  if (ev.all_day) {
    const { start, endInclusive } = allDayKeys(ev)
    const f = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
    const a = f.format(new Date(`${start}T00:00:00Z`))
    if (start === endInclusive) return a
    return `${a} – ${f.format(new Date(`${endInclusive}T00:00:00Z`))}`
  }
  const f = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  const s = new Date(ev.starts_at)
  const e = new Date(ev.ends_at)
  if (s.toDateString() === e.toDateString()) {
    const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' })
    return `${f.format(s)} – ${time.format(e)}`
  }
  return `${f.format(s)} – ${f.format(e)}`
}

export default function EventPanel({
  event,
  color,
  canEdit,
  onEdit,
  onDeleted,
  onClose,
}: {
  event: CalendarEvent
  color: string
  canEdit: boolean
  onEdit: () => void
  onDeleted: () => void
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteEvent(event.id)
      if (res.ok) onDeleted()
      else setError(res.error ?? t.calendar.deleteError)
    })
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="min-w-0 break-words text-sm font-semibold text-fg">{event.title}</h3>
        </div>
        <button type="button" onClick={onClose} className={buttonClasses('ghost', 'sm')} aria-label={t.calendar.close}>
          ✕
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{event.team_name}</span>
        {event.kind === 'deadline' ? <Badge variant="danger">{t.calendar.kindDeadline}</Badge> : null}
      </div>
      <p className="mt-2 text-sm text-fg">{formatRange(event, locale)}</p>
      {event.description ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{event.description}</p>
      ) : null}

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <span className="text-xs text-muted">{t.calendar.confirmDelete}</span>
              <button type="button" onClick={onDelete} disabled={pending} className={buttonClasses('danger', 'sm')}>
                {pending ? '…' : t.calendar.confirm}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={buttonClasses('ghost', 'sm')}>
                {t.calendar.cancel}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onEdit} className={buttonClasses('secondary', 'sm')}>
                {t.calendar.edit}
              </button>
              <button type="button" onClick={() => setConfirming(true)} className={buttonClasses('danger', 'sm')}>
                {t.calendar.delete}
              </button>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <Alert variant="danger" className="mt-2">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
