'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  useCreateBlockNote,
  SuggestionMenuController,
  BlockNoteContext,
  useThreads,
  useUsers,
  type DefaultReactSuggestionItem,
  type BlockNoteContextValue,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import {
  CommentsExtension,
  YjsThreadStore,
  DefaultThreadStoreAuth,
  type ThreadData,
} from '@blocknote/core/comments'
import { Y, BLOCKNOTE_FRAGMENT } from '@/lib/yjs/yjs'
import { base64ToUpdate, updateToBase64 } from '@/lib/yjs/encoding'
import { parseInitialContent, seedUpdateFromBlocks } from '@/lib/blocknote'
import { schema } from '@/lib/blocknote-schema'
import { SupabaseYjsProvider } from '@/lib/yjs/supabase-provider'
import { createClient } from '@/lib/supabase/client'
import { persistYdoc, resolveDocUsers } from '@/app/(app)/docs/actions'
import { useI18n } from '@/components/i18n-provider'
import { Button } from '@/components/ui/button'
import Avatar from '@/components/avatar'
import { DocTitleMapContext } from '@/components/doc-ref-chip'
import type { CollabUser } from '@/lib/collab'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type Props = {
  docId: string
  userId: string // autor de los comentarios (id del usuario logueado)
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
  userId,
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

  // 3) Comentarios: los hilos viven en un Y.Map DENTRO del mismo Y.Doc → sincronizan
  //    por el provider existente y persisten en `ydoc_state` con el autosave actual
  //    (cero infra nueva). Se registra para editores Y viewers: el viewer igual
  //    sincroniza el fragment con comment marks y sin el mark registrado en el schema
  //    la conversión Yjs→ProseMirror tiraría. `resolveUsers` trae nombre/avatar del
  //    autor (el UserStore de BlockNote cachea). El gate real de escritura es el
  //    transporte (viewer no puede emitir por Realtime); el auth acá solo modela el UI.
  const threadStore = useMemo(() => {
    const auth = new DefaultThreadStoreAuth(userId, editable ? 'editor' : 'comment')
    return new YjsThreadStore(userId, doc.getMap('threads'), auth)
  }, [doc, userId, editable])

  const commentsExtension = useMemo(
    () =>
      CommentsExtension({
        threadStore,
        resolveUsers: (userIds) => resolveDocUsers(docId, userIds),
      }),
    [threadStore, docId],
  )

  // 4) Editor colaborativo. SIN initialContent: el contenido vive en el fragment
  //    (pasarlo además lo duplicaría).
  const editor = useCreateBlockNote({
    schema,
    collaboration: { fragment, user, provider: { awareness: provider.awareness } },
    extensions: [commentsExtension],
  })

  // Panel de comentarios (lista de hilos) togglable; solo para editores. El contexto
  // compartido deja que el panel (hermano del editor) lea el mismo editor/hilos.
  const [showComments, setShowComments] = useState(false)
  const ctxValue = useMemo(() => ({ editor }), [editor])

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
    <BlockNoteContext.Provider value={ctxValue as unknown as BlockNoteContextValue}>
      <DocTitleMapContext.Provider value={titleMap}>
        {editable ? (
          <div className="mb-2 flex justify-end">
            <CommentsToggle open={showComments} onToggle={() => setShowComments((v) => !v)} />
          </div>
        ) : null}
        <BlockNoteView editor={editor} editable={editable} theme={theme} comments={editable}>
          {editable ? (
            <SuggestionMenuController triggerCharacter="@" getItems={getMentionItems} />
          ) : null}
        </BlockNoteView>
        {/* Panel propio (no ThreadsSidebar de BlockNote: depende de contextos internos
            y trae su propio theming). Leemos los hilos con `useThreads` — que vive en
            este contexto — y los pintamos con nuestros tokens de diseño. */}
        {editable && showComments ? (
          <CommentsPanel threadStore={threadStore} onClose={() => setShowComments(false)} />
        ) : null}
      </DocTitleMapContext.Provider>
    </BlockNoteContext.Provider>
  )
}

