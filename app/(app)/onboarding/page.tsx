import { redirect } from 'next/navigation'
import { getMyTeams } from '@/lib/teams'
import { createTeam } from '@/app/(app)/teams/actions'
import { SubmitButton } from '@/components/submit-button'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [{ error }, teams] = await Promise.all([searchParams, getMyTeams()])
  if (teams.length > 0) redirect('/docs')

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold tracking-tight">Creá tu workspace</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Un workspace agrupa los documentos de tu equipo. Vas a ser el owner.
        </p>

        {error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <form action={createTeam} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Nombre del equipo</span>
            <input
              name="name"
              type="text"
              required
              maxLength={100}
              placeholder="Ej: Equipo de Producto"
              className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/15"
            />
          </label>
          <SubmitButton className="mt-2 rounded-md bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
            Crear workspace
          </SubmitButton>
        </form>
      </div>
    </div>
  )
}
