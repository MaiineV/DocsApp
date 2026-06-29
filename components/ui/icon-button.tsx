import type { ButtonHTMLAttributes } from 'react'

export type IconButtonSize = 'sm' | 'md'

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-7',
  md: 'size-9',
}

const BASE =
  'inline-grid place-items-center rounded-md text-muted transition-colors ' +
  'hover:bg-ghost hover:text-fg disabled:opacity-50 disabled:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function iconButtonClasses(size: IconButtonSize = 'md', extra = ''): string {
  return `${BASE} ${SIZES[size]} ${extra}`.trim()
}

// Botón solo-ícono con `aria-label` OBLIGATORIO (accesibilidad). Para íconos de
// header/standalone. Los toggles densos del árbol del sidebar usan su propio
// padding responsive (ver doc-sidebar).
export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string
  size?: IconButtonSize
}

export function IconButton({ label, size = 'md', className = '', ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={iconButtonClasses(size, className)}
      {...props}
    />
  )
}
