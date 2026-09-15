'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { syncNow } from '@/app/(app)/profile/calendar/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import type { TeamCalendarStatus } from '@/lib/types'
import { buttonClasses } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'

// Google status line for a team calendar page: hosted-by + "Sync now", or a
// pointer to the profile page where the integration is managed.
export default function SyncStatus({
  teamId,
  status,
  isOwner,
  userId,
}: {
  teamId: string
  status: TeamCalendarStatus
  isOwner: boolean
  userId: string
}) {
  const { t, locale } = useI18n()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSync() {
    setError(null)
    startTransition(async () => {
      const res = await syncNow(teamId)
      if (!res.ok) setError(res.error ?? t.google.error)
    })
  }

  if (!status.hosted) {
    return (
      <p className="mt-2 text-xs text-muted">
        {t.google.notHosted}
        {' · '}
        {isOwner ? (
          <Link href="/profile/calendar" className="underline hover:text-fg">
            {t.google.notHostedOwnerHint}
          </Link>
        ) : (
          t.google.notHostedMemberHint
        )}
      </p>
    )
  }

  const hostLabel =
    status.host_user_id === userId ? t.google.hostedByYou : fmt(t.google.hostedBy, { email: status.host_email ?? '' })
  const last = status.last_synced_at
    ? fmt(t.google.lastSync, {
        date: new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(status.last_synced_at)),
      })
    : t.google.neverSynced

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>
        {hostLabel} · {last}
      </span>
      <button type="button" onClick={onSync} disabled={pending} className={buttonClasses('ghost', 'sm')}>
        {pending ? t.google.syncing : t.google.syncNow}
      </button>
      {!status.shared_with_me && status.host_user_id !== userId ? (
        <Link href="/profile/calendar" className="underline hover:text-fg">
          {t.google.share}
        </Link>
      ) : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
    </div>
  )
}
