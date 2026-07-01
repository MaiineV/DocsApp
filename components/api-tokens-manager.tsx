'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { createApiToken, revokeApiToken } from '@/app/(app)/profile/tokens/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import type { ApiTokenRow, ApiTokenScope } from '@/lib/types'
import { Input, Select, Field } from '@/components/ui/input'
import { buttonClasses } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'

type ExpiryChoice = '30' | '90' | 'never'

function expiryDays(choice: ExpiryChoice): number | null {
  return choice === 'never' ? null : Number(choice)
}

export default function ApiTokensManager({
  initialTokens,
  locale,
}: {
  initialTokens: ApiTokenRow[]
  locale: string
}) {
  const { t } = useI18n()
  const [tokens, setTokens] = useState<ApiTokenRow[]>(initialTokens)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Token recién creado, mostrado UNA sola vez (el server nunca lo devuelve otra vez).
  const [revealed, setRevealed] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [name, setName] = useState('')
  const [scope, setScope] = useState<ApiTokenScope>('read_write')
  const [expiry, setExpiry] = useState<ExpiryChoice>('never')

  function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setRevealed(null)
    setCopied(false)
    startTransition(async () => {
      const res = await createApiToken(name, scope, expiryDays(expiry))
      if (!res.ok) {
        setError(res.error || t.tokens.createError)
        return
      }
      setTokens((prev) => [res.row, ...prev])
      setRevealed(res.token)
      setName('')
    })
  }

  async function copy() {
    if (!revealed) return
    await navigator.clipboard.writeText(revealed)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function onRevoked(id: string) {
    setTokens((prev) => prev.filter((tok) => tok.id !== id))
  }

  return (
    <div className="mt-8 space-y-8">
      <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Field label={t.tokens.name} className="min-w-[12rem] flex-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder={t.tokens.namePlaceholder}
          />
        </Field>
        <Field label={t.tokens.scope}>
          <Select value={scope} onChange={(e) => setScope(e.target.value as ApiTokenScope)}>
            <option value="read_write">{t.tokens.scopeReadWrite}</option>
            <option value="read">{t.tokens.scopeRead}</option>
          </Select>
        </Field>
        <Field label={t.tokens.expiry}>
          <Select value={expiry} onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}>
            <option value="never">{t.tokens.expiryNever}</option>
            <option value="30">{t.tokens.expiry30}</option>
            <option value="90">{t.tokens.expiry90}</option>
          </Select>
        </Field>
        <button
          type="submit"
          disabled={isPending}
          className={buttonClasses('primary', 'md', 'w-full sm:w-auto')}
        >
          {isPending ? t.tokens.creating : t.tokens.create}
        </button>
      </form>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      {revealed ? (
        <div className="rounded-md border border-border bg-surface-sunken p-3">
          <p className="text-xs font-semibold text-fg">{t.tokens.createdTitle}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
              {revealed}
            </code>
            <button
              type="button"
              onClick={copy}
              className={buttonClasses('secondary', 'sm', 'shrink-0')}
            >
              {copied ? t.common.copied : t.common.copy}
            </button>
          </div>
          <p className="mt-2 text-xs text-danger-fg">{t.tokens.createdWarning}</p>
        </div>
      ) : null}

      {tokens.length === 0 ? (
        <EmptyState title={t.tokens.empty} />
      ) : (
        <ul className="divide-y divide-border">
          {tokens.map((tok) => (
            <TokenRow key={tok.id} token={tok} locale={locale} onRevoked={onRevoked} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TokenRow({
  token,
  locale,
  onRevoked,
}: {
  token: ApiTokenRow
  locale: string
  onRevoked: (id: string) => void
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // "Ahora" capturado una sola vez al montar (Date.now() es impuro en render).
  const [now] = useState(() => Date.now())

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale)
  const isExpired = token.expires_at !== null && new Date(token.expires_at).getTime() <= now

  function onRevoke() {
    setError(null)
    startTransition(async () => {
      const res = await revokeApiToken(token.id)
      if (res.ok) onRevoked(token.id)
      else setError(res.error ?? t.tokens.revokeError)
    })
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-fg">{token.name}</span>
            <Badge>{token.scope === 'read' ? t.tokens.scopeRead : t.tokens.scopeReadWrite}</Badge>
            {isExpired ? <Badge variant="danger">{t.tokens.expired}</Badge> : null}
          </div>
          <code className="mt-1 block text-xs text-subtle">{token.token_prefix}…</code>
          <p className="mt-0.5 text-xs text-subtle">
            {fmt(t.tokens.createdAt, { date: fmtDate(token.created_at) })}
            {' · '}
            {token.last_used_at
              ? fmt(t.tokens.lastUsed, { date: fmtDate(token.last_used_at) })
              : t.tokens.neverUsed}
            {' · '}
            {token.expires_at ? fmt(t.tokens.expiresAt, { date: fmtDate(token.expires_at) }) : t.tokens.noExpiry}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <span className="hidden text-xs text-muted sm:inline">{t.tokens.confirmRevoke}</span>
              <button type="button" onClick={onRevoke} disabled={pending} className={buttonClasses('danger', 'sm')}>
                {t.tokens.confirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className={buttonClasses('ghost', 'sm')}
              >
                {t.tokens.cancel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending}
              className={buttonClasses('danger', 'sm')}
            >
              {t.tokens.revoke}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <Alert variant="danger" className="mt-2">
          {error}
        </Alert>
      ) : null}
    </li>
  )
}
