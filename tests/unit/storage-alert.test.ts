import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STORAGE_QUOTA_BYTES,
  buildAlertPayload,
  envInt,
  evaluateStorageUsage,
  formatBytes,
} from '@/lib/storage-alert'

const GiB = 1024 * 1024 * 1024

describe('evaluateStorageUsage', () => {
  it('sums buckets and computes the percentage against the quota', () => {
    const u = evaluateStorageUsage(
      [
        { bucket_id: 'avatars', bytes: 100 * 1024 * 1024 },
        { bucket_id: 'doc-images', bytes: 412 * 1024 * 1024 },
      ],
      GiB,
      80,
    )
    expect(u.usedBytes).toBe(512 * 1024 * 1024)
    expect(u.quotaBytes).toBe(GiB)
    expect(u.pct).toBe(50)
    expect(u.alert).toBe(false)
  })

  it('alerts at or above the threshold', () => {
    expect(evaluateStorageUsage([{ bucket_id: 'a', bytes: 0.8 * GiB }], GiB, 80).alert).toBe(true)
    expect(evaluateStorageUsage([{ bucket_id: 'a', bytes: 0.79 * GiB }], GiB, 80).alert).toBe(false)
  })

  it('falls back to the default quota and treats bad byte values as zero', () => {
    const u = evaluateStorageUsage([{ bucket_id: 'a', bytes: Number.NaN }], 0)
    expect(u.quotaBytes).toBe(DEFAULT_STORAGE_QUOTA_BYTES)
    expect(u.usedBytes).toBe(0)
    expect(u.pct).toBe(0)
    expect(u.alert).toBe(false)
  })
})

describe('buildAlertPayload', () => {
  it('produces the same message for Discord and Slack with a per-bucket breakdown', () => {
    const u = evaluateStorageUsage([{ bucket_id: 'doc-images', bytes: 0.9 * GiB }], GiB, 80)
    const p = buildAlertPayload(u, 'DocsApp')
    expect(p.content).toBe(p.text)
    expect(p.content).toContain('90%')
    expect(p.content).toContain('doc-images: 922 MB')
    expect(p.content).toContain('of 1.0 GB')
  })
})

describe('helpers', () => {
  it('formatBytes picks a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB')
  })

  it('envInt returns the fallback for missing or invalid values', () => {
    expect(envInt(undefined, 80)).toBe(80)
    expect(envInt('abc', 80)).toBe(80)
    expect(envInt('-5', 80)).toBe(80)
    expect(envInt('90', 80)).toBe(90)
  })
})
