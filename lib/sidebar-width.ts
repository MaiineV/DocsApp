// Ancho del sidebar de jerarquía (desktop). Puro (sin React/DOM) → lo usan el
// layout server (parsear la cookie para SSR sin salto) y el componente client
// (clamp durante el drag y mapeo de teclado). Persistencia en cookie, igual
// que el colapso: el segmento docs/[id] se re-renderiza en cada navegación.

export const SIDEBAR_WIDTH_COOKIE = 'docs_sidebar_width'
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 480
/** 256px = `w-64` (16rem), el ancho fijo que tenía el sidebar antes. */
export const SIDEBAR_DEFAULT_WIDTH = 256
export const SIDEBAR_KEY_STEP = 16
export const SIDEBAR_KEY_STEP_LARGE = 64

export function clampSidebarWidth(n: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(n)))
}

/** Cookie ausente/basura → default; número → clamp. Nunca lanza (corre en SSR). */
export function parseSidebarWidthCookie(value: string | undefined): number {
  if (value === undefined || value === '') return SIDEBAR_DEFAULT_WIDTH
  const n = Number(value)
  return Number.isFinite(n) ? clampSidebarWidth(n) : SIDEBAR_DEFAULT_WIDTH
}

/** Teclado del "window splitter" (WAI-ARIA). `null` = tecla no manejada. */
export function sidebarWidthForKey(key: string, shift: boolean, current: number): number | null {
  const step = shift ? SIDEBAR_KEY_STEP_LARGE : SIDEBAR_KEY_STEP
  switch (key) {
    case 'ArrowLeft':
      return clampSidebarWidth(current - step)
    case 'ArrowRight':
      return clampSidebarWidth(current + step)
    case 'Home':
      return SIDEBAR_MIN_WIDTH
    case 'End':
      return SIDEBAR_MAX_WIDTH
    case 'Enter':
      return SIDEBAR_DEFAULT_WIDTH
    default:
      return null
  }
}
