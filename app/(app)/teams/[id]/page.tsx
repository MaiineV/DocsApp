import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { getMyTeams } from '@/lib/teams'
import { getDictionary, getLocale } from '@/lib/i18n'
import { fmt } from '@/lib/i18n/format'
import MembersList from '@/components/members-list'
import InviteForm from '@/components/invite-form'
import PendingInvites from '@/components/pending-invites'
import TeamSettings from '@/components/team-settings'
import type { Invitation, Role, TeamMember } from '@/lib/types'

const RANK: Record<Role, number> = { viewer: 10, editor: 20, admin: 30, owner: 40 }

export default async function TeamMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [teams, user, { data: membersData }, { data: invitesData }] = await Promise.all([
    getMyTeams(),
    getAuthUser(),
    supabase.rpc('list_team_members', { p_team_id: id }),
    // RLS: solo admin+ ve invitaciones → para viewer/editor vuelve [].
    supabase
      .from('invitations')
      .select('id, team_id, email, role, token, invited_by, created_at, expires_at')
      .eq('team_id', id)
      .order('created_at', { ascending: false }),
  ])

  const team = teams.find((t) => t.id === id)
  if (!team || !user) notFound() // no sos miembro (o no existe) → 404

  const members = (membersData ?? []) as TeamMember[]
  const invites = (invitesData ?? []) as Invitation[]
  const canManage = RANK[team.role] >= RANK.admin
  const t = getDictionary(await getLocale())

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <Link href="/docs" className="text-sm text-zinc-500 hover:underline">
        {t.common.backToDocs}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{team.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">{fmt(t.members.subtitle, { role: team.role })}</p>

      {canManage ? (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t.members.sectionInvite}
          </h2>
          <div className="mt-3">
            <InviteForm teamId={id} />
          </div>

          {invites.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {fmt(t.members.sectionPending, { n: invites.length })}
              </h3>
              <div className="mt-3">
                <PendingInvites teamId={id} invites={invites} />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {fmt(t.members.sectionMembers, { n: members.length })}
        </h2>
        <div className="mt-3">
          <MembersList
            teamId={id}
            members={members}
            currentUserId={user.id}
            callerRole={team.role}
            canManage={canManage}
          />
        </div>
      </section>

      <TeamSettings
        teamId={id}
        currentName={team.name}
        canRename={canManage}
        canDelete={team.role === 'owner'}
      />
    </div>
  )
}
