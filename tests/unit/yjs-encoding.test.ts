import { describe, it, expect } from 'vitest'
import { Y } from '@/lib/yjs/yjs'
import { updateToBase64, base64ToUpdate, mergeBase64Updates } from '@/lib/yjs/encoding'

function updateWithText(text: string): Uint8Array {
  const doc = new Y.Doc()
  doc.getText('t').insert(0, text)
  return Y.encodeStateAsUpdate(doc)
}

function textAfterApply(b64: string): string {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, base64ToUpdate(b64))
  return doc.getText('t').toString()
}

describe('yjs/encoding', () => {
  it('base64 round-trips a Yjs update byte-for-byte', () => {
    const u = updateWithText('hello')
    const b64 = updateToBase64(u)
    expect(typeof b64).toBe('string')
    expect(Array.from(base64ToUpdate(b64))).toEqual(Array.from(u))
  })

  it('mergeBase64Updates is commutative (orden no importa)', () => {
    const a = updateToBase64(updateWithText('A'))
    const b = updateToBase64(updateWithText('B'))
    // El merge converge al mismo estado sin importar el orden.
    expect(textAfterApply(mergeBase64Updates([a, b]))).toBe(textAfterApply(mergeBase64Updates([b, a])))
  })

  it('mergeBase64Updates is idempotent (aplicar dos veces el mismo update no cambia nada)', () => {
    const a = updateToBase64(updateWithText('A'))
    expect(textAfterApply(mergeBase64Updates([a, a]))).toBe('A')
  })
})
