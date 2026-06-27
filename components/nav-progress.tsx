'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Barra de progreso global en navegación. Cubre los casos que el loading.tsx no
// puede (primer ingreso a la app, o acciones que revalidan el layout, p.ej.
// cambiar de team). Arranca al intentar navegar (click en link interno / submit
// de form con Server Action) y se oculta cuando cambia el pathname (navegación
// completa), con una red de seguridad por timeout. Indeterminada (no trackea %).
export default function NavProgress() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const lastPath = useRef(pathname)
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Arranque por intención de navegación (eventos del DOM, no en render).
  useEffect(() => {
    const start = () => {
      setActive(true)
      if (safety.current) clearTimeout(safety.current)
      safety.current = setTimeout(() => setActive(false), 5000)
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return
      }
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || !href.startsWith('/') || href.startsWith('//')) return
      if (anchor.getAttribute('target') === '_blank') return
      const dest = href.split('#')[0].split('?')[0]
      if (dest === window.location.pathname) return // misma página
      start()
    }
    const onSubmit = () => start()
    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
    }
  }, [])

  // Navegación completada: cambió el pathname → ocultar.
  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    if (safety.current) clearTimeout(safety.current)
    setActive(false)
  }, [pathname])

  useEffect(() => () => { if (safety.current) clearTimeout(safety.current) }, [])

  if (!active) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden">
      <div className="absolute top-0 h-full w-2/5 animate-[nav-progress-slide_1.1s_ease-in-out_infinite] bg-zinc-900 dark:bg-white" />
    </div>
  )
}
