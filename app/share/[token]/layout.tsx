import Link from 'next/link'
import { fetchSharedTree } from '@/lib/api/shared-doc'
import { buildDocTree, type DocNode } from '@/lib/doc-tree'
import { getDictionary, getLocale } from '@/lib/i18n'

// Chrome público mínimo para los links view-only. Fuera de `(app)` → sin guard de
// auth ni header de equipo. Hereda del root layout: theme anti-flash, fuentes,
// I18nProvider. Muestra el nav del subárbol solo cuando el link incluye subpáginas
// (el árbol trae más de una fila).
export default async function ShareLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const t = getDictionary(await getLocale())
  const rows = await fetchSharedTree(token)
  const rootId = rows[0]?.id ?? null
  const tree = buildDocTree(rows)
  const showNav = rows.length > 1

  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg text-fg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-sm font-semibold">DocsApp</span>
          <span className="rounded-full border border-border bg-badge px-2.5 py-1 text-xs text-badge-fg">
            {t.share.readonlyBadge}
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-4 py-8 sm:px-6">
        {showNav ? (
          <nav className="hidden w-56 shrink-0 sm:block">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-subtle">
              {t.share.pagesNav}
            </p>
            <ShareNav nodes={tree} token={token} rootId={rootId} untitled={t.common.untitled} />
          </nav>
        ) : null}
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 text-xs text-subtle sm:px-6">
          {t.share.poweredBy}
        </div>
      </footer>
    </div>
  )
}

function ShareNav({
  nodes,
  token,
  rootId,
  untitled,
}: {
  nodes: DocNode[]
  token: string
  rootId: string | null
  untitled: string
}) {
  return (
    <ul className="space-y-0.5 text-sm">
      {nodes.map((n) => (
        <li key={n.id}>
          <Link
            href={n.id === rootId ? `/share/${token}` : `/share/${token}/${n.id}`}
            className="block truncate rounded px-2 py-1 text-muted transition-colors hover:bg-active hover:text-fg"
          >
            {n.title || untitled}
          </Link>
          {n.children.length > 0 ? (
            <div className="ml-3 border-l border-border pl-1">
              <ShareNav nodes={n.children} token={token} rootId={rootId} untitled={untitled} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
