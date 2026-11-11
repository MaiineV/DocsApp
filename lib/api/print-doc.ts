import type { PartialBlock } from '@blocknote/core'
import { createClient } from '@/lib/supabase/server'
import { getDocument, listTeamDocs } from '@/lib/documents'
import { flattenSubtree } from '@/lib/doc-tree'
import { readDocBody } from '@/lib/api/doc-body'
import { renderHtml } from '@/lib/api/markdown'
import { sanitizeHtml } from '@/lib/api/html'

// Pipeline del export a PDF (`/print/[id]`): la página + todas sus subpáginas en
// orden de sidebar, cada una renderizada a HTML sanitizado (mismo camino que
// `/share`). Va con el cliente de SESIÓN → la RLS gatea el acceso. Módulo aparte
// de `lib/documents.ts` para no arrastrar jsdom/dompurify al bundle de la app.

// Tope de páginas por export: evita requests eternos sobre árboles enormes.
export const PRINT_MAX_DOCS = 200

export type PrintPage = {
  id: string
  title: string
  icon: string | null
  depth: number
  html: string
}

export type PrintBundle = {
  root: { id: string; title: string; icon: string | null }
  pages: PrintPage[]
  truncated: boolean
}

// Un @mención sale del exporter de BlockNote como `<span …>label</span>` con
// `data-inline-content-type="docref"` y `data-doc-id="X"` (las props se serializan
// solas como data-*, en orden variable) → `<a href="#doc-X">` si X está dentro del export. Corre sobre HTML ya
// sanitizado; el id se valida contra el set (no se interpola input arbitrario).
export function linkDocRefs(html: string, ids: Set<string>): string {
  return html.replace(/<span([^>]*)>([^<]*)<\/span>/g, (match, attrs: string, label: string) => {
    if (!attrs.includes('data-inline-content-type="docref"')) return match
    const id = /data-doc-id="([^"]+)"/.exec(attrs)?.[1]
    return id && ids.has(id) ? `<a href="#doc-${id}" class="print-docref">${label}</a>` : match
  })
}

export async function fetchPrintBundle(id: string): Promise<PrintBundle | null> {
  const doc = await getDocument(id)
  if (!doc) return null

  const ordered = flattenSubtree(await listTeamDocs(doc.team_id), id)
  if (ordered.length === 0) return null
  const truncated = ordered.length > PRINT_MAX_DOCS
  const slice = ordered.slice(0, PRINT_MAX_DOCS)

  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('id, content, ydoc_state')
    .in(
      'id',
      slice.map((x) => x.node.id),
    )
    .is('deleted_at', null)
  const bodies = new Map(
    ((data ?? []) as { id: string; content: string | null; ydoc_state: string | null }[]).map(
      (r) => [r.id, r],
    ),
  )
  const ids = new Set(slice.map((x) => x.node.id))

  const pages: PrintPage[] = []
  for (const { node, depth } of slice) {
    const body = bodies.get(node.id)
    let html = ''
    if (body) {
      const blocks = (await readDocBody(body, 'json')) as PartialBlock[]
      html = linkDocRefs(sanitizeHtml(await renderHtml(blocks)), ids)
    }
    pages.push({ id: node.id, title: node.title, icon: node.icon, depth, html })
  }

  return { root: { id: doc.id, title: doc.title, icon: doc.icon }, pages, truncated }
}
