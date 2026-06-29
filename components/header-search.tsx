'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import DocSearch from '@/components/doc-search'
import { IconButton } from '@/components/ui/icon-button'
import { useI18n } from '@/components/i18n-provider'

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

// Búsqueda en el header con UX contextual:
//  - Desktop (md+), fuera de la página de un doc: input inline (en la página de un
//    doc la búsqueda vive en el sidebar, así que acá se oculta).
//  - Mobile (<md), cualquier página: ícono de lupa → overlay full-screen (el header
//    y el sidebar quedan muy apretados en pantallas chicas).
export default function HeaderSearch() {
  const { t } = useI18n()
  const pathname = usePathname()
  const onDocPage = /^\/docs\/[^/]+/.test(pathname ?? '')
  const [overlayOpen, setOverlayOpen] = useState(false)

  return (
    <>
      {!onDocPage ? (
        <DocSearch variant="panel" className="hidden w-48 md:block lg:w-64" />
      ) : null}

      <IconButton
        label={t.search.label}
        className="md:hidden"
        onClick={() => setOverlayOpen(true)}
      >
        <SearchIcon />
      </IconButton>

      {overlayOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
          onClick={() => setOverlayOpen(false)}
        >
          <div
            className="mx-auto mt-14 w-[min(92vw,30rem)] rounded-xl border border-border bg-surface p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <DocSearch variant="inline" autoFocus onNavigate={() => setOverlayOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  )
}
