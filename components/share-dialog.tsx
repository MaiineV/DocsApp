'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createShareLink, revokeShareLink } from '@/app/(app)/docs/actions'
import { useI18n } from '@/components/i18n-provider'
import { buttonClasses } from '@/components/ui/button'
import type { ActiveShare } from '@/lib/shares'

// Diálogo "Compartir con la web" (Notion "Share to web"). Gated a editor+ desde la
// page del doc (solo se monta si canEdit). Usa <details> como popover (igual que
// team-switcher: cierra al click-afuera/Escape). Estado local optimista; las
// actions (RLS editor+) son la fuente de verdad. No mostramos la URL absoluta en
// SSR (evita mismatch de hidratación): "Copiar" arma la URL con origin en el
// handler (client-only) y "Abrir" usa un href relativo.
export default function ShareDialog({
  docId,
  initialShare,
}: {
  docId: string
  initialShare: ActiveShare | null
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDetailsElement>(null)
  const [share, setShare] = useState<ActiveShare | null>(initialShare)
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cerrar al click afuera / Escape (el <details> nativo no lo hace).
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

  const path = share ? `/share/${share.token}` : ''

  function enable() {
    setError(null)
    startTransition(async () => {
      const res = await createShareLink(docId, false)
      if (res.ok && res.token) setShare({ token: res.token, include_subpages: false })
      else setError(res.error ?? t.errors.noSharePermission)
    })
  }

  function toggleSubpages(next: boolean) {
    if (!share) return
    const prev = share
    setError(null)
    setShare({ ...share, include_subpages: next }) // optimista
    startTransition(async () => {
      const res = await createShareLink(docId, next)
      if (!res.ok) {
        setShare(prev) // revertir
        setError(res.error ?? t.share.revokeError)
      }
    })
  }

  function revoke() {
    setError(null)
    startTransition(async () => {
      const res = await revokeShareLink(docId)
      if (res.ok) {
        setShare(null)
        setConfirmingRevoke(false)
      } else {
        setError(res.error ?? t.share.revokeError)
      }
    })
  }

  async function copy() {
    if (!path) return
    await navigator.clipboard.writeText(`${window.location.origin}${path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <details ref={ref} className="group relative">
      <summary
        className={`${buttonClasses('secondary', 'sm')} cursor-pointer list-none`}
      >
        {t.share.button}
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface p-4 shadow-lg">
        <p className="text-sm font-semibold">{t.share.title}</p>
        <p className="mt-1 text-xs text-muted">{t.share.description}</p>

        {error ? (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {share ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className={`${buttonClasses('primary', 'sm')} flex-1`}
              >
                {copied ? t.common.copied : t.share.copyLink}
              </button>
              <a
                href={path}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses('secondary', 'sm')}
              >
                {t.share.open} ↗
              </a>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={share.include_subpages}
                onChange={(e) => toggleSubpages(e.target.checked)}
                disabled={isPending}
                className="size-4 rounded border-input accent-[var(--primary)]"
              />
              {t.share.includeSubpages}
            </label>

            <div className="border-t border-border pt-3">
              {confirmingRevoke ? (
                <div>
                  <p className="mb-2 text-xs text-muted">{t.share.confirmRevoke}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={revoke}
                      disabled={isPending}
                      className={buttonClasses('danger', 'sm')}
                    >
                      {t.share.confirm}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRevoke(false)}
                      className={buttonClasses('ghost', 'sm')}
                    >
                      {t.share.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRevoke(true)}
                  className={buttonClasses('ghost', 'sm')}
                >
                  {t.share.revoke}
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={isPending}
            className={`${buttonClasses('primary', 'sm')} mt-3 w-full`}
          >
            {isPending ? t.share.enabling : t.share.enable}
          </button>
        )}
      </div>
    </details>
  )
}
