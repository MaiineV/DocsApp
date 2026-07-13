'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { restoreDocVersion } from '@/app/(app)/docs/actions'
import { useI18n } from '@/components/i18n-provider'
import { buttonClasses } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'

// Botón de restore con confirm inline (patrón TrashRow). El confirm avisa que
// el estado actual se checkpointea (no destructivo) y que las anclas de
// comentarios pueden perderse. Al restaurar navega de vuelta al documento.
export default function VersionRestoreButton({
  docId,
  versionId,
}: {
  docId: string
  versionId: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onRestore() {
    setError(null)
    startTransition(async () => {
      const res = await restoreDocVersion(docId, versionId)
      if (!res.ok) {
        setError(res.error ?? t.versions.restoreError)
        return
      }
      router.push(`/docs/${docId}`)
    })
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonClasses('primary', 'sm')}
      >
        {t.versions.restore}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        {t.versions.confirmRestore} {t.versions.commentsWarning}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRestore}
          disabled={pending}
          className={buttonClasses('primary', 'sm')}
        >
          {t.versions.confirm}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className={buttonClasses('ghost', 'sm')}
        >
          {t.versions.cancel}
        </button>
      </div>
      {error ? (
        <Alert variant="danger" className="mt-1">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
