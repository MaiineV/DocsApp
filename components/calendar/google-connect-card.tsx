'use client'

import { useState, useTransition } from 'react'
import {
  disconnectGoogle,
  hostTeamCalendar,
  shareTeamCalendarWithMe,
  syncNow,
  unhostTeamCalendar,
  unshareTeamCalendarWithMe,
} from '@/app/(app)/profile/calendar/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import type { Role, TeamCalendarStatus } from '@/lib/types'
import { buttonClasses } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

export type GoogleTeamRow = {
  id: string
  name: string
  color: string
  role: Role
  status: TeamCalendarStatus
}

type Notice = 'connected' | 'denied' | 'error' | 'no_refresh' | 'unconfigured' | null

// Google Calendar integration panel: account connection + per-team actions.
export default function GoogleConnectCard({
  configured,
  email,
  userId,
  teams,
  notice,
}: {
  configured: boolean
  email: string | null
  userId: string
  teams: GoogleTeamRow[]
  notice: Notice
}) {
  const { t, locale } = useI18n()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const noticeText =
    notice === 'connected'
      ? t.google.connected
      : notice === 'denied'
        ? t.google.denied
        : notice === 'no_refresh'
          ? t.google.noRefresh
          : notice === 'error'
            ? t.google.error
            : notice === 'unconfigured'
              ? t.google.notConfigured
              : null

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okMessage?: string) {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const res = await action()
      if (res.ok) {
        if (okMessage) setInfo(okMessage)
      } else setError(res.error ?? t.google.error)
    })
  }

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t.google.section}</h2>

      {noticeText ? (
        <Alert variant={notice === 'connected' ? 'success' : 'danger'} className="mt-3">
          {noticeText}
        </Alert>
      ) : null}

      {!configured ? (
        <p className="mt-3 text-sm text-muted">{t.google.notConfigured}</p>
      ) : email ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
          <p className="text-sm text-fg">{fmt(t.google.connectedAs, { email })}</p>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{t.google.confirmDisconnect}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(disconnectGoogle)}
                className={buttonClasses('danger', 'sm')}
              >
                {t.google.confirm}
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={buttonClasses('ghost', 'sm')}>
                {t.google.cancel}
              </button>
            </div>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={buttonClasses('danger', 'sm')}>
              {t.google.disconnect}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-border p-3">
          <p className="text-sm text-muted">{t.google.connectHint}</p>
          {/* Plain anchor: the route handler redirects to Google (no client nav). */}
          <a href="/auth/google-calendar/start" className={buttonClasses('primary', 'sm', 'mt-3')}>
            {t.google.connect}
          </a>
        </div>
      )}

      {configured && teams.length > 0 ? (
        <>
          <div className="mt-6 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t.google.teamsTitle}</h3>
            {teams.some((x) => x.status.hosted) ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => syncNow(null), t.google.synced)}
                className={buttonClasses('secondary', 'sm')}
              >
                {pending ? t.google.syncing : t.google.syncNow}
              </button>
            ) : null}
          </div>
          <ul className="mt-2 divide-y divide-border">
            {teams.map((team) => {
              const s = team.status
              const isHost = s.host_user_id === userId
              return (
                <li key={team.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
                      <span className="truncate text-sm font-medium text-fg">{team.name}</span>
                      <Badge>{t.roles[team.role]}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {s.hosted
                        ? isHost
                          ? t.google.hostedByYou
                          : fmt(t.google.hostedBy, { email: s.host_email ?? '' })
                        : team.role === 'owner'
                          ? `${t.google.notHosted} · ${t.google.notHostedOwnerHint}`
                          : `${t.google.notHosted} · ${t.google.notHostedMemberHint}`}
                      {s.hosted ? (
                        <>
                          {' · '}
                          {s.last_synced_at
                            ? fmt(t.google.lastSync, {
                                date: new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
                                  new Date(s.last_synced_at),
                                ),
                              })
                            : t.google.neverSynced}
                        </>
                      ) : null}
                      {s.shared_with_me ? ` · ${t.google.shared}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {email && !s.hosted && team.role === 'owner' ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => hostTeamCalendar(team.id, Intl.DateTimeFormat().resolvedOptions().timeZone))
                        }
                        className={buttonClasses('primary', 'sm')}
                      >
                        {pending ? t.google.hosting : t.google.host}
                      </button>
                    ) : null}
                    {s.hosted && isHost ? (
                      <UnhostButton teamId={team.id} disabled={pending} onRun={run} />
                    ) : null}
                    {email && s.hosted && !isHost ? (
                      s.shared_with_me ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => unshareTeamCalendarWithMe(team.id))}
                          className={buttonClasses('secondary', 'sm')}
                        >
                          {t.google.unshare}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => shareTeamCalendarWithMe(team.id))}
                          className={buttonClasses('primary', 'sm')}
                        >
                          {pending ? t.google.sharing : t.google.share}
                        </button>
                      )
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {info ? (
        <Alert variant="success" className="mt-3">
          {info}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </section>
  )
}

function UnhostButton({
  teamId,
  disabled,
  onRun,
}: {
  teamId: string
  disabled: boolean
  onRun: (action: () => Promise<{ ok: boolean; error?: string }>) => void
}) {
  const { t } = useI18n()
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className={buttonClasses('secondary', 'sm')}>
        {t.google.unhost}
      </button>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">{t.google.confirmUnhost}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setConfirming(false)
          onRun(() => unhostTeamCalendar(teamId))
        }}
        className={buttonClasses('danger', 'sm')}
      >
        {t.google.confirmUnhostYes}
      </button>
      <button type="button" disabled={disabled} onClick={() => setConfirming(false)} className={buttonClasses('ghost', 'sm')}>
        {t.google.cancel}
      </button>
    </span>
  )
}
