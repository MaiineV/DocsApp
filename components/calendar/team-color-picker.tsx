'use client'

import { useState, useTransition } from 'react'
import { setTeamColor } from '@/app/(app)/teams/[id]/actions'
import { useI18n } from '@/components/i18n-provider'
import { TEAM_PALETTE, defaultTeamColor } from '@/lib/calendar/colors'
import { Alert } from '@/components/ui/alert'

// Palette swatches for the team colour (calendar). Null = automatic.
export default function TeamColorPicker({
  teamId,
  currentColor,
}: {
  teamId: string
  currentColor: string | null
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const fallback = defaultTeamColor(teamId)

  function pick(color: string | null) {
    setError(null)
    startTransition(async () => {
      const res = await setTeamColor(teamId, color)
      if (!res.ok) setError(res.error ?? '')
    })
  }

  return (
    <div className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t.calendar.color}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t.calendar.color}>
        <button
          type="button"
          role="radio"
          aria-checked={currentColor === null}
          disabled={pending}
          onClick={() => pick(null)}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${currentColor === null ? 'border-fg text-fg' : 'border-border text-muted hover:bg-ghost'}`}
        >
          <span aria-hidden className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: fallback }} />
          {t.calendar.colorDefault}
        </button>
        {TEAM_PALETTE.map((hex) => {
          const selected = currentColor?.toLowerCase() === hex
          return (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={hex}
              disabled={pending}
              onClick={() => pick(hex)}
              style={{ backgroundColor: hex, boxShadow: selected ? `0 0 0 2px var(--bg), 0 0 0 4px ${hex}` : undefined }}
              className="size-6 rounded-full transition-transform hover:scale-110 disabled:opacity-50"
            />
          )
        })}
      </div>
      {error ? (
        <Alert variant="danger" className="mt-2">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
