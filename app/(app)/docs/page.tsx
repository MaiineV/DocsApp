import { Fragment } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getActiveTeam } from '@/lib/teams'
import { listTeamDocs, type TeamDocRow } from '@/lib/documents'
import { buildDocTree, type DocNode } from '@/lib/doc-tree'
import { getDictionary, getLocale, type Locale } from '@/lib/i18n'
import { fmt } from '@/lib/i18n/format'
import NewDocButton from '@/components/new-doc-button'
import { buttonClasses } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'

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
            className={buttonClasses('primary')}
          />
        ) : null}
      </div>

      {error ? (
        <Alert variant="danger" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {tree.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={fmt(t.docs.emptyTitle, { team: team.name })}
          action={
            canEdit ? (
              <NewDocButton
                parentId={null}
                label={t.docs.emptyCreate.trim()}
                className={buttonClasses('primary')}
              />
            ) : undefined
          }
        />
      ) : (
        <ul className="mt-6 divide-y divide-border">
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
              className="flex items-center justify-between py-3 transition-colors hover:bg-surface-sunken"
              style={{ paddingLeft: depth * 20 }}
            >
              <span className="truncate font-medium">
                {depth > 0 ? <span className="mr-1.5 text-subtle">└</span> : null}
                {node.title || untitled}
              </span>
              <span className="shrink-0 pl-3 text-xs text-subtle">
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
