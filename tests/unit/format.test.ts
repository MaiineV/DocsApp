import { describe, it, expect } from 'vitest'
import { fmt } from '@/lib/i18n/format'

describe('fmt (i18n interpolation)', () => {
  it('interpolates a variable', () => {
    expect(fmt('Hola {name}', { name: 'Agus' })).toBe('Hola Agus')
  })

  it('coerces numbers to strings', () => {
    expect(fmt('{n} días', { n: 3 })).toBe('3 días')
  })

  it('supports multiple and repeated placeholders', () => {
    expect(fmt('{a}-{b}-{a}', { a: 'x', b: 'y' })).toBe('x-y-x')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(fmt('Hola {missing}', {})).toBe('Hola {missing}')
  })
})
