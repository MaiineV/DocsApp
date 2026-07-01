import type { NextResponse } from 'next/server'
import { authenticateRequest, isAuthError, type ApiAuth } from '@/lib/api/auth'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { fail, withHeaders } from '@/lib/api/respond'

type WithApiOptions = {
  // true en endpoints que mutan (POST/PATCH/DELETE): un token con scope `read` → 403.
  write?: boolean
}

// Envuelve el cuerpo de un route handler de la API con el pipeline común:
//   auth (JWT Bearer o PAT) → rate-limit → chequeo de scope → run → headers.
// Adjunta `X-RateLimit-*` a TODA respuesta (incluidos errores). El handler recibe
// el `auth` ya resuelto; los `params` de la ruta quedan capturados en el closure.
export async function withApi(
  request: Request,
  opts: WithApiOptions,
  run: (auth: ApiAuth) => Promise<Response>,
): Promise<Response> {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth.error

  const rl = await enforceRateLimit(auth)
  if (rl.limited) return rl.limited

  if (opts.write && auth.scope === 'read') {
    return withHeaders(
      fail('forbidden', 'Este token es de solo lectura (scope "read"): no puede escribir.'),
      rl.headers,
    )
  }

  const res = await run(auth)
  return withHeaders(res as NextResponse, rl.headers)
}
