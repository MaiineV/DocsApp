'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { renameTeam, deleteTeam } from '@/app/(app)/teams/[id]/actions'
import { useI18n } from '@/components/i18n-provider'

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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
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
              className="flex-1 rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {renaming ? '…' : t.teamSettings.save}
            </button>
          </form>
          {saved ? (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">{t.teamSettings.saved}</p>
          ) : null}
          {renameError ? <p className="mt-2 text-xs text-red-600">{renameError}</p> : null}
        </>
      ) : null}

      {canDelete ? (
        <div className="mt-8 rounded-lg border border-red-200 p-4 dark:border-red-900/50">
          <h3 className="text-sm font-medium text-red-700 dark:text-red-400">
            {t.teamSettings.dangerTitle}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">{t.teamSettings.dangerDesc}</p>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
            >
              {t.teamSettings.delete}
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">{t.teamSettings.confirm}</span>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
              >
                {deleting ? '…' : t.teamSettings.confirmDelete}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="rounded-md px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                {t.teamSettings.cancel}
              </button>
            </div>
          )}
          {deleteError ? <p className="mt-2 text-xs text-red-600">{deleteError}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
