import crypto from 'node:crypto'

// AES-256-GCM for Google OAuth tokens at rest. Key: GOOGLE_TOKEN_ENC_KEY, 32
// random bytes in base64. Ciphertext format: `v1.<iv>.<ciphertext>.<tag>` (base64url).

const VERSION = 'v1'

export function loadTokenKey(raw = process.env.GOOGLE_TOKEN_ENC_KEY): Buffer {
  if (!raw) throw new Error('GOOGLE_TOKEN_ENC_KEY no configurada (32 bytes en base64).')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('GOOGLE_TOKEN_ENC_KEY debe decodificar a 32 bytes.')
  return key
}

export function encryptToken(plain: string, key: Buffer = loadTokenKey()): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), ct.toString('base64url'), tag.toString('base64url')].join('.')
}

export function decryptToken(payload: string, key: Buffer = loadTokenKey()): string {
  const [version, ivB64, ctB64, tagB64] = payload.split('.')
  if (version !== VERSION || !ivB64 || !ctB64 || !tagB64) {
    throw new Error('Token cifrado con formato inválido.')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8')
}
