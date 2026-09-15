import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildAlertPayload,
  DEFAULT_ALERT_PCT,
  DEFAULT_STORAGE_QUOTA_BYTES,
  envInt,
  evaluateStorageUsage,
  type BucketUsage,
} from '@/lib/storage-alert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when that env var exists; /api is outside the session proxy.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
    }
  } else if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const { data, error } = await admin.rpc('storage_bytes_used')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byBucket: BucketUsage[] = ((data ?? []) as { bucket_id: string; bytes: number | string }[]).map(
    (r) => ({ bucket_id: r.bucket_id, bytes: Number(r.bytes) }),
  )
  const usage = evaluateStorageUsage(
    byBucket,
    envInt(process.env.STORAGE_QUOTA_BYTES, DEFAULT_STORAGE_QUOTA_BYTES),
    envInt(process.env.STORAGE_ALERT_PCT, DEFAULT_ALERT_PCT),
  )

  let alerted = false
  const webhook = process.env.STORAGE_ALERT_WEBHOOK_URL
  if (usage.alert) {
    console.warn(`[storage-check] storage at ${usage.pct}% (${usage.usedBytes} bytes)`)
    if (webhook) {
      try {
        const res = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAlertPayload(usage)),
        })
        alerted = res.ok
        if (!res.ok) console.error(`[storage-check] webhook responded ${res.status}`)
      } catch (e) {
        console.error('[storage-check] webhook failed:', e)
      }
    }
  }

  return NextResponse.json({
    usedBytes: usage.usedBytes,
    quotaBytes: usage.quotaBytes,
    pct: usage.pct,
    byBucket: usage.byBucket,
    alert: usage.alert,
    alerted,
    webhookConfigured: Boolean(webhook),
  })
}
