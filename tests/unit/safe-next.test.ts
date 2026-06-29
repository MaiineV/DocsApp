import { describe, it, expect } from 'vitest'
import { safeNext } from '@/lib/auth/next'

describe('safeNext (anti open-redirect)', () => {
  it('returns the fallback for null/undefined/empty', () => {
    expect(safeNext(null)).toBe('/docs')
    expect(safeNext(undefined)).toBe('/docs')
    expect(safeNext('')).toBe('/docs')
  })

  it('accepts internal relative paths', () => {
    expect(safeNext('/docs/123')).toBe('/docs/123')
    expect(safeNext('/teams/abc?x=1')).toBe('/teams/abc?x=1')
  })

  it('rejects protocol-relative and backslash tricks', () => {
    expect(safeNext('//evil.com')).toBe('/docs')
    expect(safeNext('/\\evil.com')).toBe('/docs')
  })

  it('rejects absolute URLs and schemes', () => {
    expect(safeNext('https://evil.com')).toBe('/docs')
    expect(safeNext('javascript:alert(1)')).toBe('/docs')
  })

  it('rejects control chars and backslashes anywhere', () => {
    expect(safeNext('/docs\nx')).toBe('/docs')
    expect(safeNext('/docs\\x')).toBe('/docs')
  })

  it('honors a custom fallback', () => {
    expect(safeNext(null, '/login')).toBe('/login')
  })
})
