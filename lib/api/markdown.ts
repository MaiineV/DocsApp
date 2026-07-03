import '@/lib/api/dom-shim' // efecto secundario: monta el DOM. DEBE ir primero.
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core'
import { serverSchema as schema } from '@/lib/blocknote-schema.server'

// Editor headless reutilizable para conversiones markdown <-> blocks. No se monta
// en el DOM (solo normaliza/serializa). Singleton por proceso: las conversiones no
// mutan su `document`, así que es seguro reusarlo entre requests.
function createHeadless() {
  return BlockNoteEditor.create({ schema })
}
let headless: ReturnType<typeof createHeadless> | null = null
export function headlessEditor() {
  return (headless ??= createHeadless())
}

// markdown -> blocks (entrada de la API). Lossy de vuelta para tipos propios de
// BlockNote, pero markdown estándar (headings, listas, énfasis, código, links,
// tablas) entra bien.
export async function parseMarkdown(md: string): Promise<PartialBlock[]> {
  const blocks = await headlessEditor().tryParseMarkdownToBlocks(md)
  return blocks as unknown as PartialBlock[]
}

// blocks -> markdown (salida de la API con ?format=markdown). Lossy: @menciones
// (docref) y otros bloques custom no tienen representación markdown fiel.
export async function renderMarkdown(blocks: PartialBlock[]): Promise<string> {
  return headlessEditor().blocksToMarkdownLossy(blocks as never)
}

// blocks -> HTML semántico (para la vista pública read-only /share). `blocksToHTMLLossy`
// produce HTML "de exportación" limpio (h1/p/ul/blockquote/pre/a/img...) — más
// article-like y fácil de estilar como prosa que el HTML interno del editor.
// @menciones (docref) salen como texto plano por el `render` del serverSchema (no
// linkean a /docs/<id>). async como `renderMarkdown` (robusto si el runtime
// devolviera una Promise). El HTML DEBE sanitizarse antes de inyectarlo (ver
// `lib/api/html.ts`): la página es pública y sin login.
export async function renderHtml(blocks: PartialBlock[]): Promise<string> {
  return headlessEditor().blocksToHTMLLossy(blocks as never)
}

export type WriteFormat = 'markdown' | 'json'

// Resuelve el `content` entrante (string markdown o array de blocks) a
// PartialBlock[]. Si no se especifica `format`, se infiere por el tipo de
// `content`. Tira si no coinciden (el caller lo mapea a 400).
export async function contentToBlocks(
  content: unknown,
  format?: WriteFormat,
): Promise<PartialBlock[]> {
  const fmt: WriteFormat = format ?? (typeof content === 'string' ? 'markdown' : 'json')
  if (fmt === 'json') {
    if (!Array.isArray(content)) {
      throw new Error('Para format=json, content debe ser un array de bloques BlockNote.')
    }
    return content as PartialBlock[]
  }
  if (typeof content !== 'string') {
    throw new Error('Para format=markdown, content debe ser un string.')
  }
  return parseMarkdown(content)
}
