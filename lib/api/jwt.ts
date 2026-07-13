import crypto from 'node:crypto'

// Utilidades para la autenticación por Personal Access Token (PAT).
//
// Un PAT no es un JWT de Supabase, así que para NO perder la RLS-as-user (todo el
// authz vive en policies de Postgres) traducimos el request a un JWT efímero que
// PostgREST acepta → `auth.uid()` = el usuario → la RLS aplica idéntica.
//
// Dos caminos de firma (hecho con `node:crypto`, cero dependencias nuevas):
// - ES256 con `SUPABASE_JWT_PRIVATE_JWK`: la clave privada de una signing key
//   IMPORTADA al proyecto (Dashboard → JWT Signing Keys → Import). El header
//   lleva su `kid` para que PostgREST/Realtime la resuelvan en el JWKS.
// - Fallback HS256 con el legacy `SUPABASE_JWT_SECRET`: válido mientras ese
//   secreto no se revoque. Permite deployar este código ANTES de rotar claves.

const b64url = (buf: Buffer): string => buf.toString('base64url')
const enc = (obj: object): string => b64url(Buffer.from(JSON.stringify(obj)))

// JWK privado de curva P-256 (el formato que exporta `supabase gen signing-key`).
type EcPrivateJwk = {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
  d: string
  kid?: string
}

// SHA-256 hex de un string. Se usa para guardar/buscar el token (nunca el crudo).
export function sha256hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

// Mintea un JWT compatible con Supabase para `sub = userId`, con role/aud
// `authenticated` y vida corta (default 120 s: alcanza para un request). Lanza si
// no hay clave de firma configurada (server-only; nunca en el bundle del cliente).
export function mintSupabaseJwt(userId: string, ttlSeconds = 120): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + ttlSeconds,
  }

  const rawJwk = process.env.SUPABASE_JWT_PRIVATE_JWK
  if (rawJwk) {
    const jwk = JSON.parse(rawJwk) as EcPrivateJwk
    const kid = process.env.SUPABASE_JWT_KID ?? jwk.kid
    if (!kid) {
      throw new Error(
        'SUPABASE_JWT_PRIVATE_JWK sin `kid` (y sin SUPABASE_JWT_KID): PostgREST no podría resolver la clave en el JWKS.',
      )
    }
    const data = `${enc({ alg: 'ES256', typ: 'JWT', kid })}.${enc(payload)}`
    const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' })
    // ieee-p1363 = firma cruda r||s (64 bytes), el formato que exige JWS
    // (RFC 7518); el default DER de node:crypto NO verifica como JWT.
    const sig = crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' })
    return `${data}.${b64url(sig)}`
  }

  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error(
      'Configurar SUPABASE_JWT_PRIVATE_JWK (ES256) o SUPABASE_JWT_SECRET (legacy HS256): requerido para autenticar por Personal Access Token.',
    )
  }
  const data = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}`
  const sig = b64url(crypto.createHmac('sha256', secret).update(data).digest())
  return `${data}.${sig}`
}
