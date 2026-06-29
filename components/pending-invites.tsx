'use client'

import { useState, useTransition } from 'react'
import { revokeInvitation } from '@/app/(app)/teams/[id]/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import { Alert } from '@/components/ui/alert'
import { buttonClasses } from '@/components/ui/button'
import type { Invitation } from '@/lib/types'

export default function PendingInvites({
  teamId,
  invites,
}: {
  teamId: string
  invites: Invitation[]
}) {
  const { t, locale } = useI18n()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (invites.length === 0) {
    return <p className="text-sm text-muted">{t.invite.noPending}</p>
  }

  async function copy(id: string, token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500)
  }

  function revoke(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await revokeInvitation(teamId, id)
      if (!res.ok) setError(res.error ?? t.errors.revokeFailed)
    })
  }

  return (
    <div>
      {error ? (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}

      <ul className="divide-y divide-border">
        {invites.map((inv) => {
          return (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <span className="truncate font-medium">{inv.email}</span>
                <span className="ml-2 text-xs text-muted">
                  {inv.role} ·{' '}
                  {fmt(t.invite.expiresOn, {
                    date: new Date(inv.expires_at).toLocaleDateString(locale),
                  })}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => copy(inv.id, inv.token)}
                  className={buttonClasses('secondary', 'sm')}
                >
                  {copiedId === inv.id ? t.common.copied : t.invite.copyLink}
                </button>
                <button
                  type="button"
                  onClick={() => revoke(inv.id)}
                  disabled={isPending}
                  className={buttonClasses('danger', 'sm')}
                >
                  {t.invite.revoke}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
