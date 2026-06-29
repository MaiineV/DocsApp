import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente Supabase para la API REST pública (`/api/v1`). A diferencia del cliente
// de cookies (`@/lib/supabase/server`), este se autentica con un Bearer token que
// el proyecto local manda en cada request: el header `Authorization` viaja a
// PostgREST, así que la RLS aplica EXACTAMENTE como ese usuario (mismos roles por
// team) sin reimplementar authz. Sin sesión persistida ni auto-refresh: el token
// es responsabilidad del caller (lo renueva su propio cliente).
export function createApiClient(jwt: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
