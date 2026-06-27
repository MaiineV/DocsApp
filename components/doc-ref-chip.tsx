'use client'

import { createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'

// Mapa docId → título vivo (sembrado por el canvas con los docs del team). El
// chip resuelve el título vivo si el doc está en el team; si no (cross-team /
// borrado) cae al `label` snapshot guardado en el propio inline content.
export const DocTitleMapContext = createContext<Map<string, string>>(new Map())

// Render del inline content `docref`: un chip atómico que linkea a /docs/<id>.
export function DocRefChip({ docId, label }: { docId: string; label: string }) {
  const router = useRouter()
  const titles = useContext(DocTitleMapContext)
  const text = titles.get(docId) || label || ''

  const go = () => {
    if (docId) router.push(`/docs/${docId}`)
  }

  return (
    <span
      role="link"
      tabIndex={0}
      contentEditable={false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          go()
        }
      }}
      className="cursor-pointer rounded bg-blue-50 px-1 py-0.5 font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
    >
      @{text}
    </span>
  )
}
