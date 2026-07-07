import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyTeams } from '@/lib/teams'
import { getDocument, listTeamDocs } from '@/lib/documents'
import { getMyProfile } from '@/lib/profile'
import { getActiveShare } from '@/lib/shares'
import { getDictionary, getLocale } from '@/lib/i18n'
import { collabUserFromProfile } from '@/lib/collab'
import { SubmitButton } from '@/components/submit-button'
import { deleteDocument } from '../actions'
import CollabDocEditor from '@/components/collab-doc-editor'
import ShareDialog from '@/components/share-dialog'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const [doc, { data: { user } }, profile] = await Promise.all([
    getDocument(id), // cacheado → reusa el fetch del layout
    supabase.auth.getUser(),
    getMyProfile(),
  ])

  if (!doc) notFound()

  const [teams, allDocs] = await Promise.all([
    getMyTeams(),
    listTeamDocs(doc.team_id), // cacheado → reusa el fetch del layout
  ])
  const role = teams.find((t) => t.id === doc.team_id)?.role
  const canEdit = role !== undefined && role !== 'viewer'

  // Link view-only del doc (solo editor+ lo gestiona → se hidrata solo si canEdit).
  const share = canEdit ? await getActiveShare(doc.id) : null

  // Otros docs del team para el menú de @menciones (sin el actual).
  const teamDocs = allDocs.filter((d) => d.id !== id).map((d) => ({ id: d.id, title: d.title }))

  const collabUser = collabUserFromProfile(profile?.nickname, user?.email, user?.id ?? '')
  const t = getDictionary(await getLocale())

  const del = deleteDocument.bind(null, doc.id)

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <Link href="/docs" className="text-sm text-zinc-500 hover:underline">
          {t.common.backToDocs}
        </Link>
        {canEdit ? (
          <div className="flex items-center gap-2">
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
        initialContent={doc.content}
        initialYdocState={doc.ydoc_state}
        editable={canEdit}
        user={collabUser}
        teamDocs={teamDocs}
      />
    </div>
  )
}
