'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { useI18n } from '@/components/i18n-provider'

type Theme = 'light' | 'dark' | 'system'
const ORDER: Theme[] = ['system', 'light', 'dark']

function resolveDark(theme: Theme): boolean {
  return (
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  )
}

// Aplica el tema al <html> (mismo contrato que el script anti-flash del layout).
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', resolveDark(theme) ? 'dark' : 'light')
}

// Store del tema (localStorage + listeners) para useSyncExternalStore: evita
// setState-dentro-de-effect (prohibido por el lint) y maneja SSR con un snapshot
// 'system' en el server (el script del layout ya pintó el tema real sin flash).
const listeners = new Set<() => void>()
function readTheme(): Theme {
  return (localStorage.getItem('theme') as Theme | null) ?? 'system'
}
function writeTheme(theme: Theme) {
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // localStorage no disponible (modo privado): el tema igual se aplica en runtime.
  }
  applyTheme(theme)
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemChange = () => {
    if (readTheme() === 'system') applyTheme('system')
    cb()
  }
  mq.addEventListener('change', onSystemChange)
  return () => {
    listeners.delete(cb)
    mq.removeEventListener('change', onSystemChange)
  }
}

const ICONS: Record<Theme, ReactNode> = {
  system: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  light: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  ),
  dark: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
}

// Toggle de tema: cicla sistema → claro → oscuro. Persiste en localStorage y
// reaplica al <html>.
export default function ThemeToggle() {
  const { t } = useI18n()
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme)

  function cycle() {
    writeTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length])
  }

  const label = `${t.theme.label}: ${t.theme[theme]}`

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-ghost hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {ICONS[theme]}
    </button>
  )
}
