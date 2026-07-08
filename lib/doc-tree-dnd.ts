// Lógica pura del drag & drop del árbol de documentos (patrón dnd-kit
// "sortable tree"): el árbol se aplana a una lista única y la profundidad de
// destino se proyecta desde el offset horizontal del puntero. Sin React ni
// @dnd-kit acá → testeable con Vitest y reusable.

import type { DocNode, DocRow } from '@/lib/doc-tree'

export type FlatDocNode<T extends DocRow = DocRow> = {
  id: string
  parentId: string | null
  depth: number
  collapsed: boolean
  hasChildren: boolean
  node: DocNode<T>
}

// DFS del árbol respetando nodos colapsados. Si `activeId` viene (hay un drag
// en curso), sus descendientes se EXCLUYEN de la lista: el subárbol viaja
// plegado con el nodo arrastrado, y de paso es imposible soltarlo dentro de sí
// mismo por construcción (sus hijos no son drop targets).
export function flattenTree<T extends DocRow>(
  tree: DocNode<T>[],
  collapsedIds: ReadonlySet<string>,
  activeId?: string | null,
): FlatDocNode<T>[] {
  const out: FlatDocNode<T>[] = []
  const walk = (nodes: DocNode<T>[], parentId: string | null, depth: number) => {
    for (const node of nodes) {
      const collapsed = collapsedIds.has(node.id)
      out.push({
        id: node.id,
        parentId,
        depth,
        collapsed,
        hasChildren: node.children.length > 0,
        node,
      })
      if (node.id !== activeId && !collapsed && node.children.length > 0) {
        walk(node.children, node.id, depth + 1)
      }
    }
  }
  walk(tree, null, 0)
  return out
}

export type Projection = {
  depth: number
  parentId: string | null
  // Hermano inmediatamente anterior en el destino (null = primer lugar).
  // Listo para pasarle a moveDocument(id, parentId, afterId).
  afterId: string | null
}

// Proyección del drop: profundidad = depth del item activo + offset horizontal
// en unidades de indentación, clampeada a lo que la posición vertical permite
// (entre la depth del siguiente item y la del anterior + 1). El parentId sale
// de caminar la lista hacia arriba desde el punto de inserción.
export function getProjection(
  items: FlatDocNode[],
  activeId: string,
  overId: string,
  offsetX: number,
  indentWidth: number,
): Projection | null {
  const activeIndex = items.findIndex((i) => i.id === activeId)
  const overIndex = items.findIndex((i) => i.id === overId)
  if (activeIndex === -1 || overIndex === -1) return null

  const newItems = arrayMove(items, activeIndex, overIndex)
  const previous = overIndex > 0 ? newItems[overIndex - 1] : null
  const next = overIndex + 1 < newItems.length ? newItems[overIndex + 1] : null

  const projectedDepth = items[activeIndex].depth + Math.round(offsetX / indentWidth)
  const maxDepth = previous ? previous.depth + 1 : 0
  const minDepth = next ? next.depth : 0
  const depth = Math.min(Math.max(projectedDepth, minDepth), maxDepth)

  return { depth, parentId: findParentId(newItems, overIndex, depth, previous), afterId: findAfterId(newItems, overIndex, depth) }
}

function findParentId(
  newItems: FlatDocNode[],
  overIndex: number,
  depth: number,
  previous: FlatDocNode | null,
): string | null {
  if (depth === 0 || !previous) return null
  if (depth === previous.depth) return previous.parentId
  if (depth > previous.depth) return previous.id
  // Se salió hacia la izquierda: el padre es el del último item a esa depth.
  for (let i = overIndex - 1; i >= 0; i--) {
    if (newItems[i].depth === depth) return newItems[i].parentId
  }
  return null
}

// Hermano anterior en el destino: caminando hacia arriba desde la inserción,
// el primer item a la MISMA depth es el hermano previo; uno menos profundo es
// el padre (→ no hay hermano previo: cae primero). Los más profundos son
// descendientes de otro hermano y se saltean.
function findAfterId(newItems: FlatDocNode[], overIndex: number, depth: number): string | null {
  for (let i = overIndex - 1; i >= 0; i--) {
    if (newItems[i].depth === depth) return newItems[i].id
    if (newItems[i].depth < depth) return null
  }
  return null
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice()
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}
