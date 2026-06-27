import Link from 'next/link'
import { createTeam } from '@/app/(app)/teams/actions'
import { getDictionary, getLocale } from '@/lib/i18n'
import { SubmitButton } from '@/components/submit-button'

// Crear un equipo ADICIONAL (a diferencia de /onboarding, que es solo para el
// primero). createTeam deja el nuevo equipo como activo y redirige a /docs.
export default async function NewTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const t = getDictionary(await getLocale())
  // Key de idempotencia por render: un doble-submit reusa el team (la RPC dedupea).
  const idempotencyKey = crypto.randomUUID()

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <Link href="/docs" className="text-sm text-zinc-500 hover:underline">
          {t.common.backToDocs}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t.newTeam.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t.newTeam.body}</p>

        {error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <form action={createTeam} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t.newTeam.teamName}</span>
            <input
              name="name"
              type="text"
              required
              maxLength={100}
              placeholder={t.newTeam.teamNamePlaceholder}
              className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/15"
            />
          </label>
          <SubmitButton className="mt-2 rounded-md bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
            {t.newTeam.submit}
          </SubmitButton>
        </form>
      </div>
    </div>
  )
}
