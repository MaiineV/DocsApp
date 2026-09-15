export const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024
export const DEFAULT_ALERT_PCT = 80

export type BucketUsage = { bucket_id: string; bytes: number }

export type StorageUsage = {
  usedBytes: number
  quotaBytes: number
  pct: number
  alert: boolean
  byBucket: BucketUsage[]
}

export function evaluateStorageUsage(
  byBucket: BucketUsage[],
  quotaBytes: number = DEFAULT_STORAGE_QUOTA_BYTES,
  alertPct: number = DEFAULT_ALERT_PCT,
): StorageUsage {
  const usedBytes = byBucket.reduce((acc, b) => acc + Math.max(0, Number(b.bytes) || 0), 0)
  const quota = quotaBytes > 0 ? quotaBytes : DEFAULT_STORAGE_QUOTA_BYTES
  const pct = Math.round((usedBytes / quota) * 1000) / 10
  return { usedBytes, quotaBytes: quota, pct, alert: pct >= alertPct, byBucket }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

/** Webhook body accepted by both Discord (`content`) and Slack (`text`). */
export function buildAlertPayload(usage: StorageUsage, appName = 'DocsApp'): { content: string; text: string } {
  const detail = usage.byBucket.map((b) => `${b.bucket_id}: ${formatBytes(b.bytes)}`).join(', ')
  const msg =
    `⚠️ ${appName}: Supabase Storage at ${usage.pct}% ` +
    `(${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)})` +
    (detail ? ` — ${detail}` : '')
  return { content: msg, text: msg }
}

export function envInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
