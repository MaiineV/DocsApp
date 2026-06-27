import { Fragment } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getActiveTeam } from '@/lib/teams'
import { listTeamDocs, type TeamDocRow } from '@/lib/documents'
import { buildDocTree, type DocNode } from '@/lib/doc-tree'
import { getDictionary, getLocale, type Locale } from '@/lib/i18n'
import { fmt } from '@/lib/i18n/format'
import NewDocButton from '@/components/new-doc-button'

export default async function DocsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const team = await getActiveTeam()
  if (!team) redirect('/onboarding')

  const [{ error }, docs, locale] = await Promise.all([
    searchParams,
    listTeamDocs(team.id),
    getLocale(),
  ])
  const t = getDictionary(locale)
  const tree = buildDocTree(docs)
  const canEdit = team.role !== 'viewer'

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t.docs.title}</h1>
        {canEdit ? (
          <NewDocButton
            parentId={null}
            label={t.docs.newDoc}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          />
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {tree.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-black/15 p-12 text-center text-zinc-500 dark:border-white/15">
          {fmt(t.docs.emptyTitle, { team: team.name })}
          {canEdit ? t.docs.emptyCreate : ''}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-black/10 dark:divide-white/10">
          <DocTreeRows nodes={tree} depth={0} untitled={t.common.untitled} locale={locale} />
        </ul>
      )}
    </div>
  )
}

// Lista jerárquica: cada doc con sus hijos anidados (indentados por profundidad),
// igual que el árbol del sidebar.
function DocTreeRows({
  nodes,
  depth,
  untitled,
  locale,
}: {
  nodes: DocNode<TeamDocRow>[]
  depth: number
  untitled: string
  locale: Locale
}) {
  return (
    <>
      {nodes.map((node) => (
        <Fragment key={node.id}>
          <li>
            <Link
              href={`/docs/${node.id}`}
              className="flex items-center justify-between py-3 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.03]"
              style={{ paddingLeft: depth * 20 }}
            >
              <span className="truncate font-medium">
                {depth > 0 ? <span className="mr-1.5 text-zinc-300">└</span> : null}
                {node.title || untitled}
              </span>
              <span className="shrink-0 pl-3 text-xs text-zinc-400">
                {new Date(node.updated_at).toLocaleDateString(locale)}
              </span>
            </Link>
          </li>
          {node.children.length > 0 ? (
            <DocTreeRows nodes={node.children} depth={depth + 1} untitled={untitled} locale={locale} />
          ) : null}
        </Fragment>
      ))}
    </>
  )
}
