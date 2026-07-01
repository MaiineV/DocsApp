import { NextResponse } from 'next/server'

// Respuestas JSON con shape uniforme para toda la API. Los errores siempre
// salen como `{ error: { code, message } }`; los éxitos, con el recurso crudo.

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'conflict'
  | 'unsupported_media_type'
  | 'too_many_requests'
  | 'internal'

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  bad_request: 400,
  conflict: 409,
  unsupported_media_type: 415,
  too_many_requests: 429,
  internal: 500,
}

export function fail(code: ApiErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] })
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export const created = (data: unknown): NextResponse => ok(data, 201)

export const noContent = (): NextResponse => new NextResponse(null, { status: 204 })

// Adjunta headers (p. ej. `X-RateLimit-*`) a una respuesta ya construida.
export function withHeaders(
  res: NextResponse,
  headers: Record<string, string>,
): NextResponse {
  for (const [key, value] of Object.entries(headers)) res.headers.set(key, value)
  return res
}
