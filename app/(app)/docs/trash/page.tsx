import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTeam } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import TrashList from '@/components/trash-list'

// Papelera del team activo: documentos con `deleted_at` (soft-deleted). Restaurar
// o borrar definitivo desde acá. RLS limita a los docs del team.
export default async function TrashPage() {
  const team = await getActiveTeam()
  if (!team) redirect('/onboarding')

  const locale = await getLocale()
  const t = getDictionary(locale)
  const supabase = await createClient()

  const { data } = await supabase
    .from('documents')
    .select('id, title, deleted_at')
    .eq('team_id', team.id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  const items = (data ?? []) as { id: string; title: string; deleted_at: string }[]
  const canEdit = team.role !== 'viewer'

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{t.trash.title}</h1>
        <Link
          href="/docs"
          className="rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-ghost hover:text-fg"
        >
          {t.common.backToDocs}
        </Link>
      </div>

      <TrashList items={items} canEdit={canEdit} locale={locale} />
    </div>
  )
}
