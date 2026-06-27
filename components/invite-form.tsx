'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { createInvitation } from '@/app/(app)/teams/[id]/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import type { Role } from '@/lib/types'

// owner nunca se invita (lo bloquean el CHECK y la RLS).
const INVITE_ROLES: Role[] = ['viewer', 'editor', 'admin']
const TTL_OPTIONS = [1, 7, 14, 30]

export default function InviteForm({ teamId }: { teamId: string }) {
  const { t } = useI18n()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const email = String(data.get('email') ?? '')
    const role = String(data.get('role') ?? 'viewer') as Role
    const ttl = Number(data.get('ttl') ?? 7)
    setError(null)
    setLink(null)
    setCopied(false)
    startTransition(async () => {
      const res = await createInvitation(teamId, email, role, ttl)
      if (!res.ok || !res.token) {
        setError(res.error ?? t.errors.createInviteFailed)
        return
      }
      setLink(`${window.location.origin}/invite/${res.token}`)
      form.reset()
    })
  }

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{t.invite.email}</span>
          <input
            name="email"
            type="email"
            required
            placeholder={t.invite.emailPlaceholder}
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/15"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.invite.role}</span>
          <select
            name="role"
            defaultValue="editor"
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none dark:border-white/15"
          >
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.invite.expires}</span>
          <select
            name="ttl"
            defaultValue="7"
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none dark:border-white/15"
          >
            {TTL_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? t.invite.day : fmt(t.invite.days, { n: d })}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? t.invite.creating : t.invite.submit}
        </button>
      </form>

      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {link ? (
        <div className="mt-3 rounded-md border border-black/10 bg-zinc-50 p-3 dark:border-white/10 dark:bg-zinc-800/50">
          <p className="text-xs font-medium text-zinc-500">{t.invite.linkLabel}</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
              {link}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              {copied ? t.common.copied : t.common.copy}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
