'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import { useI18n } from '@/components/i18n-provider'
import { SubmitButton } from '@/components/submit-button'
import Avatar from '@/components/avatar'

// Menú de cuenta en el header: agrupa "Mi perfil" + "Cerrar sesión" bajo un
// único trigger (avatar + nombre), mismo patrón <details> que TeamSwitcher /
// ShareDialog (disclosure nativo + cerrar al click-afuera/Escape).
export default function AccountMenu({
  userId,
  avatarUrl,
  displayName,
}: {
  userId: string
  avatarUrl: string | null
  displayName: string
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current
      if (el?.open && e.target instanceof Node && !el.contains(e.target)) el.open = false
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) ref.current.open = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const itemClasses =
    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <details ref={ref} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 transition-colors hover:bg-ghost">
        <Avatar src={avatarUrl} name={displayName} seed={userId} size={26} />
        <span className="hidden max-w-[10rem] truncate text-sm text-muted sm:inline">{displayName}</span>
        <span
          aria-hidden
          className="hidden shrink-0 text-[10px] text-subtle transition-transform group-open:rotate-180 sm:inline"
        >
          ▾
        </span>
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-border bg-surface p-1 shadow-lg">
        <Link href="/profile" className={itemClasses} onClick={() => ref.current && (ref.current.open = false)}>
          {t.profile.title}
        </Link>
        <form action={signOut}>
          <SubmitButton spinner={false} className={`${itemClasses} text-danger-fg`}>
            {t.header.signOut}
          </SubmitButton>
        </form>
      </div>
    </details>
  )
}
