import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteDocImages } from '@/lib/doc-images-server'
import { groupByTeam, parsePurgeResult, retentionConfig } from '@/lib/retention'

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

  const cfg = retentionConfig()
  const { data, error } = await admin.rpc('purge_expired_content', {
    p_trash_days: cfg.trashDays,
    p_version_days: cfg.versionDays,
    p_version_cap: cfg.versionCap,
    p_limit: cfg.limit,
  })
  if (error) {
    console.error('[retention] purge_expired_content failed:', error)
    return NextResponse.json({ error: 'retention failed' }, { status: 500 })
  }

  const result = parsePurgeResult(data)
  for (const [teamId, ids] of groupByTeam(result.purged)) {
    await deleteDocImages(teamId, ids)
  }

  return NextResponse.json({
    purgedDocuments: result.purged.length,
    versionsDeleted: result.versions_deleted,
    config: cfg,
  })
}
