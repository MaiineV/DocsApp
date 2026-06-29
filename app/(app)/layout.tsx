import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveTeam, getMyTeams } from '@/lib/teams'
import { getMyProfile } from '@/lib/profile'
import { displayName } from '@/lib/collab'
import { getDictionary, getLocale } from '@/lib/i18n'
import { signOut } from '@/app/login/actions'
import TeamSwitcher from '@/components/team-switcher'
import Avatar from '@/components/avatar'
import ThemeToggle from '@/components/theme-toggle'
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
    profile,
  ] = await Promise.all([supabase.auth.getUser(), getMyTeams(), getActiveTeam(), getMyProfile()])

  if (!user) redirect('/login')

  const t = getDictionary(await getLocale())
  const display = displayName(profile?.nickname, user.email)

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 sm:px-6 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/docs" className="shrink-0 font-semibold tracking-tight">
            DocsApp
          </Link>
          {teams.length > 0 ? (
            <TeamSwitcher teams={teams} activeTeamId={active?.id ?? null} />
          ) : null}
          {active ? (
            <Link
              href={`/teams/${active.id}`}
              className="hidden rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-ghost hover:text-fg sm:inline-flex"
            >
              {t.header.manageTeam}
            </Link>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
          <ThemeToggle />
          <Link
            href="/profile"
            aria-label={t.profile.title}
            className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Avatar src={profile?.avatar_url} name={display} seed={user.id} size={26} />
            <span className="hidden max-w-[10rem] truncate text-zinc-600 sm:inline dark:text-zinc-300">
              {display}
            </span>
          </Link>
          <form action={signOut}>
            <SubmitButton className="rounded-md border border-black/15 px-3 py-2 font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
              {t.header.signOut}
            </SubmitButton>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
