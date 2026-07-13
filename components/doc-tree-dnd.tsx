'use client'

import {
  startTransition,
  useOptimistic,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import Link, { useLinkStatus } from 'next/link'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import NewDocButton from '@/components/new-doc-button'
import { buildDocTree } from '@/lib/doc-tree'
import { flattenTree, getProjection, type FlatDocNode } from '@/lib/doc-tree-dnd'
import { positionBetween } from '@/lib/doc-position'
import { moveDocument } from '@/app/(app)/docs/actions'
import { useI18n } from '@/components/i18n-provider'

// Árbol de páginas con drag & drop estilo Notion: un solo gesto reordena entre
// hermanos, anida (offset a la derecha) o des-anida (a la izquierda). Patrón
// dnd-kit "sortable tree": lista aplanada + proyección de profundidad por el
// offset horizontal del puntero (lógica pura en lib/doc-tree-dnd).
// Dos variantes: 'sidebar' (rows compactos + botón subpágina) e 'index' (la
// lista de /docs: rows grandes con fecha de actualización).

// Fade del contenido del link mientras la navegación está pendiente. El delay
// de 150ms hace que las navegaciones rápidas (prefetch warm) no lo muestren.
function PendingFade({ className, children }: { className?: string; children: ReactNode }) {
  const { pending } = useLinkStatus()
  return (
    <span
      className={`${className ?? ''} transition-opacity duration-200 ${
        pending ? 'opacity-50 delay-150' : 'opacity-100 delay-0'
      }`}
    >
      {children}
    </span>
  )
}

// Link del árbol con prefetch por intención: default 'auto' (null) hasta que el
// usuario muestra intención (hover/focus) y ahí se sube a prefetch completo de
// la ruta dinámica (prefetch corre solo en producción). `intent` es sticky por
// mount: Next re-prefetchea solo si la entrada expira o la invalida un
// revalidatePath, así que no hace falta throttling propio.
// draggable=false: el drag NATIVO del <a> cancela los pointer events y rompe
// (a veces) la activación del MouseSensor de dnd-kit.
function TreeLink({
  href,
  className,
  labelClassName,
  children,
}: {
  href: string
  className: string
  labelClassName?: string
  children: ReactNode
}) {
  const [intent, setIntent] = useState(false)
  return (
    <Link
      href={href}
      prefetch={intent ? true : null}
      draggable={false}
      onPointerEnter={() => setIntent(true)}
      onFocus={() => setIntent(true)}
      className={className}
    >
      <PendingFade className={labelClassName}>{children}</PendingFade>
    </Link>
  )
}

// px por nivel de indentación (la proyección de profundidad usa el mismo valor).
const INDENT = { sidebar: 12, index: 20 } as const

type Variant = keyof typeof INDENT

export type SidebarDoc = {
  id: string
  title: string
  icon: string | null
  parentId: string | null
  position: number
  updatedAt?: string
}

// Fila del árbol (DocRow + los extras que renderizan los rows).
type TreeRow = {
  id: string
  title: string
  icon: string | null
  parent_id: string | null
  position: number
  updated_at?: string
}

type MovePatch = { id: string; parentId: string | null; position: number }

const emptySubscribe = () => () => {}

export default function DocTreeDnd({
  docs,
  activeDocId,
  canEdit,
  variant = 'sidebar',
  locale,
}: {
  docs: SidebarDoc[]
  activeDocId: string | null
  canEdit: boolean
  variant?: Variant
  locale?: string
}) {
  const { t } = useI18n()
  // Optimistic sobre la prop RSC: el drop pinta el árbol movido al instante; si
  // la action falla no hay revalidate → React revierte solo a la prop original.
  const [optimisticDocs, applyMove] = useOptimistic(
    docs,
    (state: SidebarDoc[], m: MovePatch) =>
      state.map((d) => (d.id === m.id ? { ...d, parentId: m.parentId, position: m.position } : d)),
  )
  // Colapsados como Set único (no state por nodo): el flatten lo necesita y
  // sobrevive al re-render RSC del revalidatePath (antes se reseteaba).
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  const [moveError, setMoveError] = useState<string | null>(null)

  // false en SSR/hidratación, true recién en el cliente. NO alcanza con chequear
  // `typeof document`: el dom-shim de jsdom (pipeline markdown) define un
  // `document` global en el proceso del server y el portal explotaría en SSR.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  const indent = INDENT[variant]

  // Derivados en render (no en state), como hacía el sidebar original.
  const tree = buildDocTree<TreeRow>(
    optimisticDocs.map((d) => ({
      id: d.id,
      title: d.title,
      icon: d.icon,
      parent_id: d.parentId,
      position: d.position,
      updated_at: d.updatedAt,
    })),
  )
  const flat = flattenTree(tree, collapsedIds, dragId)
  const projected =
    dragId && overId ? getProjection(flat, dragId, overId, offsetX, indent) : null
  const dragged = dragId ? optimisticDocs.find((d) => d.id === dragId) : null

  const sensors = useSensors(
    // distance evita robarle el click al <Link>; delay en touch no rompe el scroll.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function toggleCollapsed(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function resetDrag() {
    setDragId(null)
    setOverId(null)
    setOffsetX(0)
  }

  function handleDragStart(e: DragStartEvent) {
    setMoveError(null)
    setDragId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    // e.delta.x (no el estado offsetX): el estado puede quedar stale si el drop
    // llega antes del re-render del último dragMove — el evento siempre está al día.
    const proj =
      e.over && dragId
        ? getProjection(flat, String(e.active.id), String(e.over.id), e.delta.x, indent)
        : null
    resetDrag()
    if (!proj) return

    const id = String(e.active.id)
    const moved = optimisticDocs.find((d) => d.id === id)
    if (!moved) return

    // Hermanos del destino (sin el doc movido), en el orden visible.
    const siblings = optimisticDocs
      .filter((d) => d.parentId === proj.parentId && d.id !== id)
      .toSorted((a, b) => a.position - b.position || a.title.localeCompare(b.title))

    // No-op: quedó en el mismo padre y detrás del mismo hermano que antes.
    if (moved.parentId === proj.parentId) {
      const before = siblings.filter((s) => s.position < moved.position)
      const currentAfterId = before.length > 0 ? before[before.length - 1].id : null
      if (currentAfterId === proj.afterId) return
    }

    // Posición optimista con la misma aritmética que el server (solo para
    // pintar; el server recalcula con su vista autoritativa).
    const afterIdx = proj.afterId ? siblings.findIndex((s) => s.id === proj.afterId) : -1
    const prev = afterIdx >= 0 ? siblings[afterIdx] : null
    const next =
      proj.afterId === null ? (siblings[0] ?? null) : (siblings[afterIdx + 1] ?? null)
    const optimisticPos =
      positionBetween(prev?.position ?? null, next?.position ?? null) ??
      (prev?.position ?? 0) + 0.5

    // Soltar dentro de un nodo colapsado lo expande para que el drop se vea.
    if (proj.parentId && collapsedIds.has(proj.parentId)) toggleCollapsed(proj.parentId)

    startTransition(async () => {
      applyMove({ id, parentId: proj.parentId, position: optimisticPos })
      const res = await moveDocument(id, proj.parentId, proj.afterId).catch(() => ({
        ok: false as const,
        error: undefined,
      }))
      if (!res.ok) setMoveError(res.error ?? t.errors.docMoveFailed)
    })
  }

  if (tree.length === 0) {
    return variant === 'sidebar' ? (
      <p className="mt-2 px-2 text-xs text-subtle">{t.sidebar.empty}</p>
    ) : null
  }

  return (
    <>
      <DndContext
        // id estable: sin esto dnd-kit numera el contexto con un contador global
        // (DndDescribedBy-N) que difiere entre SSR y cliente → hydration mismatch.
        id={`doc-tree-${variant}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{ screenReaderInstructions: { draggable: t.sidebar.dragInstructions } }}
        onDragStart={handleDragStart}
        onDragMove={(e: DragMoveEvent) => setOffsetX(e.delta.x)}
        onDragOver={(e: DragOverEvent) => setOverId(e.over ? String(e.over.id) : null)}
        onDragEnd={handleDragEnd}
        onDragCancel={resetDrag}
      >
        <SortableContext items={flat.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <ul className={variant === 'sidebar' ? 'mt-1' : 'mt-6 divide-y divide-border'}>
            {flat.map((item) => (
              <SortableDocRow
                key={item.id}
                item={item}
                variant={variant}
                indent={indent}
                locale={locale}
                indicatorDepth={item.id === dragId ? (projected?.depth ?? item.depth) : null}
                isDropParent={projected?.parentId === item.id}
                isActive={item.id === activeDocId}
                canEdit={canEdit}
                onToggle={toggleCollapsed}
                untitled={t.common.untitled}
                newChildLabel={t.sidebar.newChild}
                toggleLabel={t.sidebar.toggleExpand}
              />
            ))}
          </ul>
        </SortableContext>
        {mounted
          ? createPortal(
              // Portal: el <aside> del sidebar tiene overflow-hidden.
              <DragOverlay>
                {dragged ? (
                  <div className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg shadow-lg">
                    {dragged.icon ? <span className="mr-1.5">{dragged.icon}</span> : null}
                    {dragged.title || t.common.untitled}
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )
          : null}
      </DndContext>
      {moveError ? (
        <p role="alert" className="mt-1 px-2 text-xs text-danger-fg">
          {moveError}
        </p>
      ) : null}
    </>
  )
}

function SortableDocRow({
  item,
  variant,
  indent,
  locale,
  indicatorDepth,
  isDropParent,
  isActive,
  canEdit,
  onToggle,
  untitled,
  newChildLabel,
  toggleLabel,
}: {
  item: FlatDocNode<TreeRow>
  variant: Variant
  indent: number
  locale?: string
  // Cuando este row es el que se arrastra: profundidad proyectada del drop
  // (se dibuja como línea indicadora en vez del contenido). null = row normal.
  indicatorDepth: number | null
  isDropParent: boolean
  isActive: boolean
  canEdit: boolean
  onToggle: (id: string) => void
  untitled: string
  newChildLabel: string
  toggleLabel: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    disabled: !canEdit,
  })
  const style = { transform: CSS.Translate.toString(transform), transition }

  if (indicatorDepth !== null) {
    return (
      <li ref={setNodeRef} style={style}>
        <div
          className="my-1 h-0.5 rounded bg-primary"
          style={{ marginLeft: indicatorDepth * indent + 4 }}
        />
      </li>
    )
  }

  const chevron = item.hasChildren ? (
    // 24px en desktop (44px touch en mobile): a 10px era casi invisible e
    // inclickeable. El span espejo de abajo debe medir lo mismo (alineación).
    <button
      type="button"
      onClick={() => onToggle(item.id)}
      aria-label={toggleLabel}
      aria-expanded={!item.collapsed}
      className="inline-grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded text-sm text-muted transition-colors hover:bg-active/70 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-6 sm:min-w-6 sm:size-6"
    >
      {item.collapsed ? '▸' : '▾'}
    </button>
  ) : (
    <span className="w-6 shrink-0 max-sm:hidden" />
  )

  return (
    // Sin el role="button" de dnd-kit: la fila contiene un link y botones (nested
    // interactive = violación a11y) y contaminaría el árbol de accesibilidad.
    <li ref={setNodeRef} style={style} {...attributes} role={undefined} {...(canEdit ? listeners : {})}>
      {variant === 'sidebar' ? (
        <div
          className={`group flex items-center gap-1 rounded-md pr-1 text-sm transition-colors ${
            isActive ? 'bg-active font-medium' : isDropParent ? 'bg-active/60' : 'hover:bg-ghost'
          }`}
          style={{ paddingLeft: item.depth * indent + 4 }}
        >
          {chevron}

          <TreeLink href={`/docs/${item.id}`} className="flex-1 truncate py-2 sm:py-1.5">
            {item.node.icon ? <span className="mr-1.5">{item.node.icon}</span> : null}
            {item.node.title || untitled}
          </TreeLink>

          {canEdit ? (
            <NewDocButton
              parentId={item.id}
              ariaLabel={newChildLabel}
              label="+"
              className="shrink-0 rounded p-2 text-subtle opacity-100 transition-opacity hover:bg-ghost hover:text-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-0.5 sm:opacity-0 sm:group-hover:opacity-100"
            />
          ) : null}
        </div>
      ) : (
        <div
          className={`flex items-center gap-1 transition-colors ${
            isDropParent ? 'bg-active/60' : 'hover:bg-surface-sunken'
          }`}
          style={{ paddingLeft: item.depth * indent }}
        >
          {chevron}
          <TreeLink
            href={`/docs/${item.id}`}
            className="flex flex-1 py-3"
            labelClassName="flex w-full items-center justify-between"
          >
            <span className="truncate font-medium">
              {item.node.icon ? <span className="mr-1.5">{item.node.icon}</span> : null}
              {item.node.title || untitled}
            </span>
            {item.node.updated_at ? (
              <span className="shrink-0 pl-3 text-xs text-subtle">
                {new Date(item.node.updated_at).toLocaleDateString(locale)}
              </span>
            ) : null}
          </TreeLink>
        </div>
      )}
    </li>
  )
}
