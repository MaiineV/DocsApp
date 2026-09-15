import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/user'
import { getMyTeams } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { monthRange, parseMonthParam } from '@/lib/calendar/dates'
import { teamColor } from '@/lib/calendar/colors'
import { isGoogleConfigured } from '@/lib/calendar/oauth'
import { getMyGoogleEmail, getTeamCalendarStatus, listMyEvents } from '@/lib/calendar/queries'
import { syncTeams } from '@/lib/calendar/sync'
import MonthView from '@/components/calendar/month-view'
import GoogleConnectCard, { type GoogleTeamRow } from '@/components/calendar/google-connect-card'

const NOTICES = ['connected', 'denied', 'error', 'no_refresh', 'unconfigured'] as const
type Notice = (typeof NOTICES)[number]

function parseNotice(value: string | undefined): Notice | null {
  return (NOTICES as readonly string[]).includes(value ?? '') ? (value as Notice) : null
}

export default async function MyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; google?: string }>
}) {
  const [{ m, google }, teams, user, locale] = await Promise.all([
    searchParams,
    getMyTeams(),
    getAuthUser(),
    getLocale(),
  ])
  if (!user) redirect('/login')

  const month = parseMonthParam(m)
  const range = monthRange(month)
  const teamIds = teams.map((x) => x.id)

  await syncTeams(teamIds)
  const [events, statuses, email] = await Promise.all([
    listMyEvents(range.from, range.to),
    Promise.all(teamIds.map((id) => getTeamCalendarStatus(id))),
    getMyGoogleEmail(),
  ])

  const t = getDictionary(locale)
  const calendarTeams = teams.map((team) => ({
    id: team.id,
    name: team.name,
    color: teamColor(team),
    canEdit: team.role !== 'viewer',
  }))
  const googleTeams: GoogleTeamRow[] = teams.map((team, i) => ({
    id: team.id,
    name: team.name,
    color: calendarTeams[i].color,
    role: team.role,
    status: statuses[i],
  }))
  const notice = parseNotice(google)

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <Link href="/profile" className="text-sm text-zinc-500 hover:underline">
        ← {t.profile.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg">{t.calendar.myTitle}</h1>
      <p className="mt-1 text-sm text-muted">{t.calendar.subtitle}</p>

      <MonthView
        month={month}
        events={events}
        teams={calendarTeams}
        basePath="/profile/calendar"
        showLegend
      />

      <GoogleConnectCard
        configured={isGoogleConfigured()}
        email={email}
        userId={user.id}
        teams={googleTeams}
        notice={notice}
      />
    </div>
  )
}
