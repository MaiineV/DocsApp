'use client'

import { useState } from 'react'
import NewDocButton from '@/components/new-doc-button'
import DocSearch from '@/components/doc-search'
import DocTreeDnd, { type SidebarDoc } from '@/components/doc-tree-dnd'
import { useI18n } from '@/components/i18n-provider'

const COOKIE = 'docs_sidebar_collapsed'
const COOKIE_MAXAGE = 60 * 60 * 24 * 365

export default function DocSidebar({
  docs,
  activeDocId,
  canEdit,
  initialCollapsed,
}: {
  docs: SidebarDoc[]
  activeDocId: string
  canEdit: boolean
  initialCollapsed: boolean
}) {
  const { t } = useI18n()
  // Dos controles desacoplados:
  //  - `collapsed` (desktop): ancho del panel, persistido en cookie.
  //  - `mobileOpen` (mobile): el drawer arranca SIEMPRE cerrado (independiente de
  //    la cookie) para no tapar el editor al entrar en una pantalla chica.
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  function setCookie(next: boolean) {
    document.cookie = `${COOKIE}=${next ? '1' : '0'};path=/;max-age=${COOKIE_MAXAGE};samesite=lax`
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

  return (
    <>
      {/* Backdrop: solo mobile, cuando el drawer está abierto. */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-black/40 sm:hidden" onClick={close} aria-hidden />
      ) : null}

      <aside
        className={[
          // Mobile: overlay off-canvas (no comprime el editor).
          'fixed inset-y-0 left-0 z-40 w-64 bg-surface shadow-lg transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // sm+: panel inline con animación de ancho (comportamiento desktop).
          'sm:static sm:z-auto sm:translate-x-0 sm:shadow-none sm:shrink-0 sm:overflow-hidden sm:border-r sm:border-border sm:bg-transparent sm:transition-[width]',
          collapsed ? 'sm:w-0' : 'sm:w-64',
        ].join(' ')}
      >
        <div className="flex h-full w-64 flex-col overflow-y-auto p-2">
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
