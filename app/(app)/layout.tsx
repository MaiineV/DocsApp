import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTeam, getMyTeams } from '@/lib/teams'
import { signOut } from '@/app/login/actions'
import TeamSwitcher from '@/components/team-switcher'
import { SubmitButton } from '@/components/submit-button'

// Shell del área autenticada. El proxy ya redirige a /login si no hay sesión;
// acá repetimos el chequeo como defensa en profundidad (getUser revalida).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()

  const [
    {
      data: { user },
    },
    teams,
    active,
  ] = await Promise.all([supabase.auth.getUser(), getMyTeams(), getActiveTeam()])

  if (!user) redirect('/login')

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-3 dark:border-white/10">
        <div className="flex items-center gap-3">
          <Link href="/docs" className="font-semibold tracking-tight">
            DocsApp
          </Link>
          {teams.length > 0 ? (
            <TeamSwitcher teams={teams} activeTeamId={active?.id ?? null} />
          ) : null}
          {active ? (
            <Link
              href={`/teams/${active.id}`}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
            >
              Manage Team
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-zinc-500 sm:inline">{user.email}</span>
          <form action={signOut}>
            <SubmitButton className="rounded-md border border-black/15 px-3 py-1.5 font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
              Salir
            </SubmitButton>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
