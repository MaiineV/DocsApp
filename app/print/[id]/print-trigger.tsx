'use client'

import { useEffect } from 'react'

// Barra de pantalla del export (oculta al imprimir) + disparo automático del
// diálogo de impresión. Espera fuentes e imágenes: si se imprime antes, el PDF
// sale con huecos o con la fuente fallback.
export function PrintTrigger({
  backHref,
  labels,
}: {
  backHref: string
  labels: { print: string; back: string; hint: string }
}) {
  useEffect(() => {
    // Respaldo del script FORCE_LIGHT de la page (un <script> inline no corre si se
    // llega por navegación client-side).
    document.documentElement.setAttribute('data-theme', 'light')
    let cancelled = false
    const pending = Array.from(document.images)
      .filter((img) => !img.complete)
      .map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
      )
    Promise.all([document.fonts.ready, ...pending]).then(() => {
      if (!cancelled) window.print()
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="print-toolbar">
      <a href={backHref} className="print-toolbar-link">
        {labels.back}
      </a>
      <span className="print-toolbar-hint">{labels.hint}</span>
      <button type="button" onClick={() => window.print()} className="print-toolbar-button">
        {labels.print}
      </button>
    </div>
  )
}
