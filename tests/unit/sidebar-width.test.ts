import { describe, it, expect } from 'vitest'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  parseSidebarWidthCookie,
  sidebarWidthForKey,
} from '@/lib/sidebar-width'

describe('SIDEBAR_DEFAULT_WIDTH', () => {
  it('matches the w-64 (16rem) the sidebar had before resizing existed', () => {
    // Si cambia esto, cambiar también el `w-64` mobile en doc-sidebar.tsx.
    expect(SIDEBAR_DEFAULT_WIDTH).toBe(256)
  })
})

describe('clampSidebarWidth', () => {
  it('clamps below the minimum', () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(-500)).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('clamps above the maximum', () => {
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH)
  })

  it('keeps values in range and rounds fractions', () => {
    expect(clampSidebarWidth(300)).toBe(300)
    expect(clampSidebarWidth(255.6)).toBe(256)
    expect(clampSidebarWidth(255.4)).toBe(255)
  })
})

describe('parseSidebarWidthCookie', () => {
  it('falls back to the default when the cookie is missing or empty', () => {
    expect(parseSidebarWidthCookie(undefined)).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(parseSidebarWidthCookie('')).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('falls back to the default on garbage', () => {
    expect(parseSidebarWidthCookie('abc')).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(parseSidebarWidthCookie('256px')).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(parseSidebarWidthCookie('NaN')).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(parseSidebarWidthCookie('Infinity')).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('parses and clamps numeric values', () => {
    expect(parseSidebarWidthCookie('300')).toBe(300)
    expect(parseSidebarWidthCookie('50')).toBe(SIDEBAR_MIN_WIDTH)
    expect(parseSidebarWidthCookie('-10')).toBe(SIDEBAR_MIN_WIDTH)
    expect(parseSidebarWidthCookie('9999')).toBe(SIDEBAR_MAX_WIDTH)
    expect(parseSidebarWidthCookie('1e3')).toBe(SIDEBAR_MAX_WIDTH)
  })
})

describe('sidebarWidthForKey', () => {
  it('steps with the arrow keys and clamps at the edges', () => {
    expect(sidebarWidthForKey('ArrowLeft', false, 300)).toBe(284)
    expect(sidebarWidthForKey('ArrowRight', false, 300)).toBe(316)
    expect(sidebarWidthForKey('ArrowLeft', false, SIDEBAR_MIN_WIDTH)).toBe(SIDEBAR_MIN_WIDTH)
    expect(sidebarWidthForKey('ArrowRight', false, SIDEBAR_MAX_WIDTH)).toBe(SIDEBAR_MAX_WIDTH)
  })

  it('uses the large step with shift', () => {
    expect(sidebarWidthForKey('ArrowLeft', true, 300)).toBe(236)
    expect(sidebarWidthForKey('ArrowRight', true, 300)).toBe(364)
  })

  it('jumps to min/max/default with Home/End/Enter', () => {
    expect(sidebarWidthForKey('Home', false, 300)).toBe(SIDEBAR_MIN_WIDTH)
    expect(sidebarWidthForKey('End', false, 300)).toBe(SIDEBAR_MAX_WIDTH)
    expect(sidebarWidthForKey('Enter', false, 300)).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('returns null for keys it does not handle', () => {
    expect(sidebarWidthForKey('ArrowUp', false, 300)).toBeNull()
    expect(sidebarWidthForKey('a', false, 300)).toBeNull()
    expect(sidebarWidthForKey('Escape', false, 300)).toBeNull()
  })
})
