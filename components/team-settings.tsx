'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { renameTeam, deleteTeam } from '@/app/(app)/teams/[id]/actions'
import { useI18n } from '@/components/i18n-provider'
import { Alert } from '@/components/ui/alert'
import { buttonClasses } from '@/components/ui/button'

export default function TeamSettings({
  teamId,
  currentName,
  canRename,
  canDelete,
}: {
  teamId: string
  currentName: string
  canRename: boolean
  canDelete: boolean
}) {
  const { t } = useI18n()
  const [name, setName] = useState(currentName)
  const [saved, setSaved] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [renaming, startRename] = useTransition()

  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, startDelete] = useTransition()

  const trimmed = name.trim()
  const canSave = trimmed.length > 0 && trimmed !== currentName && !renaming

  function onRename(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    setSaved(false)
    setRenameError('')
    startRename(async () => {
      const res = await renameTeam(teamId, trimmed)
      if (res.ok) setSaved(true)
      else setRenameError(res.error ?? '')
    })
  }

  function onDelete() {
    setDeleteError('')
    startDelete(async () => {
      // Éxito → la action redirige (no retorna). Si retorna, fue error.
      const res = await deleteTeam(teamId)
      if (res && !res.ok) setDeleteError(res.error ?? '')
    })
  }

  if (!canRename && !canDelete) return null

  return (
    <section className="mt-10">
      {canRename ? (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t.teamSettings.section}
          </h2>
          <form onSubmit={onRename} className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
              maxLength={80}
              className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-border"
            />
            <button
              type="submit"
              disabled={!canSave}
              className={buttonClasses('primary')}
            >
              {renaming ? '…' : t.teamSettings.save}
            </button>
          </form>
          {saved ? (
            <p className="mt-2 text-xs text-success">{t.teamSettings.saved}</p>
          ) : null}
          {renameError ? (
            <Alert variant="danger" className="mt-2">
              {renameError}
            </Alert>
          ) : null}
        </>
      ) : null}

      {canDelete ? (
        <div className="mt-8 rounded-lg border border-danger-border p-4">
          <h3 className="text-sm font-medium text-danger-fg">
            {t.teamSettings.dangerTitle}
          </h3>
          <p className="mt-1 text-xs text-muted">{t.teamSettings.dangerDesc}</p>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={buttonClasses('danger', 'sm', 'mt-3')}
            >
              {t.teamSettings.delete}
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg">{t.teamSettings.confirm}</span>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className={buttonClasses('danger', 'sm')}
              >
                {deleting ? '…' : t.teamSettings.confirmDelete}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className={buttonClasses('ghost', 'sm')}
              >
                {t.teamSettings.cancel}
              </button>
            </div>
          )}
          {deleteError ? (
            <Alert variant="danger" className="mt-2">
              {deleteError}
            </Alert>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
