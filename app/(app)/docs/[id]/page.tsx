import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/user'
import { getMyTeams } from '@/lib/teams'
import { getDocument, listTeamDocs } from '@/lib/documents'
import { getMyProfile } from '@/lib/profile'
import { getActiveShare } from '@/lib/shares'
import { getDictionary, getLocale } from '@/lib/i18n'
import { collabUserFromProfile } from '@/lib/collab'
import { SubmitButton } from '@/components/submit-button'
import { buttonClasses } from '@/components/ui/button'
import { deleteDocument } from '../actions'
import CollabDocEditor from '@/components/collab-doc-editor'
import ShareDialog from '@/components/share-dialog'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Todo en paralelo: getDocument/listTeamDocs se dedupean con el layout
  // (React.cache) y getActiveShare se dispara incondicionalmente — solo
  // depende del id de la ruta y la RLS devuelve null para viewers.
  const docP = getDocument(id)
  const allDocsP = docP.then((d) => (d ? listTeamDocs(d.team_id) : []))
  const [doc, user, profile, teams, allDocs, rawShare, locale] = await Promise.all([
    docP,
    getAuthUser(),
    getMyProfile(),
    getMyTeams(),
    allDocsP,
    getActiveShare(id),
    getLocale(),
  ])

  if (!doc) notFound()

  const role = teams.find((t) => t.id === doc.team_id)?.role
  const canEdit = role !== undefined && role !== 'viewer'

  // Link view-only del doc (solo editor+ lo gestiona → se hidrata solo si canEdit).
  const share = canEdit ? rawShare : null

  // Otros docs del team para el menú de @menciones (sin el actual).
  const teamDocs = allDocs.filter((d) => d.id !== id).map((d) => ({ id: d.id, title: d.title }))

  const collabUser = collabUserFromProfile(profile?.nickname, user?.email, user?.id ?? '')
  const t = getDictionary(locale)

  const del = deleteDocument.bind(null, doc.id)

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <Link href="/docs" className="text-sm text-zinc-500 hover:underline">
          {t.common.backToDocs}
        </Link>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Link href={`/docs/${doc.id}/versions`} className={buttonClasses('secondary', 'sm')}>
              {t.versions.link}
            </Link>
            <ShareDialog docId={doc.id} initialShare={share} />
            <form action={del}>
              <SubmitButton className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950">
                {t.docs.delete}
              </SubmitButton>
            </form>
          </div>
        ) : null}
      </div>

      <CollabDocEditor
        docId={doc.id}
        userId={user?.id ?? ''}
        initialTitle={doc.title}
        initialIcon={doc.icon}
        // El canvas solo lee initialContent cuando NO hay snapshot Yjs (docs
        // legacy); con snapshot, mandar el JSON de bloques duplica el payload.
        initialContent={doc.ydoc_state ? '' : doc.content}
        initialYdocState={doc.ydoc_state}
        editable={canEdit}
        user={collabUser}
        teamDocs={teamDocs}
      />
    </div>
  )
}
