'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { createInvitation } from '@/app/(app)/teams/[id]/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import type { Role } from '@/lib/types'
import { Alert } from '@/components/ui/alert'
import { Input, Field } from '@/components/ui/input'
import Listbox from '@/components/ui/listbox'
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
  const [role, setRole] = useState<Role>('editor')
  const [ttl, setTtl] = useState(7)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const email = String(data.get('email') ?? '')
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
      setRole('editor')
      setTtl(7)
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
          <Listbox ariaLabel={t.invite.role} value={role} options={INVITE_ROLES} labels={t.roles} onChange={setRole} />
        </Field>
        <Field label={t.invite.expires}>
          <Listbox
            ariaLabel={t.invite.expires}
            value={String(ttl)}
            options={TTL_OPTIONS.map(String)}
            labels={Object.fromEntries(
              TTL_OPTIONS.map((d) => [String(d), d === 1 ? t.invite.day : fmt(t.invite.days, { n: d })]),
            )}
            onChange={(v) => setTtl(Number(v))}
          />
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
