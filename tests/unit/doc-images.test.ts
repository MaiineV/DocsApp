import { describe, it, expect } from 'vitest'
import {
  MAX_IMAGE_BYTES,
  buildImagePath,
  docImagesPrefix,
  publicImageUrl,
  validateImageFile,
} from '@/lib/doc-images'

describe('validateImageFile', () => {
  it('accepts png/jpeg/gif/webp with their canonical extension', () => {
    expect(validateImageFile({ type: 'image/png', size: 10 })).toEqual({ ok: true, ext: 'png' })
    expect(validateImageFile({ type: 'image/jpeg', size: 10 })).toEqual({ ok: true, ext: 'jpg' })
    expect(validateImageFile({ type: 'image/gif', size: 10 })).toEqual({ ok: true, ext: 'gif' })
    expect(validateImageFile({ type: 'image/webp', size: 10 })).toEqual({ ok: true, ext: 'webp' })
  })

  it('rejects non-image and svg types', () => {
    expect(validateImageFile({ type: 'application/pdf', size: 10 })).toEqual({ ok: false, reason: 'type' })
    expect(validateImageFile({ type: 'image/svg+xml', size: 10 })).toEqual({ ok: false, reason: 'type' })
    expect(validateImageFile({ type: '', size: 10 })).toEqual({ ok: false, reason: 'type' })
  })

  it('rejects empty files and files over the limit', () => {
    expect(validateImageFile({ type: 'image/png', size: 0 })).toEqual({ ok: false, reason: 'size' })
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toEqual({ ok: false, reason: 'size' })
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES })).toEqual({ ok: true, ext: 'png' })
  })
})

describe('paths and urls', () => {
  it('builds <team>/<doc>/<uuid>.<ext>', () => {
    expect(buildImagePath('t1', 'd1', 'u1', 'png')).toBe('t1/d1/u1.png')
    expect(docImagesPrefix('t1', 'd1')).toBe('t1/d1')
  })

  it('builds the public object url without doubling slashes', () => {
    expect(publicImageUrl('https://x.supabase.co', 't1/d1/u1.png')).toBe(
      'https://x.supabase.co/storage/v1/object/public/doc-images/t1/d1/u1.png',
    )
    expect(publicImageUrl('https://x.supabase.co/', 't1/d1/u1.png')).toBe(
      'https://x.supabase.co/storage/v1/object/public/doc-images/t1/d1/u1.png',
    )
  })
})
