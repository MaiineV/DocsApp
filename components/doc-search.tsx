'use client'

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n-provider'
import { searchDocuments } from '@/app/(app)/docs/actions'
import type { SearchResult } from '@/lib/types'
import { controlClasses } from '@/components/ui/input'

const DEBOUNCE_MS = 250
const MIN_CHARS = 2

// Buscador de documentos reutilizable. `panel`: resultados en dropdown absoluto
// (header desktop). `inline`: resultados en flujo (sidebar / overlay mobile).
export default function DocSearch({
  variant = 'panel',
  autoFocus = false,
  onNavigate,
  className = '',
}: {
  variant?: 'panel' | 'inline'
  autoFocus?: boolean
  onNavigate?: () => void
  className?: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Cerrar el dropdown al click afuera (solo variante panel). El callback corre en
  // un event handler, no en el cuerpo del effect (ok para el lint).
  useEffect(() => {
    if (variant !== 'panel') return
    const onPointerDown = (e: PointerEvent) => {
      if (open && rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, variant])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function runSearch(q: string) {
    startTransition(async () => {
      const r = await searchDocuments(q)
      setResults(r)
      setActive(0)
      setOpen(true)
    })
  }

  function onChange(value: string) {
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    if (value.trim().length < MIN_CHARS) {
      setResults([])
      setOpen(false)
      return
    }
    timer.current = setTimeout(() => runSearch(value), DEBOUNCE_MS)
  }

  function go(id: string) {
    setOpen(false)
    setQuery('')
    setResults([])
    onNavigate?.()
    router.push(`/docs/${id}`)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      e.currentTarget.blur()
      return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[active]
      if (r) go(r.id)
    }
  }

  const showPanel = open && query.trim().length >= MIN_CHARS
  const listClasses =
    variant === 'panel'
      ? 'absolute left-0 z-30 mt-1 max-h-[60vh] w-full min-w-[16rem] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg'
      : 'mt-1 max-h-[50vh] overflow-y-auto'

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (query.trim().length >= MIN_CHARS) setOpen(true)
        }}
        autoFocus={autoFocus}
        placeholder={t.search.placeholder}
        aria-label={t.search.label}
        className={controlClasses}
      />

      {showPanel ? (
        <ul className={listClasses}>
          {results.length === 0 ? (
            <li className="px-2 py-2 text-sm text-muted">
              {pending ? t.search.searching : t.search.noResults}
            </li>
          ) : (
            results.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.id)}
                  className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-none ${
                    i === active ? 'bg-active' : 'hover:bg-ghost'
                  }`}
                >
                  <span className="w-full truncate text-sm text-fg">
                    {r.icon ? <span className="mr-1.5">{r.icon}</span> : null}
                    {r.title || t.common.untitled}
                  </span>
                  {r.team ? <span className="text-xs text-subtle">{r.team}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
