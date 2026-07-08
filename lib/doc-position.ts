// Fractional indexing para el orden manual de hermanos (drag & drop). Puro
// (sin React/Supabase) → la server action y el optimistic UI del cliente usan
// la MISMA aritmética. Espeja la migración document_ordering: gap base 1024,
// midpoint entre vecinos, renormalización lazy cuando el gap se agota.

export const POSITION_GAP = 1024

export type PositionedSibling = { id: string; position: number }

// Posición entre dos vecinos. `null` en prev = antes del primero; `null` en
// next = después del último. Devuelve null cuando el midpoint ya no es
// representable en float64 (gap agotado) → señal de renormalizar.
export function positionBetween(prev: number | null, next: number | null): number | null {
  if (prev === null && next === null) return POSITION_GAP
  if (prev === null) return next! - POSITION_GAP
  if (next === null) return prev + POSITION_GAP
  const mid = (prev + next) / 2
  return mid > prev && mid < next ? mid : null
}

// Posición para caer justo DESPUÉS de `afterId` dentro de `siblings` (ya
// ordenados por position asc y SIN el doc que se mueve). afterId null = primer
// lugar. afterId ausente (cliente stale) = al final, que es lo menos sorpresivo.
export function positionAfter(
  siblings: PositionedSibling[],
  afterId: string | null,
): number | null {
  if (siblings.length === 0) return POSITION_GAP
  if (afterId === null) return positionBetween(null, siblings[0].position)

  const idx = siblings.findIndex((s) => s.id === afterId)
  if (idx === -1) return positionBetween(siblings[siblings.length - 1].position, null)

  const next = idx + 1 < siblings.length ? siblings[idx + 1].position : null
  return positionBetween(siblings[idx].position, next)
}
