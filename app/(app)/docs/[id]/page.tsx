import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyTeams } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { collabUserFromEmail } from '@/lib/collab'
import { SubmitButton } from '@/components/submit-button'
import { deleteDocument } from '../actions'
import CollabDocEditor from '@/components/collab-doc-editor'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const [{ data: doc }, { data: { user } }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, title, content, team_id, updated_at, ydoc_state')
      .eq('id', id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ])

  if (!doc) notFound()

  const teams = await getMyTeams()
  const role = teams.find((t) => t.id === doc.team_id)?.role
  const canEdit = role !== undefined && role !== 'viewer'

  const collabUser = collabUserFromEmail(user?.email, user?.id ?? '')
  const t = getDictionary(await getLocale())

  const del = deleteDocument.bind(null, doc.id)

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <div className="flex items-center justify-between">
        <Link href="/docs" className="text-sm text-zinc-500 hover:underline">
          {t.common.backToDocs}
        </Link>
        {canEdit ? (
          <form action={del}>
            <SubmitButton className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950">
              {t.docs.delete}
            </SubmitButton>
          </form>
        ) : null}
      </div>

      <CollabDocEditor
        docId={doc.id}
        initialTitle={doc.title}
        initialContent={doc.content}
        initialYdocState={doc.ydoc_state}
        editable={canEdit}
        user={collabUser}
      />
    </div>
  )
}
