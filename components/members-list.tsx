'use client'

import { useState, useTransition } from 'react'
import { changeMemberRole, removeMember } from '@/app/(app)/teams/[id]/actions'
import { useI18n } from '@/components/i18n-provider'
import { fmt } from '@/lib/i18n/format'
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

  function onRemove(userId: string, email: string, self: boolean) {
    const msg = self ? t.members.confirmLeave : fmt(t.members.confirmRemove, { email })
    if (!window.confirm(msg)) return
    setError(null)
    startTransition(async () => {
      const res = await removeMember(teamId, userId)
      if (!res.ok) setError(res.error ?? t.errors.removeFailed)
    })
  }

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-black/10 dark:divide-white/10">
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

          return (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <span className="truncate font-medium">{m.email}</span>
                {self ? (
                  <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800">
                    {t.members.you}
                  </span>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {canManage ? (
                  <select
                    aria-label={fmt(t.members.roleOf, { email: m.email })}
                    value={m.role}
                    disabled={!roleEditable || isPending}
                    onChange={(e) => onRoleChange(m.user_id, e.target.value as Role)}
                    className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none disabled:opacity-50 dark:border-white/15"
                  >
                    {options.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-zinc-500">{m.role}</span>
                )}

                {removable ? (
                  <button
                    type="button"
                    onClick={() => onRemove(m.user_id, m.email, self)}
                    disabled={isPending}
                    className="rounded-md border border-red-200 px-2.5 py-1 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    {self ? t.members.leave : t.members.remove}
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {canManage && ownerCount === 1 ? (
        <p className="mt-3 text-xs text-zinc-400">{t.members.lastOwnerNote}</p>
      ) : null}
    </div>
  )
}
