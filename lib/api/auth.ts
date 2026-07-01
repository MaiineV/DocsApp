import type { SupabaseClient } from '@supabase/supabase-js'
import { createApiClient, createAnonApiClient } from '@/lib/supabase/api'
import { mintSupabaseJwt, sha256hex } from '@/lib/api/jwt'
import { fail } from '@/lib/api/respond'

export type ApiScope = 'read' | 'read_write'

// Resultado de autenticar un request de la API. `user` es mínimo a propósito (los
// handlers solo usan `user.id`); `scope` gatea escritura; `tokenId` es el id del PAT
// (o null si vino por JWT Bearer).
export type ApiAuth = {
  supabase: SupabaseClient
  user: { id: string }
  jwt: string
  scope: ApiScope
  tokenId: string | null
}

// Prefijo de los Personal Access Tokens. Si el Bearer arranca con esto, es un PAT
// (no un JWT de Supabase) y se resuelve por hash.
const PAT_PREFIX = 'dapp_'

// Autentica un request de la API por `Authorization: Bearer <token>`.
//
// Dos caminos:
//  - **PAT** (`dapp_…`): se busca por hash vía la RPC `consume_api_token` (rol anon,
//    pre-auth), y si es válido se mintea un JWT HS256 efímero para ese usuario, de
//    modo que la RLS aplique igual que con un login real. `scope` sale del token.
//  - **JWT Bearer** (lo actual): `getUser(jwt)` revalida el token contra Auth y
//    devuelve el cliente bindeado; scope implícito `read_write`.
//
// Si falla, devuelve `{ error: Response }` (401) listo para retornar.
export async function authenticateRequest(
  request: Request,
): Promise<ApiAuth | { error: Response }> {
  const header =
    request.headers.get('authorization') ?? request.headers.get('Authorization')
  const match = header?.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return { error: fail('unauthorized', 'Falta el header Authorization: Bearer <token>.') }
  }

  const token = match[1].trim()
  return token.startsWith(PAT_PREFIX)
    ? authenticateWithPat(token)
    : authenticateWithJwt(token)
}

async function authenticateWithPat(
  token: string,
): Promise<ApiAuth | { error: Response }> {
  const anon = createAnonApiClient()
  const { data, error } = await anon.rpc('consume_api_token', { p_hash: sha256hex(token) })
  if (error) {
    return { error: fail('internal', error.message) }
  }
  const row = (data as { token_id: string; user_id: string; scope: ApiScope }[] | null)?.[0]
  if (!row) {
    return { error: fail('unauthorized', 'Token de API inválido, revocado o vencido.') }
  }

  let jwt: string
  try {
    jwt = mintSupabaseJwt(row.user_id)
  } catch (e) {
    // Falta SUPABASE_JWT_SECRET (config del server), no culpa del cliente.
    return { error: fail('internal', (e as Error).message) }
  }

  return {
    supabase: createApiClient(jwt),
    user: { id: row.user_id },
    jwt,
    scope: row.scope,
    tokenId: row.token_id,
  }
}

async function authenticateWithJwt(
  jwt: string,
): Promise<ApiAuth | { error: Response }> {
  const supabase = createApiClient(jwt)
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) {
    return { error: fail('unauthorized', 'Token inválido o expirado.') }
  }
  return { supabase, user: { id: data.user.id }, jwt, scope: 'read_write', tokenId: null }
}

// Narrowing helper: true si `authenticateRequest` falló (para `if (isAuthError(a)) return a.error`).
export function isAuthError(a: ApiAuth | { error: Response }): a is { error: Response } {
  return 'error' in a
}
