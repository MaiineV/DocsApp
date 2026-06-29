import type { ReactNode } from 'react'

const PADDING = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
} as const

// Superficie elevada: cards, paneles. Reemplaza el `rounded-xl border bg-white …`
// duplicado en auth-card / onboarding.
export function Card({
  padding = 'lg',
  className = '',
  children,
}: {
  padding?: keyof typeof PADDING
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface shadow-sm ${PADDING[padding]} ${className}`}
    >
      {children}
    </div>
  )
}
