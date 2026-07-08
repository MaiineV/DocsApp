'use client'

import { useEffect, useRef, useState } from 'react'
import { EMOJI_CATEGORIES } from '@/lib/emoji-data'
import { useI18n } from '@/components/i18n-provider'

// Picker de emoji para el ícono del documento (estilo Notion, set curado sin
// dependencia externa). Popover con <details> (disclosure nativo, accesible por
// teclado) + click-afuera/Escape, mismo patrón que team-switcher/share-dialog.
export default function EmojiPicker({
  value,
  onSelect,
}: {
  value: string | null
  // null = quitar el ícono.
  onSelect: (icon: string | null) => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDetailsElement>(null)
  const [query, setQuery] = useState('')

  // Cerrar al click afuera o con Escape (el <details> nativo no lo hace).
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

  function pick(icon: string | null) {
    onSelect(icon)
    setQuery('')
    if (ref.current) ref.current.open = false
  }

  const q = query.trim().toLowerCase()
  const filtered = EMOJI_CATEGORIES.map((cat) => ({
    key: cat.key,
    emojis: q ? cat.emojis.filter((e) => e.name.includes(q)) : cat.emojis,
  })).filter((cat) => cat.emojis.length > 0)

  return (
    <details ref={ref} className="relative shrink-0">
      <summary
        aria-label={value ? t.emoji.changeIcon : t.emoji.addIcon}
        className={
          value
            ? 'inline-grid size-11 cursor-pointer list-none place-items-center rounded-md text-3xl transition-colors hover:bg-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            : 'inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-xs text-subtle transition-colors hover:bg-ghost hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        }
      >
        {value ?? <>☺ {t.emoji.addIcon}</>}
      </summary>

      <div className="absolute left-0 z-30 mt-2 flex max-h-[min(60vh,22rem)] w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
        <div className="flex items-center gap-1 border-b border-border p-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.emoji.search}
            aria-label={t.emoji.search}
            className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm text-fg outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
          />
          {value ? (
            <button
              type="button"
              onClick={() => pick(null)}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-subtle transition-colors hover:bg-ghost hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.emoji.removeIcon}
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-1 py-2 text-xs text-subtle">{t.emoji.noResults}</p>
          ) : (
            filtered.map((cat) => (
              <div key={cat.key}>
                <p className="px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-subtle first:pt-0">
                  {t.emoji.categories[cat.key]}
                </p>
                <div className="grid grid-cols-8">
                  {cat.emojis.map((e) => (
                    <button
                      key={e.char}
                      type="button"
                      onClick={() => pick(e.char)}
                      aria-label={e.name}
                      title={e.name}
                      className="inline-grid size-8 place-items-center rounded text-lg transition-colors hover:bg-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {e.char}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </details>
  )
}
