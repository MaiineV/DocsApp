'use client'

import Link from 'next/link'
import { setActiveTeam } from '@/app/(app)/teams/actions'
import { SubmitButton } from '@/components/submit-button'
import type { TeamWithRole } from '@/lib/teams'

// Selector de team activo en el header. Usa <details> (disclosure nativo,
// accesible por teclado) para abrir el menú sin estado/click-outside manual.
// Cada team es un form con el Server Action bindeado → funciona sin JS.
export default function TeamSwitcher({
  teams,
  activeTeamId,
}: {
  teams: TeamWithRole[]
  activeTeamId: string | null
}) {
  const active = teams.find((t) => t.id === activeTeamId) ?? teams[0]
  if (!active) return null

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
        <span className="max-w-[12rem] truncate">{active.name}</span>
        <span className="text-zinc-400">· {active.role}</span>
        <span aria-hidden className="text-[10px] transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="absolute left-0 z-20 mt-2 w-64 rounded-lg border border-black/10 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-zinc-900">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Equipos
        </p>
        {teams.map((t) => (
          <form key={t.id} action={setActiveTeam.bind(null, t.id)}>
            <SubmitButton
              spinner={false}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
                t.id === active.id ? 'font-semibold' : ''
              }`}
            >
              <span className="truncate">{t.name}</span>
              <span className="ml-2 shrink-0 text-xs text-zinc-400">
                {t.id === active.id ? '✓ ' : ''}
                {t.role}
              </span>
            </SubmitButton>
          </form>
        ))}

        <div className="my-1 border-t border-black/10 dark:border-white/10" />
        <Link
          href="/teams/new"
          className="block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          + Crear equipo
        </Link>
      </div>
    </details>
  )
}
