'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { setActiveTeam } from '@/app/(app)/teams/actions'
import { SubmitButton } from '@/components/submit-button'
import { useI18n } from '@/components/i18n-provider'
import type { TeamWithRole } from '@/lib/teams'

// Selector de team activo en el header. Usa <details> (disclosure nativo,
// accesible por teclado). Cada team es un form con el Server Action bindeado →
// funciona sin JS; el JS solo agrega cerrar al click-afuera / Escape.
export default function TeamSwitcher({
  teams,
  activeTeamId,
}: {
  teams: TeamWithRole[]
  activeTeamId: string | null
}) {
  const { t: tr } = useI18n()
  const ref = useRef<HTMLDetailsElement>(null)

  // Cerrar el menú al click afuera o con Escape (el <details> nativo no lo hace).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current
      if (el?.open && e.target instanceof Node && !el.contains(e.target)) {
        el.open = false
      }
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

  const active = teams.find((t) => t.id === activeTeamId) ?? teams[0]
  if (!active) return null

  const itemClasses =
    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <details ref={ref} className="group relative min-w-0">
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="max-w-[7rem] truncate sm:max-w-[12rem]">{active.name}</span>
        <span className="shrink-0 text-subtle">· {active.role}</span>
        <span aria-hidden className="shrink-0 text-[10px] transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      {/* Panel: ancho acotado al viewport en mobile; alto limitado con scroll. */}
      <div className="absolute left-0 z-20 mt-2 flex max-h-[min(70vh,28rem)] w-64 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
          {tr.header.teams}
        </p>

        {/* Lista de equipos: scrollea si hay muchos (panel con scroll). */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {teams.map((t) => (
            <form key={t.id} action={setActiveTeam.bind(null, t.id)}>
              <SubmitButton
                spinner={false}
                className={`${itemClasses} ${t.id === active.id ? 'font-semibold' : ''}`}
              >
                <span className="truncate">{t.name}</span>
                <span className="ml-2 shrink-0 text-xs text-subtle">
                  {t.id === active.id ? '✓ ' : ''}
                  {t.role}
                </span>
              </SubmitButton>
            </form>
          ))}
        </div>

        {/* Acciones fijas (siempre alcanzables, fuera del scroll). */}
        <div className="mt-1 border-t border-border pt-1">
          <Link href={`/teams/${active.id}`} className={itemClasses}>
            {tr.header.manageTeam}
          </Link>
          <Link href="/teams/new" className={itemClasses}>
            {tr.header.createTeam}
          </Link>
        </div>
      </div>
    </details>
  )
}
