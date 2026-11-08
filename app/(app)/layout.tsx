import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/user'
import { getActiveTeam, getMyTeams } from '@/lib/teams'
import { getMyProfile } from '@/lib/profile'
import { displayName } from '@/lib/collab'
import TeamSwitcher from '@/components/team-switcher'
import { DocTitleProvider } from '@/components/doc-title-context'
import ThemeToggle from '@/components/theme-toggle'
import HeaderSearch from '@/components/header-search'
import CalendarNavLink from '@/components/calendar-nav-link'
import AccountMenu from '@/components/account-menu'

// Shell del área autenticada. El proxy ya redirige a /login si no hay sesión;
// acá repetimos el chequeo como defensa en profundidad (getAuthUser verifica
// la firma del JWT).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, teams, active, profile] = await Promise.all([
    getAuthUser(),
    getMyTeams(),
    getActiveTeam(),
    getMyProfile(),
  ])

  if (!user) redirect('/login')

  const display = displayName(profile?.nickname, user.email)

  return (
    // DocTitleProvider vive acá (layout compartido sin params: sobrevive a las
    // navegaciones doc→doc sin re-montarse) para que el rename de título fluya
    // client-side del editor a la sidebar sin revalidatePath.
    <DocTitleProvider>
      {/* h-dvh + min-h-0 en <main>: acota la cadena de alturas para que las
          rutas que lo necesiten (docs/[id]) scrolleen por panel en vez de
          scrollear la página entera. Las demás páginas desbordan <main> y el
          documento scrollea normal. */}
      <div className="flex h-dvh flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link href="/docs" className="shrink-0 font-semibold tracking-tight">
              DocsApp
            </Link>
            {teams.length > 0 ? (
              <TeamSwitcher teams={teams} activeTeamId={active?.id ?? null} />
            ) : null}
            {active ? (
              <>
                <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
                <CalendarNavLink teamId={active.id} />
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            <HeaderSearch />
            <ThemeToggle />
            <AccountMenu userId={user.id} avatarUrl={profile?.avatar_url ?? null} displayName={display} />
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </DocTitleProvider>
  )
}
