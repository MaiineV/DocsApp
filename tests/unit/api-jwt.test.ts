import { describe, it, expect, afterEach } from 'vitest'
import crypto from 'node:crypto'
import { mintSupabaseJwt, sha256hex } from '@/lib/api/jwt'

const SECRET = 'test-jwt-secret-super-secreto'

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

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

describe('api/jwt · mintSupabaseJwt', () => {
  const original = process.env.SUPABASE_JWT_SECRET

  afterEach(() => {
    if (original === undefined) delete process.env.SUPABASE_JWT_SECRET
    else process.env.SUPABASE_JWT_SECRET = original
  })

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

  it('should throw when SUPABASE_JWT_SECRET is not configured', () => {
    // Arrange
    delete process.env.SUPABASE_JWT_SECRET

    // Act + Assert
    expect(() => mintSupabaseJwt('user-abc')).toThrow(/SUPABASE_JWT_SECRET/)
  })
})
