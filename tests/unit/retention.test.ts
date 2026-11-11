import { describe, it, expect } from 'vitest'
import {
  PURGE_BATCH_LIMIT,
  TRASH_RETENTION_DAYS,
  VERSION_CAP,
  VERSION_RETENTION_DAYS,
  groupByTeam,
  parsePurgeResult,
  retentionConfig,
} from '@/lib/retention'

describe('retentionConfig', () => {
  it('uses the defaults when env is empty', () => {
    expect(retentionConfig({})).toEqual({
      trashDays: TRASH_RETENTION_DAYS,
      versionDays: VERSION_RETENTION_DAYS,
      versionCap: VERSION_CAP,
      limit: PURGE_BATCH_LIMIT,
    })
    expect(VERSION_CAP).toBe(10)
    expect(TRASH_RETENTION_DAYS).toBe(30)
  })

  it('reads positive overrides and ignores invalid ones', () => {
    const cfg = retentionConfig({ TRASH_RETENTION_DAYS: '14', VERSION_CAP: '0', VERSION_RETENTION_DAYS: 'abc' })
    expect(cfg.trashDays).toBe(14)
    expect(cfg.versionCap).toBe(VERSION_CAP)
    expect(cfg.versionDays).toBe(VERSION_RETENTION_DAYS)
  })
})

describe('parsePurgeResult', () => {
  it('keeps well-formed rows', () => {
    const r = parsePurgeResult({
      purged: [{ id: 'd1', team_id: 't1' }, { id: 5 }, null],
      versions_deleted: 7,
    })
    expect(r).toEqual({ purged: [{ id: 'd1', team_id: 't1' }], versions_deleted: 7 })
  })

  it('returns an empty result for unexpected payloads', () => {
    expect(parsePurgeResult(null)).toEqual({ purged: [], versions_deleted: 0 })
    expect(parsePurgeResult({ purged: 'x', versions_deleted: 'y' })).toEqual({ purged: [], versions_deleted: 0 })
  })
})

describe('groupByTeam', () => {
  it('groups document ids by team', () => {
    const g = groupByTeam([
      { id: 'a', team_id: 't1' },
      { id: 'b', team_id: 't2' },
      { id: 'c', team_id: 't1' },
    ])
    expect(Object.fromEntries(g)).toEqual({ t1: ['a', 'c'], t2: ['b'] })
  })
})
