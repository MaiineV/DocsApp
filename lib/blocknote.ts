import { BlockNoteEditor, type PartialBlock } from '@blocknote/core'
import { blocksToYXmlFragment } from '@blocknote/core/yjs'
import { Y, BLOCKNOTE_FRAGMENT } from '@/lib/yjs/yjs'

// Convierte el `content` guardado (string en la columna documents.content) al
// formato que espera BlockNote como contenido inicial.
//
//   - Vacío            → undefined (BlockNote crea un documento vacío por defecto).
//   - JSON de bloques  → se usa tal cual (es lo que guardamos a partir de Fase 1).
//   - Texto plano      → docs viejos de Fase 0: un párrafo por cada bloque de texto
//                        separado por una línea en blanco. Migran a JSON al primer guardado.
export function parseInitialContent(content: string): PartialBlock[] | undefined {
  const trimmed = content?.trim()
  if (!trimmed) return undefined

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as PartialBlock[]
    }
  } catch {
    // No es JSON → tratarlo como texto plano (Fase 0).
  }

  const blocks: PartialBlock[] = content
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, ' ').trim())
    .filter((text) => text.length > 0)
    .map((text) => ({ type: 'paragraph', content: text }))

  return blocks.length > 0 ? blocks : undefined
}

// Seed determinista de un Y.Doc legacy (ydoc_state NULL) a partir de su contenido
// viejo. Devuelve el update (Uint8Array) para aplicar al Y.Doc vivo.
//
// CLAVE — clientID fijo en 0: dos clientes que abren el MISMO doc legacy a la vez
// generan structs Yjs IDÉNTICOS (mismos blocks + mismo clientID + mismo orden) →
// bytes idénticos → al sincronizar, el merge es idempotente y NO se duplica el
// contenido. Con clientIDs aleatorios, el mismo texto quedaría como structs
// distintos y aparecería dos veces. El editor headless solo normaliza
// PartialBlock[] → Block[] (necesita un schema, no toca el DOM).
export function seedUpdateFromBlocks(blocks: PartialBlock[]): Uint8Array {
  const tmp = BlockNoteEditor.create({ initialContent: blocks })
  const seedDoc = new Y.Doc()
  seedDoc.clientID = 0
  blocksToYXmlFragment(tmp, tmp.document, seedDoc.getXmlFragment(BLOCKNOTE_FRAGMENT))
  return Y.encodeStateAsUpdate(seedDoc)
}
