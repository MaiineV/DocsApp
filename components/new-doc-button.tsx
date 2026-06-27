'use client'

import { useTransition, type ReactNode } from 'react'
import { createDocument } from '@/app/(app)/docs/actions'

// Botón de crear documento con idempotencia: genera una key FRESCA por click y
// llama a createDocument en una transición; queda DESHABILITADO mientras crea
// (el disabled corta el doble-click; la key dedupea en el server ante reintentos).
// Key fresca-por-click → no rompe crear varios docs/hijos legítimos.
export default function NewDocButton({
  parentId = null,
  label,
  className,
  ariaLabel,
}: {
  parentId?: string | null
  label: ReactNode
  className?: string
  ariaLabel?: string
}) {
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={() => {
        const key = crypto.randomUUID()
        start(async () => {
          await createDocument(parentId, key)
        })
      }}
      className={className}
    >
      {pending ? '…' : label}
    </button>
  )
}
