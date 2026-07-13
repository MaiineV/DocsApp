import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Shape mínimo que consume la app (los mismos campos que usaba del `User` de
// getUser): evita churn en los call sites. Derivado de los claims del JWT.
export type AuthUser = {
  id: string
  email?: string
  app_metadata?: { provider?: string; providers?: string[] } & Record<string, unknown>
}

// Usuario autenticado del request actual, con `React.cache`: una sola
// verificación por render pass, compartida entre layout, page, getMyTeams y
// getMyProfile. `getClaims()` valida la FIRMA del JWT: local (WebCrypto +
// JWKS cacheado 10 min a nivel módulo) si el proyecto usa claves asimétricas;
// con secreto simétrico cae a una llamada a Auth (= getUser, sin regresión).
// Trade-off asumido (patrón oficial Supabase): no consulta revocación
// server-side — una sesión cerrada/baneada vale hasta su `exp` (≤1h); la RLS
// sigue gateando cada query por usuario. Null si no hay sesión.
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data) return null
  const { claims } = data
  return {
    id: claims.sub,
    email: claims.email,
    app_metadata: claims.app_metadata as AuthUser['app_metadata'],
  }
})
