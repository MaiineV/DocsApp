import type { ReactNode } from 'react'

export type AlertVariant = 'danger' | 'info' | 'success'

const VARIANTS: Record<AlertVariant, string> = {
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-surface-sunken text-muted',
  success: 'bg-surface-sunken text-success',
}

// Banner de mensaje con shape uniforme. Reemplaza el `rounded-md bg-red-50 …`
// duplicado en auth/onboarding/members/invites/docs.
export function Alert({
  variant = 'danger',
  className = '',
  children,
}: {
  variant?: AlertVariant
  className?: string
  children: ReactNode
}) {
  return (
    <p
      role={variant === 'danger' ? 'alert' : undefined}
      className={`rounded-md px-3 py-2 text-sm ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </p>
  )
}
