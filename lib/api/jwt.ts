import crypto from 'node:crypto'

// Utilidades para la autenticación por Personal Access Token (PAT).
//
// Un PAT no es un JWT de Supabase, así que para NO perder la RLS-as-user (todo el
// authz vive en policies de Postgres) traducimos el request a un JWT HS256 efímero
// firmado con el `SUPABASE_JWT_SECRET` (el mismo secreto con que Supabase firma sus
// tokens). PostgREST lo acepta → `auth.uid()` = el usuario → la RLS aplica idéntica.
// Hecho con `node:crypto` (cero dependencias nuevas).

const b64url = (buf: Buffer): string => buf.toString('base64url')
const enc = (obj: object): string => b64url(Buffer.from(JSON.stringify(obj)))

// SHA-256 hex de un string. Se usa para guardar/buscar el token (nunca el crudo).
export function sha256hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

// Mintea un JWT HS256 compatible con Supabase para `sub = userId`, con role/aud
// `authenticated` y vida corta (default 120 s: alcanza para un request). Lanza si
// falta el secreto (server-only; nunca debe estar en el bundle del cliente).
export function mintSupabaseJwt(userId: string, ttlSeconds = 120): string {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error(
      'SUPABASE_JWT_SECRET no configurado: es requerido para autenticar por Personal Access Token.',
    )
  }
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + ttlSeconds,
  }
  const data = `${enc(header)}.${enc(payload)}`
  const sig = b64url(crypto.createHmac('sha256', secret).update(data).digest())
  return `${data}.${sig}`
}
