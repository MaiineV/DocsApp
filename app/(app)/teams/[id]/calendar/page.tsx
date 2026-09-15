import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/user'
import { getMyTeams } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { fmt } from '@/lib/i18n/format'
import { monthRange, parseMonthParam } from '@/lib/calendar/dates'
import { teamColor } from '@/lib/calendar/colors'
import { getTeamCalendarStatus, listTeamEvents } from '@/lib/calendar/queries'
import BackgroundSync from '@/components/calendar/background-sync'
import MonthView from '@/components/calendar/month-view'
import SyncStatus from '@/components/calendar/sync-status'
import type { CalendarEvent } from '@/lib/types'

export default async function TeamCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ m?: string }>
}) {
  const [{ id }, { m }] = await Promise.all([params, searchParams])
  const month = parseMonthParam(m)
  const range = monthRange(month)

  const [teams, user, locale, events, status] = await Promise.all([
    getMyTeams(),
    getAuthUser(),
    getLocale(),
    listTeamEvents(id, range.from, range.to),
    getTeamCalendarStatus(id),
  ])
  const team = teams.find((x) => x.id === id)
  if (!team || !user) notFound()

  const t = getDictionary(locale)
  const canEdit = team.role !== 'viewer'
  const calendarEvents: CalendarEvent[] = events.map((ev) => ({
    ...ev,
    team_name: team.name,
    team_color: team.color,
  }))

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <Link href={`/teams/${id}`} className="text-sm text-zinc-500 hover:underline">
        ← {team.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg">
        {fmt(t.calendar.teamTitle, { team: team.name })}
      </h1>
      {!canEdit ? <p className="mt-1 text-sm text-muted">{t.calendar.readOnly}</p> : null}
      <SyncStatus teamId={id} status={status} isOwner={team.role === 'owner'} userId={user.id} />

      <MonthView
        month={month}
        events={calendarEvents}
        teams={[{ id: team.id, name: team.name, color: teamColor(team), canEdit }]}
        basePath={`/teams/${id}/calendar`}
        showLegend={false}
      />

      <Suspense fallback={null}>
        <BackgroundSync teamIds={[id]} />
      </Suspense>
    </div>
  )
}
