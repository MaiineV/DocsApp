'use client'

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import NewDocButton from '@/components/new-doc-button'
import DocSearch from '@/components/doc-search'
import DocTreeDnd, { type SidebarDoc } from '@/components/doc-tree-dnd'
import { useI18n } from '@/components/i18n-provider'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_COOKIE,
  clampSidebarWidth,
  sidebarWidthForKey,
} from '@/lib/sidebar-width'

const COOKIE = 'docs_sidebar_collapsed'
const COOKIE_MAXAGE = 60 * 60 * 24 * 365

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value};path=/;max-age=${COOKIE_MAXAGE};samesite=lax`
}

export default function DocSidebar({
  docs,
  activeDocId,
  canEdit,
  initialCollapsed,
  initialWidth,
}: {
  docs: SidebarDoc[]
  activeDocId: string
  canEdit: boolean
  initialCollapsed: boolean
  initialWidth: number
}) {
  const { t } = useI18n()
  // Dos controles desacoplados:
  //  - `collapsed` (desktop): ancho del panel, persistido en cookie.
  //  - `mobileOpen` (mobile): el drawer arranca SIEMPRE cerrado (independiente de
  //    la cookie) para no tapar el editor al entrar en una pantalla chica.
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Ancho desktop (px), persistido en cookie y leído en SSR por el layout → el
  // primer paint ya tiene el ancho elegido, sin salto al hidratar. Viaja como
  // CSS var inline (`--sidebar-w`): el drawer mobile ignora la var y sigue w-64.
  const [width, setWidth] = useState(initialWidth)
  const [dragging, setDragging] = useState(false)
  const asideRef = useRef<HTMLElement>(null)
  // Transitorio del drag: se escribe la var directo al DOM en cada pointermove
  // (sin re-render del árbol DnD por frame) y se commitea a React al soltar.
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  function setCookie(next: boolean) {
    writeCookie(COOKIE, next ? '1' : '0')
  }
  function open() {
    setCollapsed(false)
    setMobileOpen(true)
    setCookie(false)
  }
  function close() {
    setCollapsed(true)
    setMobileOpen(false)
    setCookie(true)
  }

  function commitWidth(n: number) {
    const w = clampSidebarWidth(n)
    setWidth(w)
    writeCookie(SIDEBAR_WIDTH_COOKIE, String(w))
  }
  function onHandlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startWidth: width }
    setDragging(true)
  }
  function onHandlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const next = clampSidebarWidth(drag.current.startWidth + e.clientX - drag.current.startX)
    asideRef.current?.style.setProperty('--sidebar-w', `${next}px`)
  }
  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const next = drag.current.startWidth + e.clientX - drag.current.startX
    drag.current = null
    setDragging(false)
    // React re-aplica el mismo valor que ya está en el DOM → sin salto.
    commitWidth(next)
  }
  function onHandleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = sidebarWidthForKey(e.key, e.shiftKey, width)
    if (next === null) return
    e.preventDefault()
    commitWidth(next)
  }

  return (
    <>
      {/* Backdrop: solo mobile, cuando el drawer está abierto. */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-black/40 sm:hidden" onClick={close} aria-hidden />
      ) : null}

      <aside
        ref={asideRef}
        style={{ '--sidebar-w': `${width}px` } as CSSProperties}
        className={[
          // Mobile: overlay off-canvas (no comprime el editor).
          'fixed inset-y-0 left-0 z-40 w-64 bg-surface shadow-lg transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // sm+: panel inline con animación de ancho (comportamiento desktop).
          'sm:static sm:z-auto sm:translate-x-0 sm:shadow-none sm:shrink-0 sm:overflow-hidden sm:border-r sm:border-border sm:bg-transparent',
          // Sin transición mientras se arrastra: el panel sigue al cursor 1:1.
          dragging ? '' : 'sm:transition-[width]',
          collapsed ? 'sm:w-0' : 'sm:w-(--sidebar-w)',
        ].join(' ')}
      >
        {/* Ancho fijo interno: el contenido no refluye mientras el aside anima a 0. */}
        <div className="flex h-full w-64 flex-col overflow-y-auto p-2 sm:w-(--sidebar-w)">
          <div className="mb-1 hidden px-1 sm:block">
            <DocSearch variant="inline" />
          </div>
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
              {t.sidebar.pages}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label={t.sidebar.collapse}
              className="inline-grid min-h-[44px] min-w-[44px] place-items-center rounded text-subtle transition-colors hover:bg-ghost hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:min-w-0 sm:p-1"
            >
              «
            </button>
          </div>

          {canEdit ? (
            <NewDocButton
              parentId={null}
              ariaLabel={t.sidebar.newPage}
              label={
                <>
                  <span className="text-base leading-none">+</span> {t.sidebar.newPage}
                </>
              }
              className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-ghost hover:text-fg disabled:opacity-50"
            />
          ) : null}

          <DocTreeDnd docs={docs} activeDocId={activeDocId} canEdit={canEdit} />
        </div>
      </aside>

      {/* Handle de resize (solo desktop, solo expandido). Hermano del aside, no
          hijo: el aside es overflow-hidden (no dejaría asomar el hit area) y los
          e2e seleccionan `aside li`/`aside ul`. Wrapper de ancho 0 en el flujo
          flex → sigue al borde derecho del aside sin tocar su posicionamiento. */}
      {!collapsed ? (
        <div className="relative hidden w-0 shrink-0 sm:block">
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t.sidebar.resize}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={width}
            tabIndex={0}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onHandleKeyDown}
            onDoubleClick={() => commitWidth(SIDEBAR_DEFAULT_WIDTH)}
            className={[
              'absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none select-none transition-colors',
              'hover:bg-ring/40 focus-visible:bg-ring/40 focus-visible:outline-none',
              dragging ? 'bg-ring/60' : '',
            ].join(' ')}
          />
        </div>
      ) : null}
      {/* Mientras se arrastra: cursor consistente sobre el editor y sin selección
          de texto. Declarativo → nada que restaurar al desmontar. */}
      {dragging ? (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" aria-hidden />
      ) : null}

      {/* Abrir en mobile: FAB abajo-izquierda (no overlapa el header del doc). */}
      {!mobileOpen ? (
        <button
          type="button"
          onClick={open}
          aria-label={t.sidebar.expand}
          className="fixed bottom-5 left-4 z-40 inline-grid size-11 place-items-center rounded-full border border-border bg-surface text-fg shadow-lg transition-colors hover:bg-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
        >
          ☰
        </button>
      ) : null}

      {/* Abrir en desktop: botón » cuando el panel está colapsado. */}
      {collapsed ? (
        <button
          type="button"
          onClick={open}
          aria-label={t.sidebar.expand}
          className="absolute left-2 top-3 z-10 hidden rounded-md border border-border bg-surface p-1 text-muted shadow-sm transition-colors hover:bg-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-grid sm:place-items-center"
        >
          »
        </button>
      ) : null}
    </>
  )
}
