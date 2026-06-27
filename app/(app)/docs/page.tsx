import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTeam } from '@/lib/teams'
import { SubmitButton } from '@/components/submit-button'
import { createDocument } from './actions'

type DocRow = { id: string; title: string; updated_at: string }

export default async function DocsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const team = await getActiveTeam()
  if (!team) redirect('/onboarding')

  const [{ error }, supabase] = await Promise.all([searchParams, createClient()])
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, updated_at')
    .eq('team_id', team.id)
    .order('updated_at', { ascending: false })

  const rows = (docs ?? []) as DocRow[]
  const canEdit = team.role !== 'viewer'

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        {canEdit ? (
          <form action={createDocument}>
            <SubmitButton className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
              Nuevo documento
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-black/15 p-12 text-center text-zinc-500 dark:border-white/15">
          Todavía no hay documentos en <strong>{team.name}</strong>.
          {canEdit ? ' Creá el primero.' : ''}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-black/10 dark:divide-white/10">
          {rows.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/docs/${doc.id}`}
                className="flex items-center justify-between py-3 transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.03]"
              >
                <span className="font-medium">{doc.title || 'Untitled'}</span>
                <span className="text-xs text-zinc-400">
                  {new Date(doc.updated_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
