'use client'

import { useState } from 'react'
import Link from 'next/link'
import NewDocButton from '@/components/new-doc-button'
import { buildDocTree, type DocNode } from '@/lib/doc-tree'
import { useI18n } from '@/components/i18n-provider'

const COOKIE = 'docs_sidebar_collapsed'

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
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  // Árbol derivado en render (no en state).
  const tree = buildDocTree(docs.map((d) => ({ id: d.id, title: d.title, parent_id: d.parentId })))

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${COOKIE}=${next ? '1' : '0'};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`
  }

  return (
    <>
      <aside
        className={`shrink-0 overflow-hidden border-r border-black/10 transition-[width] duration-300 ease-in-out dark:border-white/10 ${
          collapsed ? 'w-0' : 'w-64'
        }`}
      >
        <div className="flex h-full w-64 flex-col overflow-y-auto p-2">
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              {t.sidebar.pages}
            </span>
            <button
              type="button"
              onClick={toggle}
              aria-label={t.sidebar.collapse}
              className="rounded p-1 text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-600 dark:hover:bg-white/5"
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
              className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
            />
          ) : null}

          {tree.length === 0 ? (
            <p className="mt-2 px-2 text-xs text-zinc-400">{t.sidebar.empty}</p>
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

      {collapsed ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={t.sidebar.expand}
          className="absolute left-2 top-3 z-10 rounded-md border border-black/10 bg-white p-1 text-zinc-500 shadow-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-white/5"
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
          isActive
            ? 'bg-black/[.06] font-medium dark:bg-white/10'
            : 'hover:bg-black/5 dark:hover:bg-white/5'
        }`}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? '−' : '+'}
            className="shrink-0 rounded p-0.5 text-[10px] text-zinc-400 hover:text-zinc-600"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}

        <Link href={`/docs/${node.id}`} className="flex-1 truncate py-1.5">
          {node.title || untitled}
        </Link>

        {canEdit ? (
          <NewDocButton
            parentId={node.id}
            ariaLabel={newChildLabel}
            label="+"
            className="shrink-0 rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-black/5 hover:text-zinc-600 group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-white/5"
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
