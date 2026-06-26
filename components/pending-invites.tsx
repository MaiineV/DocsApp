'use client'

import { useState, useTransition } from 'react'
import { revokeInvitation } from '@/app/(app)/teams/[id]/actions'
import type { Invitation } from '@/lib/types'

export default function PendingInvites({
  teamId,
  invites,
}: {
  teamId: string
  invites: Invitation[]
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (invites.length === 0) {
    return <p className="text-sm text-zinc-400">No hay invitaciones pendientes.</p>
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
      if (!res.ok) setError(res.error ?? 'No se pudo revocar.')
    })
  }

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-black/10 dark:divide-white/10">
        {invites.map((inv) => {
          return (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <span className="truncate font-medium">{inv.email}</span>
                <span className="ml-2 text-xs text-zinc-400">
                  {inv.role} · expira {new Date(inv.expires_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => copy(inv.id, inv.token)}
                  className="rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                >
                  {copiedId === inv.id ? '¡Copiado!' : 'Copiar link'}
                </button>
                <button
                  type="button"
                  onClick={() => revoke(inv.id)}
                  disabled={isPending}
                  className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                >
                  Revocar
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
