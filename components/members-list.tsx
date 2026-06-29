'use client'

import { useState, useTransition } from 'react'
import { changeMemberRole, removeMember } from '@/app/(app)/teams/[id]/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
import { displayName } from '@/lib/collab'
import Avatar from '@/components/avatar'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonClasses } from '@/components/ui/button'
import type { Role, TeamMember } from '@/lib/types'

const ALL_ROLES: Role[] = ['viewer', 'editor', 'admin', 'owner']

type Props = {
  teamId: string
  members: TeamMember[]
  currentUserId: string
  callerRole: Role
  canManage: boolean // callerRole es admin+
}

export default function MembersList({
  teamId,
  members,
  currentUserId,
  callerRole,
  canManage,
}: Props) {
  const { t } = useI18n()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // userId being confirmed for removal, or null when no confirmation open
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const ownerCount = members.filter((m) => m.role === 'owner').length
  // Solo un owner puede asignar el rol owner.
  const assignable = callerRole === 'owner' ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'owner')

  function onRoleChange(userId: string, role: Role) {
    setError(null)
    startTransition(async () => {
      const res = await changeMemberRole(teamId, userId, role)
      if (!res.ok) setError(res.error ?? t.errors.changeRoleFailed)
    })
  }

  function onRemoveConfirmed(userId: string) {
    setConfirmingId(null)
    setError(null)
    startTransition(async () => {
      const res = await removeMember(teamId, userId)
      if (!res.ok) setError(res.error ?? t.errors.removeFailed)
    })
  }

  return (
    <div>
      {error ? (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}

      <ul className="divide-y divide-border">
        {members.map((m) => {
          const self = m.user_id === currentUserId
          const isOwner = m.role === 'owner'
          const isLastOwner = isOwner && ownerCount === 1
          // Editar a un owner requiere ser owner (lo refuerza la RLS igual).
          const lockedByOwnership = isOwner && callerRole !== 'owner'
          const roleEditable = canManage && !isLastOwner && !lockedByOwnership
          const removable = !isLastOwner && (self || (canManage && !lockedByOwnership))
          // Si el rol actual no está en las opciones asignables, mostrarlo igual.
          const options = assignable.includes(m.role) ? assignable : [...assignable, m.role]
          const isConfirming = confirmingId === m.user_id

          return (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar src={m.avatar_url} name={displayName(m.nickname, m.email)} seed={m.user_id} size={32} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{displayName(m.nickname, m.email)}</span>
                    {self ? (
                      <Badge variant="neutral">{t.members.you}</Badge>
                    ) : null}
                  </div>
                  <span className="block truncate text-xs text-muted">{m.email}</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {canManage ? (
                  <select
                    aria-label={fmt(t.members.roleOf, { email: m.email })}
                    value={m.role}
                    disabled={!roleEditable || isPending}
                    onChange={(e) => onRoleChange(m.user_id, e.target.value as Role)}
                    className="rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none disabled:opacity-50"
                  >
                    {options.map((r) => (
                      <option key={r} value={r}>
                        {t.roles[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge variant="neutral">{t.roles[m.role]}</Badge>
                )}

                {removable ? (
                  isConfirming ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted">
                        {self ? t.members.confirmLeave : fmt(t.members.confirmRemove, { email: m.email })}
                      </span>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onRemoveConfirmed(m.user_id)}
                        disabled={isPending}
                      >
                        {self ? t.members.leave : t.members.remove}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={isPending}
                        className={buttonClasses('ghost', 'sm')}
                      >
                        {t.teamSettings.cancel}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(m.user_id)}
                      disabled={isPending}
                      className={buttonClasses('danger', 'sm')}
                    >
                      {self ? t.members.leave : t.members.remove}
                    </button>
                  )
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {canManage && ownerCount === 1 ? (
        <p className="mt-3 text-xs text-muted">{t.members.lastOwnerNote}</p>
      ) : null}
    </div>
  )
}
