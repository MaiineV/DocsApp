import { envInt } from '@/lib/storage-alert'

export const TRASH_RETENTION_DAYS = 30
export const VERSION_RETENTION_DAYS = 30
export const VERSION_CAP = 10
export const PURGE_BATCH_LIMIT = 500

export type RetentionConfig = {
  trashDays: number
  versionDays: number
  versionCap: number
  limit: number
}

export type PurgedDoc = { id: string; team_id: string }

export type PurgeResult = { purged: PurgedDoc[]; versions_deleted: number }

export function retentionConfig(env: Record<string, string | undefined> = process.env): RetentionConfig {
  return {
    trashDays: envInt(env.TRASH_RETENTION_DAYS, TRASH_RETENTION_DAYS),
    versionDays: envInt(env.VERSION_RETENTION_DAYS, VERSION_RETENTION_DAYS),
    versionCap: envInt(env.VERSION_CAP, VERSION_CAP),
    limit: envInt(env.PURGE_BATCH_LIMIT, PURGE_BATCH_LIMIT),
  }
}

/** Normalizes the `purge_expired_content` RPC payload; unknown shapes become an empty result. */
export function parsePurgeResult(data: unknown): PurgeResult {
  const obj = (data ?? {}) as { purged?: unknown; versions_deleted?: unknown }
  const purged = Array.isArray(obj.purged)
    ? obj.purged.filter(
        (p): p is PurgedDoc =>
          typeof p === 'object' && p !== null && typeof p.id === 'string' && typeof p.team_id === 'string',
      )
    : []
  const versions = Number(obj.versions_deleted)
  return { purged, versions_deleted: Number.isFinite(versions) ? versions : 0 }
}

export function groupByTeam(docs: PurgedDoc[]): Map<string, string[]> {
  const byTeam = new Map<string, string[]>()
  for (const d of docs) {
    const ids = byTeam.get(d.team_id)
    if (ids) ids.push(d.id)
    else byTeam.set(d.team_id, [d.id])
  }
  return byTeam
}
