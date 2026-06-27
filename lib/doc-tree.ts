// Construcción del árbol de documentos a partir de la lista plana. Puro
// (sin React/Supabase) → server y client.

export type DocRow = { id: string; title: string; parent_id: string | null }
export type DocNode = DocRow & { children: DocNode[] }

// O(n) con un Map (sin .find() en loops). Un doc cuyo padre no está en la lista
// (cross-team / borrado) se trata como raíz. Hermanos ordenados por título.
export function buildDocTree(rows: DocRow[]): DocNode[] {
  const byId = new Map<string, DocNode>()
  for (const r of rows) byId.set(r.id, { ...r, children: [] })

  const roots: DocNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortRec = (nodes: DocNode[]) => {
    nodes.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    for (const n of nodes) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}

// Ids de todos los descendientes de `id` (para pre-chequear no-mover-a-su-subárbol).
export function collectDescendantIds(rows: DocRow[], id: string): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const arr = childrenByParent.get(r.parent_id)
    if (arr) arr.push(r.id)
    else childrenByParent.set(r.parent_id, [r.id])
  }
  const out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop() as string
    for (const child of childrenByParent.get(cur) ?? []) {
      if (!out.has(child)) {
        out.add(child)
        stack.push(child)
      }
    }
  }
  return out
}
