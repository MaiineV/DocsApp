'use client'

import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'

// Botón submit con feedback de pending automático para forms con Server Actions.
// useFormStatus lee el estado del <form> ancestro → debe renderizarse DENTRO del
// form. Muestra spinner + se deshabilita mientras la action corre.
//   - spinner=false: solo atenúa (para items donde el spinner rompe el layout,
//     p.ej. los del team-switcher, que además navegan y muestran el loading.tsx).
type Props = ComponentProps<'button'> & { spinner?: boolean }

export function SubmitButton({
  children,
  className = '',
  spinner = true,
  disabled,
  ...rest
}: Props) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={`${className} ${pending ? 'cursor-wait opacity-70' : ''}`}
      {...rest}
    >
      {pending && spinner ? <Spinner /> : null}
      {children}
    </button>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="mr-2 inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent align-[-2px]"
    />
  )
}
