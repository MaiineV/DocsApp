import type { ComponentProps } from 'react'

// Bloque pulsante reusable para los loading.tsx. Mismo estilo que el placeholder
// del editor. Componente puro → se puede usar en Server Components / loading.tsx.
export function Skeleton({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-black/5 dark:bg-white/5 ${className}`}
      {...props}
    />
  )
}
