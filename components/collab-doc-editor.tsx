'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import dynamic from 'next/dynamic'
import { persistTitle } from '@/app/(app)/docs/actions'
import { useI18n } from '@/components/i18n-provider'
import type { CollabUser } from '@/lib/collab'
import type { SaveState } from '@/components/blocknote-collab-canvas'

// El canvas (Y.Doc + provider + BlockNote) es client-only: WebSocket, awareness y
// ProseMirror tocan el browser. Se carga sin SSR (ssr:false solo dentro de un
// Client Component — ver node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md).
const Canvas = dynamic(() => import('@/components/blocknote-collab-canvas'), {
  ssr: false,
  loading: () => (
    <div className="mt-4 h-64 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
  ),
})

type Props = {
  docId: string
  userId: string
  initialTitle: string
  initialContent: string
  initialYdocState: string | null
  editable: boolean
  user: CollabUser
  teamDocs: { id: string; title: string }[]
}

const TITLE_DEBOUNCE_MS = 800

export default function CollabDocEditor({
  docId,
  userId,
  initialTitle,
  initialContent,
  initialYdocState,
  editable,
  user,
  teamDocs,
}: Props) {
  const { t } = useI18n()
  const [title, setTitle] = useState(initialTitle)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Alinear el tema de BlockNote con el tema REAL de la app (`data-theme` en <html>,
  // que setea el toggle manual / script anti-flash), no solo con el del sistema —
  // si no, al forzar dark con sistema en light el editor quedaría claro.
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const read = () => {
      const dt = document.documentElement.getAttribute('data-theme')
      setTheme(dt === 'dark' ? 'dark' : 'light')
    }
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const onTitleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setTitle(value)
      if (titleTimer.current) clearTimeout(titleTimer.current)
      titleTimer.current = setTimeout(async () => {
        setSaveState('saving')
        const res = await persistTitle(docId, value)
        setSaveState(res.ok ? 'saved' : 'error')
      }, TITLE_DEBOUNCE_MS)
    },
    [docId],
  )

  useEffect(() => () => { if (titleTimer.current) clearTimeout(titleTimer.current) }, [])

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-4">
        {editable ? (
          <input
            value={title}
            onChange={onTitleChange}
            maxLength={200}
            aria-label={t.docs.titlePlaceholder}
            placeholder={t.docs.titlePlaceholder}
            className="w-full border-0 bg-transparent text-3xl font-semibold tracking-tight text-fg outline-none placeholder:text-subtle"
          />
        ) : (
          <h1 className="text-3xl font-semibold tracking-tight text-fg">{title}</h1>
        )}
        {editable ? (
          <SaveBadge state={saveState} />
        ) : (
          <span className="shrink-0 text-xs text-subtle">{t.docs.readOnly}</span>
        )}
      </div>

      <Canvas
        docId={docId}
        userId={userId}
        initialContent={initialContent}
        initialYdocState={initialYdocState}
        editable={editable}
        theme={theme}
        user={user}
        teamDocs={teamDocs}
        onSaveStateChange={setSaveState}
      />
    </div>
  )
}

function SaveBadge({ state }: { state: SaveState }) {
  const { t } = useI18n()
  const label: Record<SaveState, string> = {
    idle: '',
    saving: t.docs.saving,
    saved: t.docs.saved,
    error: t.docs.saveError,
  }
  if (!label[state]) return null
  return (
    <span className={`shrink-0 text-xs ${state === 'error' ? 'text-danger-fg' : 'text-subtle'}`}>
      {label[state]}
    </span>
  )
}
