import { changedSomething, syncTeams } from '@/lib/calendar/sync'
import RefreshOnSync from '@/components/calendar/refresh-on-sync'

// Throttled Google sync that streams in after the grid, so opening a calendar
// never waits on Google. The throttle keeps the refresh from re-triggering it.
export default async function BackgroundSync({ teamIds }: { teamIds: string[] }) {
  const outcomes = await syncTeams(teamIds)
  return <RefreshOnSync changed={outcomes.some(changedSomething)} />
}
