'use client'

import { useState, useTransition } from 'react'
import { restoreDocument, purgeDocument } from '@/app/(app)/docs/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import { buttonClasses } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'

type TrashItem = { id: string; title: string; deleted_at: string }

export default function TrashList({
  items,
  canEdit,
  locale,
}: {
  items: TrashItem[]
  canEdit: boolean
  locale: string
}) {
  const { t } = useI18n()

  if (items.length === 0) {
    return <EmptyState title={t.trash.empty} className="mt-8" />
  }

  return (
    <ul className="mt-6 divide-y divide-border">
      {items.map((item) => (
        <TrashRow key={item.id} item={item} canEdit={canEdit} locale={locale} />
      ))}
    </ul>
  )
}

function TrashRow({
  item,
  canEdit,
  locale,
}: {
  item: TrashItem
  canEdit: boolean
  locale: string
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onRestore() {
    setError(null)
    startTransition(async () => {
      const res = await restoreDocument(item.id)
      if (!res.ok) setError(res.error ?? t.trash.restoreError)
    })
  }

  function onPurge() {
    setError(null)
    startTransition(async () => {
      const res = await purgeDocument(item.id)
      if (!res.ok) setError(res.error ?? t.trash.purgeError)
    })
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{item.title || t.common.untitled}</p>
          <p className="text-xs text-subtle">
            {fmt(t.trash.deletedAt, { date: new Date(item.deleted_at).toLocaleDateString(locale) })}
          </p>
        </div>

        {canEdit ? (
          <div className="flex shrink-0 items-center gap-2">
            {confirming ? (
              <>
                <span className="hidden text-xs text-muted sm:inline">{t.trash.confirmPurge}</span>
                <button type="button" onClick={onPurge} disabled={pending} className={buttonClasses('danger', 'sm')}>
                  {t.trash.confirm}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className={buttonClasses('ghost', 'sm')}
                >
                  {t.trash.cancel}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onRestore} disabled={pending} className={buttonClasses('secondary', 'sm')}>
                  {t.trash.restore}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={pending}
                  className={buttonClasses('danger', 'sm')}
                >
                  {t.trash.deleteForever}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert variant="danger" className="mt-2">
          {error}
        </Alert>
      ) : null}
    </li>
  )
}
