import { fail, withHeaders } from '@/lib/api/respond'
import type { ApiAuth } from '@/lib/api/auth'

// Rate-limiting de la API (fixed-window en Postgres). El contador se incrementa
// atómicamente en la RPC `hit_rate_limit`, que deriva el bucket de `auth.uid()`
// (por usuario). Cada respuesta lleva `X-RateLimit-*`; al exceder → 429 +
// `Retry-After`. Fail-open: si el limiter falla (p. ej. la RPC no responde), NO se
// bloquea la API — preferimos disponibilidad a un limiter frágil.

export const RATE_LIMIT = 120 // requests por ventana
export const RATE_WINDOW_SECONDS = 60

export type RateLimit = {
  headers: Record<string, string>
  limited: Response | null
}

const NO_LIMIT: RateLimit = { headers: {}, limited: null }

export async function enforceRateLimit(auth: ApiAuth): Promise<RateLimit> {
  const { data, error } = await auth.supabase.rpc('hit_rate_limit', {
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  })
  const row = (data as { allowed: boolean; remaining: number; reset_at: string }[] | null)?.[0]
  if (error || !row) return NO_LIMIT // fail-open

  const resetEpoch = Math.floor(new Date(row.reset_at).getTime() / 1000)
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(RATE_LIMIT),
    'X-RateLimit-Remaining': String(row.remaining),
    'X-RateLimit-Reset': String(resetEpoch),
  }

  if (!row.allowed) {
    const retryAfter = Math.max(1, resetEpoch - Math.floor(Date.now() / 1000))
    const limited = withHeaders(
      fail('too_many_requests', 'Límite de requests alcanzado. Reintentá más tarde.'),
      { ...headers, 'Retry-After': String(retryAfter) },
    )
    return { headers, limited }
  }

  return { headers, limited: null }
}
