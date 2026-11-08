'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n-provider'

function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

// Link de "Calendario" en el header, con estado activo (usePathname necesita
// 'use client', por eso vive separado del layout que es server component).
export default function CalendarNavLink({ teamId }: { teamId: string }) {
  const { t } = useI18n()
  const pathname = usePathname()
  const href = `/teams/${teamId}/calendar`
  const isActive = pathname === href

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:bg-ghost hover:text-fg ${
        isActive ? 'bg-active text-fg' : 'text-muted'
      }`}
    >
      <CalendarIcon />
      <span className="hidden sm:inline">{t.header.calendar}</span>
    </Link>
  )
}
