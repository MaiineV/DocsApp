import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createApiClient } from '@/lib/supabase/api'
import { fail } from '@/lib/api/respond'

export type ApiAuth = { supabase: SupabaseClient; user: User; jwt: string }

// Autentica un request de la API por `Authorization: Bearer <jwt>`.
//
// `getUser(jwt)` revalida el token contra Auth (no confía en el claim sin
// verificar firma/expiración). Si valida, devuelve el cliente Supabase ya
// bindeado a ese token (RLS aplica como el usuario) + el user + el jwt (para el
// broadcast Realtime). Si no, devuelve `{ error: Response }` con 401 listo para
// retornar desde el handler.
export async function authenticateRequest(
  request: Request,
): Promise<ApiAuth | { error: Response }> {
  const header =
    request.headers.get('authorization') ?? request.headers.get('Authorization')
  const match = header?.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return { error: fail('unauthorized', 'Falta el header Authorization: Bearer <token>.') }
  }

  const jwt = match[1].trim()
  const supabase = createApiClient(jwt)
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) {
    return { error: fail('unauthorized', 'Token inválido o expirado.') }
  }

  return { supabase, user: data.user, jwt }
}

// Narrowing helper: true si `authenticateRequest` falló (para `if (isAuthError(a)) return a.error`).
export function isAuthError(a: ApiAuth | { error: Response }): a is { error: Response } {
  return 'error' in a
}