// Botón para abrir/cerrar el panel de comentarios, con contador de hilos abiertos
// (no resueltos). `useThreads` bridgea el ThreadStore del editor a React.
function CommentsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useI18n()
  const threads = useThreads()
  const openCount = useMemo(
    () => [...threads.values()].filter((th) => !th.resolved && !th.deletedAt).length,
    [threads],
  )
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-pressed={open}
      onClick={onToggle}
    >
      <CommentIcon />
      <span>{t.comments.toggle}</span>
      {openCount > 0 ? (
        <span className="ml-0.5 rounded-full bg-active px-1.5 text-[10px] font-semibold leading-4 text-fg">
          {openCount}
        </span>
      ) : null}
    </Button>
  )
}

// Panel lateral (drawer fijo a la derecha, con backdrop) que lista los hilos. Flota
// sobre el contenido → no reflowea el editor. Ordena: abiertos primero, luego por
// fecha de creación (más nuevo arriba).
function CommentsPanel({
  threadStore,
  onClose,
}: {
  threadStore: YjsThreadStore
  onClose: () => void
}) {
  const { t } = useI18n()
  const threads = useThreads()
  const sorted = useMemo(
    () =>
      [...threads.values()]
        .filter((th) => !th.deletedAt)
        .sort((a, b) => {
          if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
          return b.createdAt.getTime() - a.createdAt.getTime()
        }),
    [threads],
  )
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} aria-hidden />
      <aside
        className="fixed right-0 top-0 z-40 flex h-full w-80 max-w-[calc(100vw-1.5rem)] flex-col border-l border-border bg-surface shadow-xl"
        aria-label={t.comments.panelTitle}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">{t.comments.panelTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.comments.close}
            className="rounded-md px-1.5 text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {sorted.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted">{t.comments.empty}</p>
          ) : (
            sorted.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} threadStore={threadStore} />
            ))
          )}
        </div>
      </aside>
    </>
  )
}

// Extrae el texto plano de un cuerpo de comentario (un documento BlockNote = array
// de bloques con inline content anidado).
function commentPlainText(body: unknown): string {
  const parts: string[] = []
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return
    for (const n of nodes as Array<Record<string, unknown>>) {
      if (typeof n?.text === 'string') parts.push(n.text)
      if (Array.isArray(n?.content)) walk(n.content)
      if (Array.isArray(n?.children)) walk(n.children)
    }
  }
  walk(body)
  return parts.join('').trim()
}

// Tarjeta de un hilo: sus comentarios (autor + fecha + texto) y la acción resolver/
// reabrir. El resolver escribe en el mismo Y.Doc → sincroniza y persiste como el resto.
function ThreadCard({
  thread,
  threadStore,
}: {
  thread: ThreadData
  threadStore: YjsThreadStore
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const authorIds = useMemo(() => thread.comments.map((c) => c.userId), [thread.comments])
  const users = useUsers(authorIds)

  const toggleResolved = () => {
    startTransition(async () => {
      if (thread.resolved) await threadStore.unresolveThread({ threadId: thread.id })
      else await threadStore.resolveThread({ threadId: thread.id })
    })
  }

  return (
    <div
      className={`rounded-lg border border-border p-3 ${thread.resolved ? 'opacity-60' : ''}`}
    >
      {thread.comments.map((comment) => {
        const u = users.get(comment.userId)
        const name = u?.username || t.common.untitled
        return (
          <div key={comment.id} className="mb-2 last:mb-0">
            <div className="flex items-center gap-2">
              <Avatar src={u?.avatarUrl || null} name={name} seed={comment.userId} size={20} />
              <span className="text-xs font-medium text-fg">{name}</span>
              <span className="text-[10px] text-subtle">
                {comment.createdAt.toLocaleDateString()}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words pl-7 text-sm text-muted">
              {commentPlainText(comment.body) || '—'}
            </p>
          </div>
        )
      })}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        {thread.resolved ? (
          <span className="text-[10px] font-medium text-success">{t.comments.resolved}</span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={toggleResolved}
          disabled={pending}
          className="rounded-md px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-ghost hover:text-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {thread.resolved ? t.comments.reopen : t.comments.resolve}
        </button>
      </div>
    </div>
  )
}

function CommentIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
