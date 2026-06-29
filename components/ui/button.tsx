import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
  secondary: 'border border-input text-fg hover:bg-ghost',
  ghost: 'text-muted hover:bg-ghost hover:text-fg',
  danger: 'border border-danger-border text-danger-fg hover:bg-danger-bg',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ' +
  'disabled:opacity-50 disabled:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg'

// Helper para componer las clases del botón sin renderizar un <button> (lo usan
// SubmitButton/NewDocButton, que traen su propia lógica de pending, y los <Link>
// con estilo de botón).
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra = '',
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim()
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return <button className={buttonClasses(variant, size, className)} {...props} />
}
