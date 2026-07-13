import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { PartialBlock } from '@blocknote/core'
import { createClient } from '@/lib/supabase/server'
import { getDocument } from '@/lib/documents'
import { getMyTeams } from '@/lib/teams'
import { listVersions, getVersion } from '@/lib/versions'
import { readDocBody } from '@/lib/api/doc-body'
import { renderHtml } from '@/lib/api/markdown'
import { sanitizeHtml } from '@/lib/api/html'
import { getDictionary, getLocale } from '@/lib/i18n'
import { fmt } from '@/lib/i18n/format'
import { EmptyState } from '@/components/ui/empty-state'
import VersionRestoreButton from '@/components/version-restore-button'
import type { TeamMember } from '@/lib/types'

export const runtime = 'nodejs' // jsdom/yjs para renderizar el preview

// Historial de versiones del doc (Fase 14). Vive dentro del segmento [id] →
// conserva la sidebar. Solo editor+ (mismo criterio que la RLS de la tabla):
// un viewer vuelve al documento. El preview se renderiza server-side con el
// mismo pipeline sanitizado del share público.
export default async function DocVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ v?: string }>
}) {
  const [{ id }, { v }] = await Promise.all([params, searchParams])

  const supabase = await createClient()
  const docP = getDocument(id) // dedup con el layout (React.cache)
  const membersP = docP.then(async (d) =>
    d
      ? ((await supabase.rpc('list_team_members', { p_team_id: d.team_id })).data ?? [])
      : [],
  )
  const [doc, teams, versions, members, locale] = await Promise.all([
    docP,
    getMyTeams(),
    listVersions(id),
    membersP,
    getLocale(),
  ])
  if (!doc) notFound()

  const role = teams.find((t) => t.id === doc.team_id)?.role
  const canEdit = role !== undefined && role !== 'viewer'
  if (!canEdit) redirect(`/docs/${id}`)

  const t = getDictionary(locale)
  const nameOf = (userId: string | null): string => {
    if (!userId) return t.versions.unknownAuthor
    const m = (members as TeamMember[]).find((mm) => mm.user_id === userId)
    return m ? (m.nickname ?? m.email) : t.versions.unknownAuthor
  }

  // Preview de la versión seleccionada (?v=): bloques desde el snapshot →
  // HTML de exportación → sanitizado. Una v ajena/inválida cae a null.
  const selected = v ? await getVersion(id, v) : null
  const previewHtml = selected
    ? sanitizeHtml(
        await renderHtml(
          (await readDocBody(
            { content: selected.content, ydoc_state: selected.ydoc_state },
            'json',
          )) as PartialBlock[],
        ),
      )
    : null

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-fg">
            {t.versions.title}
          </h1>
          <p className="truncate text-sm text-muted">
            {doc.icon ? <span className="mr-1.5">{doc.icon}</span> : null}
            {doc.title || t.versions.untitled}
          </p>
        </div>
        <Link
          href={`/docs/${id}`}
          className="shrink-0 text-sm text-zinc-500 hover:underline"
        >
          {t.versions.backToDoc}
        </Link>
      </div>

      {versions.length === 0 ? (
        <EmptyState title={t.versions.empty} className="mt-8" />
      ) : (
        <div className="mt-6 flex flex-col gap-6 sm:flex-row">
          {/* Lista de versiones (más nuevas primero) */}
          <ul className="w-full shrink-0 divide-y divide-border sm:w-72">
            {versions.map((row) => {
              const isSelected = row.id === v
              return (
                <li key={row.id}>
                  <Link
                    href={`/docs/${id}/versions?v=${row.id}`}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`block rounded-md px-2 py-2.5 text-sm transition-colors ${
                      isSelected ? 'bg-active font-medium' : 'hover:bg-ghost'
                    }`}
                  >
                    <span className="block truncate text-fg">
                      {fmt(t.versions.createdAt, {
                        date: new Date(row.created_at).toLocaleString(locale),
                      })}
                    </span>
                    <span className="block truncate text-xs text-subtle">
                      {row.title || t.versions.untitled} ·{' '}
                      {fmt(t.versions.byAuthor, { name: nameOf(row.created_by) })}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* Preview + restore */}
          <div className="min-w-0 flex-1">
            {selected && previewHtml !== null ? (
              <div className="rounded-lg border border-border">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {selected.title || t.versions.untitled}
                    </p>
                    <p className="text-xs text-subtle">
                      {new Date(selected.created_at).toLocaleString(locale)} ·{' '}
                      {fmt(t.versions.byAuthor, { name: nameOf(selected.created_by) })}
                    </p>
                  </div>
                  <VersionRestoreButton docId={id} versionId={selected.id} />
                </div>
                <div
                  className="share-content px-4 py-4"
                  // Sanitizado server-side con DOMPurify (mismo pipeline que /share).
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            ) : (
              <EmptyState title={t.versions.selectPrompt} className="mt-2" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
