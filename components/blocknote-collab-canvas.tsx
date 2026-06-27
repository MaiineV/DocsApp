'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useCreateBlockNote,
  SuggestionMenuController,
  type DefaultReactSuggestionItem,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { Y, BLOCKNOTE_FRAGMENT } from '@/lib/yjs/yjs'
import { base64ToUpdate, updateToBase64 } from '@/lib/yjs/encoding'
import { parseInitialContent, seedUpdateFromBlocks } from '@/lib/blocknote'
import { schema } from '@/lib/blocknote-schema'
import { SupabaseYjsProvider } from '@/lib/yjs/supabase-provider'
import { createClient } from '@/lib/supabase/client'
import { persistYdoc } from '@/app/(app)/docs/actions'
import { useI18n } from '@/components/i18n-provider'
import { DocTitleMapContext } from '@/components/doc-ref-chip'
import type { CollabUser } from '@/lib/collab'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type Props = {
  docId: string
  initialContent: string // contenido legacy (texto plano / JSON de bloques)
  initialYdocState: string | null // snapshot Yjs base64 (fuente de verdad)
  editable: boolean
  theme: 'light' | 'dark'
  user: CollabUser
  teamDocs: { id: string; title: string }[] // otros docs del team para @menciones
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
  teamDocs,
  onSaveStateChange,
}: Props) {
  const { t } = useI18n()
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

  // 5) Persistencia: cada cliente guarda SUS cambios locales (debounced). Los
  //    cambios remotos los persiste su autor. No se elige un "persister" global
  //    (podía caer en un cliente fantasma de awareness y no guardar nada — p.ej.
  //    mover un bloque no disparaba guardado). El CAS+merge del server hace
  //    seguro que varios escriban a la vez (convergen, no se pisan).
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
    const schedule = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider) return // cambio remoto (lo persiste su autor)
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

  // 7) @menciones: mapa docId→título vivo para el chip, y el menú que se abre con
  //    "@" para insertar una referencia a otro doc del team.
  const titleMap = useMemo(
    () => new Map(teamDocs.map((d) => [d.id, d.title])),
    [teamDocs],
  )

  const getMentionItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const q = query.toLowerCase()
      return teamDocs
        .filter((d) => (d.title || '').toLowerCase().includes(q))
        .slice(0, 10)
        .map((d) => ({
          title: d.title || t.common.untitled,
          onItemClick: () => {
            editor.insertInlineContent([
              { type: 'docref', props: { docId: d.id, label: d.title || '' } },
              ' ',
            ])
          },
        }))
    },
    [teamDocs, editor, t.common.untitled],
  )

  return (
    <DocTitleMapContext.Provider value={titleMap}>
      <BlockNoteView editor={editor} editable={editable} theme={theme}>
        {editable ? (
          <SuggestionMenuController triggerCharacter="@" getItems={getMentionItems} />
        ) : null}
      </BlockNoteView>
    </DocTitleMapContext.Provider>
  )
}
