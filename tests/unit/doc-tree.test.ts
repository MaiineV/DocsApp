import { describe, it, expect } from 'vitest'
import { buildDocTree, collectDescendantIds, type DocRow } from '@/lib/doc-tree'

const rows: DocRow[] = [
  { id: 'a', title: 'Alpha', parent_id: null },
  { id: 'b', title: 'Beta', parent_id: 'a' },
  { id: 'c', title: 'Gamma', parent_id: 'a' },
  { id: 'd', title: 'Delta', parent_id: 'b' },
  { id: 'orphan', title: 'Orphan', parent_id: 'missing' },
]

describe('buildDocTree', () => {
  it('nests children under their parent (sorted by title)', () => {
    const tree = buildDocTree(rows)
    const a = tree.find((n) => n.id === 'a')!
    expect(a.children.map((c) => c.id)).toEqual(['b', 'c']) // Beta < Gamma
    expect(a.children[0].children.map((c) => c.id)).toEqual(['d'])
  })

  it('treats a row whose parent is absent as a root', () => {
    const tree = buildDocTree(rows)
    expect(tree.some((n) => n.id === 'orphan')).toBe(true)
  })

  it('sorts sibling roots by title', () => {
    const tree = buildDocTree([
      { id: '1', title: 'Zeta', parent_id: null },
      { id: '2', title: 'Alpha', parent_id: null },
    ])
    expect(tree.map((n) => n.title)).toEqual(['Alpha', 'Zeta'])
  })

  it('preserves extra row fields (generic)', () => {
    const tree = buildDocTree([{ id: 'x', title: 'X', parent_id: null, updated_at: '2026' }])
    expect(tree[0].updated_at).toBe('2026')
  })

  it('sorts siblings by position ascending when present', () => {
    const tree = buildDocTree([
      { id: '1', title: 'Alpha', parent_id: null, position: 2048 },
      { id: '2', title: 'Zeta', parent_id: null, position: 1024 },
      { id: '3', title: 'Mid', parent_id: null, position: 1536 },
    ])
    expect(tree.map((n) => n.id)).toEqual(['2', '3', '1'])
  })

  it('falls back to title when positions tie', () => {
    const tree = buildDocTree([
      { id: '1', title: 'Zeta', parent_id: null, position: 1024 },
      { id: '2', title: 'Alpha', parent_id: null, position: 1024 },
    ])
    expect(tree.map((n) => n.title)).toEqual(['Alpha', 'Zeta'])
  })

  it('puts rows without position after positioned ones', () => {
    const tree = buildDocTree([
      { id: '1', title: 'Alpha', parent_id: null },
      { id: '2', title: 'Zeta', parent_id: null, position: 9999 },
    ])
    expect(tree.map((n) => n.id)).toEqual(['2', '1'])
  })
})

describe('collectDescendantIds', () => {
  it('collects every descendant of a node', () => {
    expect([...collectDescendantIds(rows, 'a')].sort()).toEqual(['b', 'c', 'd'])
  })

  it('returns an empty set for a leaf', () => {
    expect(collectDescendantIds(rows, 'd').size).toBe(0)
  })
})
