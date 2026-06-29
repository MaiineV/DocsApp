'use client'

import { useState } from 'react'
import Link from 'next/link'
import NewDocButton from '@/components/new-doc-button'
import { buildDocTree, type DocNode } from '@/lib/doc-tree'
import { useI18n } from '@/components/i18n-provider'

const COOKIE = 'docs_sidebar_collapsed'
const COOKIE_MAXAGE = 60 * 60 * 24 * 365

type SidebarDoc = { id: string; title: string; parentId: string | null }

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
  // Árbol derivado en render (no en state).
  const tree = buildDocTree(docs.map((d) => ({ id: d.id, title: d.title, parent_id: d.parentId })))

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

          {tree.length === 0 ? (
            <p className="mt-2 px-2 text-xs text-subtle">{t.sidebar.empty}</p>
          ) : (
            <ul className="mt-1">
              {tree.map((node) => (
                <DocTreeNode
                  key={node.id}
                  node={node}
                  activeDocId={activeDocId}
                  canEdit={canEdit}
                  depth={0}
                  untitled={t.common.untitled}
                  newChildLabel={t.sidebar.newChild}
                />
              ))}
            </ul>
          )}
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

function DocTreeNode({
  node,
  activeDocId,
  canEdit,
  depth,
  untitled,
  newChildLabel,
}: {
  node: DocNode
  activeDocId: string
  canEdit: boolean
  depth: number
  untitled: string
  newChildLabel: string
}) {
  const [open, setOpen] = useState(true)
  const hasChildren = node.children.length > 0
  const isActive = node.id === activeDocId

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 text-sm transition-colors ${
          isActive ? 'bg-active font-medium' : 'hover:bg-ghost'
        }`}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? '−' : '+'}
            className="inline-grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded text-[10px] text-subtle transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:min-w-0 sm:p-0.5"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-[18px] shrink-0 max-sm:hidden" />
        )}

        <Link href={`/docs/${node.id}`} className="flex-1 truncate py-2 sm:py-1.5">
          {node.title || untitled}
        </Link>

        {canEdit ? (
          <NewDocButton
            parentId={node.id}
            ariaLabel={newChildLabel}
            label="+"
            className="shrink-0 rounded p-2 text-subtle opacity-100 transition-opacity hover:bg-ghost hover:text-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-0.5 sm:opacity-0 sm:group-hover:opacity-100"
          />
        ) : null}
      </div>

      {hasChildren && open ? (
        <ul>
          {node.children.map((child) => (
            <DocTreeNode
              key={child.id}
              node={child}
              activeDocId={activeDocId}
              canEdit={canEdit}
              depth={depth + 1}
              untitled={untitled}
              newChildLabel={newChildLabel}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
