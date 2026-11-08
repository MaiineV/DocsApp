'use client'

import { useEffect, useRef } from 'react'

// Picker con el mismo patrón <details> que TeamSwitcher/AccountMenu/ShareDialog
// (disclosure nativo + cerrar al click-afuera/Escape). A diferencia de un
// <select> nativo, el popup se pinta con nuestros tokens de color de forma
// consistente entre navegadores/SO — el listbox nativo del <select> no siempre
// respeta `color-scheme` (notado en Chrome/Windows).
export default function Listbox<T extends string>({
  value,
  options,
  labels,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: T
  options: T[]
  labels: Record<T, string>
  disabled?: boolean
  ariaLabel: string
  onChange: (value: T) => void
}) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current
      if (el?.open && e.target instanceof Node && !el.contains(e.target)) el.open = false
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) ref.current.open = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  if (disabled) {
    return (
      <span className="rounded-md border border-input px-2 py-1 text-sm text-muted opacity-50">
        {labels[value]}
      </span>
    )
  }

  return (
    <details ref={ref} className="group relative">
      <summary
        aria-label={ariaLabel}
        className="flex min-w-[6rem] cursor-pointer list-none items-center justify-between gap-1.5 rounded-md border border-input px-2 py-1 text-sm transition-colors hover:bg-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{labels[value]}</span>
        <span aria-hidden className="shrink-0 text-[10px] text-subtle transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div role="listbox" className="absolute right-0 z-20 mt-1 w-32 rounded-lg border border-border bg-surface p-1 shadow-lg">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="option"
            aria-selected={o === value}
            onClick={() => {
              if (ref.current) ref.current.open = false
              if (o !== value) onChange(o)
            }}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-ghost ${
              o === value ? 'font-semibold' : ''
            }`}
          >
            {labels[o]}
            {o === value ? <span aria-hidden>✓</span> : null}
          </button>
        ))}
      </div>
    </details>
  )
}
