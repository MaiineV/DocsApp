import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getActiveTeam } from '@/lib/teams'
import { listTeamDocs } from '@/lib/documents'
import { getDictionary, getLocale } from '@/lib/i18n'
import { fmt } from '@/lib/i18n/format'
import NewDocButton from '@/components/new-doc-button'
import DocTreeDnd from '@/components/doc-tree-dnd'
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
  const canEdit = team.role !== 'viewer'

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{t.docs.title}</h1>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit ? (
            <Link href="/docs/trash" className={buttonClasses('ghost', 'sm')}>
              {t.trash.link}
            </Link>
          ) : null}
          {canEdit ? (
            <NewDocButton
              parentId={null}
              label={t.docs.newDoc}
              className={buttonClasses('primary')}
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="danger" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {docs.length === 0 ? (
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
        // Mismo árbol interactivo que la sidebar (drag & drop + colapsar),
        // variante 'index': rows grandes con fecha de actualización.
        <DocTreeDnd
          variant="index"
          locale={locale}
          activeDocId={null}
          canEdit={canEdit}
          docs={docs.map((d) => ({
            id: d.id,
            title: d.title,
            icon: d.icon,
            parentId: d.parent_id,
            position: d.position,
            updatedAt: d.updated_at,
          }))}
        />
      )}
    </div>
  )
}
