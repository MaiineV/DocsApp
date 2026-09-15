import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { decryptToken, encryptToken, loadTokenKey } from '@/lib/calendar/crypto'

const KEY = crypto.randomBytes(32)

describe('token crypto', () => {
  it('should round-trip a token through encrypt and decrypt', () => {
    // Arrange
    const plain = '1//0refresh-token-value'
    // Act
    const payload = encryptToken(plain, KEY)
    // Assert
    expect(payload.startsWith('v1.')).toBe(true)
    expect(payload).not.toContain(plain)
    expect(decryptToken(payload, KEY)).toBe(plain)
  })

  it('should produce a different ciphertext each call (random iv)', () => {
    const a = encryptToken('same', KEY)
    const b = encryptToken('same', KEY)
    expect(a).not.toBe(b)
  })

  it('should reject a tampered payload', () => {
    const payload = encryptToken('secret', KEY)
    const parts = payload.split('.')
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('A') ? 'B' : 'A')
    expect(() => decryptToken(parts.join('.'), KEY)).toThrow()
  })

  it('should reject a payload encrypted with another key', () => {
    const payload = encryptToken('secret', KEY)
    expect(() => decryptToken(payload, crypto.randomBytes(32))).toThrow()
  })

  it('should reject a malformed payload', () => {
    expect(() => decryptToken('v0.abc', KEY)).toThrow(/formato/)
  })
})

describe('loadTokenKey', () => {
  it('should decode a 32-byte base64 key', () => {
    const raw = KEY.toString('base64')
    expect(loadTokenKey(raw).equals(KEY)).toBe(true)
  })

  it('should reject a missing or wrongly sized key', () => {
    expect(() => loadTokenKey(undefined)).toThrow(/GOOGLE_TOKEN_ENC_KEY/)
    expect(() => loadTokenKey(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/)
  })
})
