import { describe, it, expect } from 'vitest'
import { POSITION_GAP, positionBetween, positionAfter } from '@/lib/doc-position'

describe('positionBetween', () => {
  it('returns the base gap when there are no neighbors', () => {
    expect(positionBetween(null, null)).toBe(POSITION_GAP)
  })

  it('returns a value below next when dropping before the first sibling', () => {
    expect(positionBetween(null, 1024)).toBe(1024 - POSITION_GAP)
  })

  it('returns a value above prev when dropping after the last sibling', () => {
    expect(positionBetween(3072, null)).toBe(3072 + POSITION_GAP)
  })

  it('returns the midpoint between two neighbors', () => {
    expect(positionBetween(1024, 2048)).toBe(1536)
  })

  it('returns null when the float64 gap is exhausted', () => {
    // Bisectar hasta que prev y next sean adyacentes en float64 → sin midpoint.
    const prev = 1024
    let next = 1025
    let mid = positionBetween(prev, next)
    while (mid !== null) {
      next = mid
      mid = positionBetween(prev, next)
    }
    expect(mid).toBeNull()
  })
})

describe('positionAfter', () => {
  const siblings = [
    { id: 'a', position: 1024 },
    { id: 'b', position: 2048 },
    { id: 'c', position: 3072 },
  ]

  it('returns the base gap when the target group is empty', () => {
    expect(positionAfter([], null)).toBe(POSITION_GAP)
    expect(positionAfter([], 'ghost')).toBe(POSITION_GAP)
  })

  it('drops before the first sibling when afterId is null', () => {
    expect(positionAfter(siblings, null)).toBe(0)
  })

  it('drops between afterId and its next sibling', () => {
    expect(positionAfter(siblings, 'a')).toBe(1536)
  })

  it('drops after the last sibling when afterId is the last one', () => {
    expect(positionAfter(siblings, 'c')).toBe(3072 + POSITION_GAP)
  })

  it('falls back to the end when afterId is stale (not in siblings)', () => {
    expect(positionAfter(siblings, 'deleted-doc')).toBe(3072 + POSITION_GAP)
  })
})
