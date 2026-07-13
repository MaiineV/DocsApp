import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import { mintSupabaseJwt, sha256hex } from '@/lib/api/jwt'

const SECRET = 'test-jwt-secret-super-secreto'

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

// Par ES256 de prueba generado por suite (nunca una clave real).
function makeEs256Jwk(kid?: string): { jwk: Record<string, unknown>; publicKey: crypto.KeyObject } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = privateKey.export({ format: 'jwk' }) as Record<string, unknown>
  if (kid) jwk.kid = kid
  return { jwk, publicKey }
}

// Snapshot/restore de las envs de firma: el entorno del dev puede tenerlas
// seteadas (.env.local) y contaminarían qué camino toma el mint.
const SIGNING_ENVS = ['SUPABASE_JWT_SECRET', 'SUPABASE_JWT_PRIVATE_JWK', 'SUPABASE_JWT_KID'] as const
const saved: Partial<Record<(typeof SIGNING_ENVS)[number], string | undefined>> = {}

beforeEach(() => {
  for (const name of SIGNING_ENVS) {
    saved[name] = process.env[name]
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of SIGNING_ENVS) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

describe('api/jwt · sha256hex', () => {
  it('should return the deterministic Node SHA-256 hex for an input', () => {
    // Arrange
    const input = 'dapp_hola-mundo'
    const expected = crypto.createHash('sha256').update(input).digest('hex')

    // Act
    const got = sha256hex(input)

    // Assert
    expect(got).toBe(expected)
    expect(got).toHaveLength(64)
    expect(sha256hex(input)).toBe(got) // determinístico
  })

  it('should produce different hashes for different inputs', () => {
    expect(sha256hex('a')).not.toBe(sha256hex('b'))
  })
})

describe('api/jwt · mintSupabaseJwt (HS256 legacy)', () => {
  it('should mint a three-part HS256 JWT with authenticated claims for the user', () => {
    // Arrange
    process.env.SUPABASE_JWT_SECRET = SECRET
    const userId = '11111111-1111-1111-1111-111111111111'

    // Act
    const token = mintSupabaseJwt(userId, 120)
    const [headerB64, payloadB64] = token.split('.')
    const header = decode(headerB64)
    const payload = decode(payloadB64)

    // Assert
    expect(token.split('.')).toHaveLength(3)
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(payload.sub).toBe(userId)
    expect(payload.role).toBe('authenticated')
    expect(payload.aud).toBe('authenticated')
    expect(payload.exp).toBe((payload.iat as number) + 120)
  })

  it('should sign the token so its HMAC verifies with the secret', () => {
    // Arrange
    process.env.SUPABASE_JWT_SECRET = SECRET

    // Act
    const token = mintSupabaseJwt('user-abc')
    const [headerB64, payloadB64, sigB64] = token.split('.')
    const expectedSig = crypto
      .createHmac('sha256', SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url')

    // Assert
    expect(sigB64).toBe(expectedSig)
  })

  it('should throw when no signing env is configured', () => {
    // Arrange: beforeEach ya limpió todas las envs de firma.

    // Act + Assert
    expect(() => mintSupabaseJwt('user-abc')).toThrow(
      /SUPABASE_JWT_PRIVATE_JWK.*SUPABASE_JWT_SECRET/,
    )
  })
})

describe('api/jwt · mintSupabaseJwt (ES256)', () => {
  it('should mint an ES256 JWT with the kid header when SUPABASE_JWT_PRIVATE_JWK is set', () => {
    // Arrange
    const kid = 'kid-test-1234'
    const { jwk } = makeEs256Jwk(kid)
    process.env.SUPABASE_JWT_PRIVATE_JWK = JSON.stringify(jwk)
    const userId = '22222222-2222-2222-2222-222222222222'

    // Act
    const token = mintSupabaseJwt(userId, 120)
    const [headerB64, payloadB64] = token.split('.')
    const header = decode(headerB64)
    const payload = decode(payloadB64)

    // Assert
    expect(token.split('.')).toHaveLength(3)
    expect(header).toEqual({ alg: 'ES256', typ: 'JWT', kid })
    expect(payload.sub).toBe(userId)
    expect(payload.role).toBe('authenticated')
    expect(payload.aud).toBe('authenticated')
    expect(payload.exp).toBe((payload.iat as number) + 120)
  })

  it('should produce an ieee-p1363 signature that WebCrypto verifies', async () => {
    // Arrange: espeja exactamente cómo verifican auth-js/PostgREST (ECDSA P-256).
    const { jwk, publicKey } = makeEs256Jwk('kid-webcrypto')
    process.env.SUPABASE_JWT_PRIVATE_JWK = JSON.stringify(jwk)

    // Act
    const token = mintSupabaseJwt('user-abc')
    const [headerB64, payloadB64, sigB64] = token.split('.')
    const sig = Buffer.from(sigB64, 'base64url')
    const cryptoKey = await crypto.webcrypto.subtle.importKey(
      'jwk',
      publicKey.export({ format: 'jwk' }) as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const valid = await crypto.webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      sig,
      Buffer.from(`${headerB64}.${payloadB64}`),
    )

    // Assert
    expect(sig).toHaveLength(64) // r||s crudos, no DER
    expect(valid).toBe(true)
  })

  it('should prefer ES256 over HS256 when both envs are set', () => {
    // Arrange
    const { jwk } = makeEs256Jwk('kid-preferencia')
    process.env.SUPABASE_JWT_PRIVATE_JWK = JSON.stringify(jwk)
    process.env.SUPABASE_JWT_SECRET = SECRET

    // Act
    const header = decode(mintSupabaseJwt('user-abc').split('.')[0])

    // Assert
    expect(header.alg).toBe('ES256')
  })

  it('should use the SUPABASE_JWT_KID override when the JWK lacks a kid', () => {
    // Arrange
    const { jwk } = makeEs256Jwk() // sin kid propio
    process.env.SUPABASE_JWT_PRIVATE_JWK = JSON.stringify(jwk)
    process.env.SUPABASE_JWT_KID = 'kid-override'

    // Act
    const header = decode(mintSupabaseJwt('user-abc').split('.')[0])

    // Assert
    expect(header.kid).toBe('kid-override')
  })

  it('should throw when neither the JWK kid nor SUPABASE_JWT_KID exist', () => {
    // Arrange
    const { jwk } = makeEs256Jwk() // sin kid propio
    process.env.SUPABASE_JWT_PRIVATE_JWK = JSON.stringify(jwk)

    // Act + Assert
    expect(() => mintSupabaseJwt('user-abc')).toThrow(/kid/)
  })
})
