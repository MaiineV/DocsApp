'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { Y, BLOCKNOTE_FRAGMENT } from '@/lib/yjs/yjs'
import { base64ToUpdate, updateToBase64 } from '@/lib/yjs/encoding'
import { parseInitialContent, seedUpdateFromBlocks } from '@/lib/blocknote'
import { schema } from '@/lib/blocknote-schema'
import { SupabaseYjsProvider } from '@/lib/yjs/supabase-provider'
import { createClient } from '@/lib/supabase/client'
import { persistYdoc } from '@/app/(app)/docs/actions'
import type { CollabUser } from '@/lib/collab'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type Props = {
  docId: string
  initialContent: string // contenido legacy (texto plano / JSON de bloques)
  initialYdocState: string | null // snapshot Yjs base64 (fuente de verdad)
  editable: boolean
  theme: 'light' | 'dark'
  user: CollabUser
  onSaveStateChange?: (s: SaveState) => void
}

const PERSIST_DEBOUNCE_MS = 2000

export default function BlocknoteCollabCanvas({
  docId,
  initialContent,
  initialYdocState,
  editable,
  theme,
  user,
  onSaveStateChange,
}: Props) {
  const supabase = useMemo(() => createClient(), [])

  // 1) Y.Doc + carga inicial (una sola vez, ANTES de bindear el editor).
  //    - snapshot persistido → fuente de verdad.
  //    - doc legacy (sin snapshot) → seed determinista desde content.
  const [doc] = useState(() => {
    const d = new Y.Doc()
    if (initialYdocState) {
      Y.applyUpdate(d, base64ToUpdate(initialYdocState))
    } else {
      const blocks = parseInitialContent(initialContent)
      if (blocks) Y.applyUpdate(d, seedUpdateFromBlocks(blocks))
    }
    return d
  })

  // 2) Provider (constructor sync → awareness ya disponible; connect en effect).
  const [provider] = useState(
    () => new SupabaseYjsProvider({ supabase, docId, doc, canSend: editable }),
  )

  const fragment = useMemo(() => doc.getXmlFragment(BLOCKNOTE_FRAGMENT), [doc])

  // 3) Editor colaborativo. SIN initialContent: el contenido vive en el fragment
  //    (pasarlo además lo duplicaría).
  const editor = useCreateBlockNote({
    schema,
    collaboration: { fragment, user, provider: { awareness: provider.awareness } },
  })

  // 4) Conexión + refresh de JWT (Realtime Authorization) + teardown reconectable.
  //    El connect se DIFIERE un tick: en dev, React 19 StrictMode monta →
  //    desmonta → monta; el cleanup inmediato cancela este primer connect, así
  //    solo corre una vez (evita doble suscripción al mismo canal Realtime).
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      if (!cancelled) provider.connect()
    }, 0)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        provider.setAuthToken(session?.access_token ?? null)
      }
    })
    return () => {
      cancelled = true
      clearTimeout(t)
      sub.subscription.unsubscribe()
      provider.disconnect()
    }
  }, [provider, supabase])

  // 5) Persistencia: el persister ELECTO (menor clientID conectado) guarda
  //    debounced. El CAS del server es el backstop si dos guardan a la vez.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistNow = useCallback(async () => {
    onSaveStateChange?.('saving')
    const snapshot = updateToBase64(Y.encodeStateAsUpdate(doc))
    const content = JSON.stringify(editor.document)
    const res = await persistYdoc(docId, snapshot, content)
    onSaveStateChange?.(res.ok ? 'saved' : 'error')
  }, [doc, editor, docId, onSaveStateChange])

  useEffect(() => {
    if (!editable) return
    const schedule = () => {
      // Elección: solo persiste el editor con menor clientID conectado, para no
      // tener N escrituras por cada cambio. getStates() = clientes que anuncian
      // awareness (todos editores). Si está vacío, persisto yo.
      const ids = [...provider.awareness.getStates().keys()]
      const isPersister = ids.length === 0 || Math.min(...ids) === doc.clientID
      if (!isPersister) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(persistNow, PERSIST_DEBOUNCE_MS)
    }
    doc.on('update', schedule)
    return () => {
      doc.off('update', schedule)
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [editable, doc, provider, persistNow])

  // 6) Flush de durabilidad al cerrar/ocultar la pestaña: si el último editor se
  //    va antes del debounce, el beacon empuja el snapshot. fire-and-forget.
  useEffect(() => {
    if (!editable) return
    const flush = () => {
      const payload = JSON.stringify({
        snapshot: updateToBase64(Y.encodeStateAsUpdate(doc)),
        content: JSON.stringify(editor.document),
      })
      navigator.sendBeacon(
        `/docs/${docId}/persist`,
        new Blob([payload], { type: 'application/json' }),
      )
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [editable, doc, editor, docId])

  return <BlockNoteView editor={editor} editable={editable} theme={theme} />
}
