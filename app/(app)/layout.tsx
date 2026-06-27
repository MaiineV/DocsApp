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
              {t.header.manageTeam}
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-4 text-sm">
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
            <SubmitButton className="rounded-md border border-black/15 px-3 py-1.5 font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
              {t.header.signOut}
            </SubmitButton>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
