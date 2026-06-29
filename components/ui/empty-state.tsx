import type { ReactNode } from 'react'

// Estado vacío con CTA: borde punteado, centrado, con espacio para una acción
// (p.ej. el botón de crear) en vez de solo texto plano.
export function EmptyState({
  title,
  action,
  className = '',
}: {
  title: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-12 text-center text-muted ${className}`}
    >
      <p className="max-w-sm text-sm">{title}</p>
      {action}
    </div>
  )
}
