import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'

// Clases compartidas de control de formulario (input/select). Incluye focus ring
// con el token (antes era `outline-none` sin reemplazo → roto para teclado).
export const controlClasses =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-fg ' +
  'transition-colors placeholder:text-subtle ' +
  'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClasses} ${className}`} {...props} />
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${controlClasses} ${className}`} {...props}>
      {children}
    </select>
  )
}

// Campo con label asociado (la label envuelve el control → asociación implícita,
// sin necesidad de id). `error` opcional en color de peligro.
export function Field({
  label,
  error,
  className = '',
  children,
}: {
  label: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="block text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger-fg">{error}</span> : null}
    </label>
  )
}
