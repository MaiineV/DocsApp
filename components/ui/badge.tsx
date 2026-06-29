import type { ReactNode } from 'react'

export type BadgeVariant = 'neutral' | 'danger' | 'success'

const VARIANTS: Record<BadgeVariant, string> = {
  // Dirección "pulido neutral": badges monocromos (sin color por rol).
  neutral: 'bg-badge text-badge-fg',
  danger: 'bg-danger-bg text-danger-fg',
  success: 'bg-surface-sunken text-success',
}

export function Badge({
  variant = 'neutral',
  className = '',
  children,
}: {
  variant?: BadgeVariant
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
