'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { createInvitation } from '@/app/(app)/teams/[id]/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import type { Role } from '@/lib/types'
import { Alert } from '@/components/ui/alert'
import { Input, Select, Field } from '@/components/ui/input'
import { buttonClasses } from '@/components/ui/button'

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
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <Field label={t.invite.email} className="min-w-[14rem] flex-1">
          <Input
            name="email"
            type="email"
            required
            placeholder={t.invite.emailPlaceholder}
          />
        </Field>
        <Field label={t.invite.role}>
          <Select name="role" defaultValue="editor">
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.invite.expires}>
          <Select name="ttl" defaultValue="7">
            {TTL_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? t.invite.day : fmt(t.invite.days, { n: d })}
              </option>
            ))}
          </Select>
        </Field>
        <button
          type="submit"
          disabled={isPending}
          className={buttonClasses('primary', 'md', 'w-full sm:w-auto')}
        >
          {isPending ? t.invite.creating : t.invite.submit}
        </button>
      </form>

      {error ? (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}

      {link ? (
        <div className="mt-3 rounded-md border border-border bg-surface-sunken p-3">
          <p className="text-xs font-medium text-muted">{t.invite.linkLabel}</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
              {link}
            </code>
            <button
              type="button"
              onClick={copy}
              className={buttonClasses('secondary', 'sm', 'shrink-0')}
            >
              {copied ? t.common.copied : t.common.copy}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
