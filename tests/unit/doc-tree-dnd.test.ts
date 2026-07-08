import { describe, it, expect } from 'vitest'
import { buildDocTree, type DocRow } from '@/lib/doc-tree'
import { flattenTree, getProjection } from '@/lib/doc-tree-dnd'

// Árbol de referencia (positions ya ordenadas):
//   A (1024)
//   ├─ A1 (1024)
//   └─ A2 (2048)
//   B (2048)
//   C (3072)
//   └─ C1 (1024)
const rows: DocRow[] = [
  { id: 'a', title: 'A', parent_id: null, position: 1024 },
  { id: 'a1', title: 'A1', parent_id: 'a', position: 1024 },
  { id: 'a2', title: 'A2', parent_id: 'a', position: 2048 },
  { id: 'b', title: 'B', parent_id: null, position: 2048 },
  { id: 'c', title: 'C', parent_id: null, position: 3072 },
  { id: 'c1', title: 'C1', parent_id: 'c', position: 1024 },
]
const tree = buildDocTree(rows)
const none = new Set<string>()

describe('flattenTree', () => {
  it('flattens in DFS order with correct depths', () => {
    const flat = flattenTree(tree, none)
    expect(flat.map((f) => f.id)).toEqual(['a', 'a1', 'a2', 'b', 'c', 'c1'])
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 1, 0, 0, 1])
  })

  it('hides children of collapsed nodes but keeps hasChildren', () => {
    const flat = flattenTree(tree, new Set(['c']))
    expect(flat.map((f) => f.id)).toEqual(['a', 'a1', 'a2', 'b', 'c'])
    expect(flat.find((f) => f.id === 'c')!.hasChildren).toBe(true)
  })

  it('excludes descendants of the active node while dragging', () => {
    const flat = flattenTree(tree, none, 'a')
    expect(flat.map((f) => f.id)).toEqual(['a', 'b', 'c', 'c1'])
  })
})

describe('getProjection', () => {
  it('nests as first child when dropping between a parent and its first child', () => {
    // B arrastrado sobre A1 (entre A y A1) sin offset → primer hijo de A.
    const flat = flattenTree(tree, none, 'b')
    const p = getProjection(flat, 'b', 'a1', 0, 12)!
    expect(p).toEqual({ depth: 1, parentId: 'a', afterId: null })
  })

  it('nests into the previous item when dragging right over a root', () => {
    // A1 sobre C con offset a la derecha → hijo de C (aunque C esté colapsado).
    const flat = flattenTree(tree, new Set(['c']), 'a1')
    const p = getProjection(flat, 'a1', 'c', 12, 12)!
    expect(p).toEqual({ depth: 1, parentId: 'c', afterId: null })
  })

  it('un-nests to root when dragging left at the end of a subtree', () => {
    // A1 al final (sobre C1... último item) con offset a la izquierda → raíz después de C.
    const flat = flattenTree(tree, none, 'a1')
    const last = flat[flat.length - 1]
    const p = getProjection(flat, 'a1', last.id, -24, 12)!
    expect(p.depth).toBe(0)
    expect(p.parentId).toBeNull()
    expect(p.afterId).toBe('c')
  })

  it('reorders between siblings keeping the same parent', () => {
    // A2 sobre A1 → sigue bajo A, primer lugar (antes de A1).
    const flat = flattenTree(tree, none, 'a2')
    const p = getProjection(flat, 'a2', 'a1', 0, 12)!
    expect(p).toEqual({ depth: 1, parentId: 'a', afterId: null })
  })

  it('clamps projected depth to previous item depth + 1', () => {
    // B sobre C con offset exagerado a la derecha → como mucho hijo de C.
    const flat = flattenTree(tree, new Set(['c']), 'b')
    const p = getProjection(flat, 'b', 'c', 240, 12)!
    expect(p.depth).toBe(1)
    expect(p.parentId).toBe('c')
  })

  it('drops at root level after a collapsed node without nesting', () => {
    // C colapsado (sus hijos no son drop targets): B sobre C sin offset → raíz, después de C.
    const flat = flattenTree(tree, new Set(['c']), 'b')
    const p = getProjection(flat, 'b', 'c', 0, 12)!
    expect(p).toEqual({ depth: 0, parentId: null, afterId: 'c' })
  })

  it('returns null for unknown ids', () => {
    const flat = flattenTree(tree, none, 'b')
    expect(getProjection(flat, 'b', 'ghost', 0, 12)).toBeNull()
  })
})
