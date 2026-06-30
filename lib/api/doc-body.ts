import type { SupabaseClient } from '@supabase/supabase-js'
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core'
import { blocksToYXmlFragment, yXmlFragmentToBlocks } from '@blocknote/core/yjs'
import { Y, BLOCKNOTE_FRAGMENT } from '@/lib/yjs/yjs'
import { base64ToUpdate, updateToBase64 } from '@/lib/yjs/encoding'
import { casMergeYdoc, type PersistResult } from '@/lib/yjs/persist'
import { serverSchema as schema } from '@/lib/blocknote-schema.server'
import { headlessEditor, renderMarkdown } from '@/lib/api/markdown'
import { broadcastDocUpdate } from '@/lib/api/broadcast'

export type ReadFormat = 'markdown' | 'json'

type DocBodyRow = { content: string | null; ydoc_state: string | null }

// Parseo de la cache `content` (espejo de `parseInitialContent`, reimplementado
// acá para NO importar `lib/blocknote.ts`, que arrastra el schema React al server):
// JSON de bloques → tal cual; texto plano legacy (Fase 0) → un párrafo por bloque.
function blocksFromContentCache(content: string): PartialBlock[] {
  const trimmed = content?.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed as PartialBlock[]
  } catch {
    // No es JSON → texto plano.
  }
  return trimmed
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, ' ').trim())
    .filter((t) => t.length > 0)
    .map((text) => ({ type: 'paragraph', content: text }) as PartialBlock)
}

// Bloques actuales del documento. La fuente de verdad es `ydoc_state` (CRDT); si
// no hay (doc legacy que nunca colaboró), cae a la cache `content`.
function currentBlocks(doc: DocBodyRow): PartialBlock[] {
  if (doc.ydoc_state) {
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, base64ToUpdate(doc.ydoc_state))
    return yXmlFragmentToBlocks(
      headlessEditor(),
      ydoc.getXmlFragment(BLOCKNOTE_FRAGMENT),
    ) as unknown as PartialBlock[]
  }
  return blocksFromContentCache(doc.content ?? '')
}

// Cuerpo del doc en el formato pedido: markdown (string) o blocks JSON (array).
export async function readDocBody(
  doc: DocBodyRow,
  format: ReadFormat,
): Promise<string | PartialBlock[]> {
  const blocks = currentBlocks(doc)
  return format === 'markdown' ? renderMarkdown(blocks) : blocks
}

// Seed del cuerpo de un doc NUEVO (no necesita broadcast: nadie lo tiene abierto).
// Determinista (clientID 0) igual que `seedUpdateFromBlocks`, vía el mismo camino.
export function seedBody(newBlocks: PartialBlock[]): { ydocState: string; content: string } {
  const tmp = BlockNoteEditor.create({ schema, initialContent: newBlocks as never })
  const seedDoc = new Y.Doc()
  seedDoc.clientID = 0
  blocksToYXmlFragment(tmp, tmp.document, seedDoc.getXmlFragment(BLOCKNOTE_FRAGMENT))
  return {
    ydocState: updateToBase64(Y.encodeStateAsUpdate(seedDoc)),
    content: JSON.stringify(tmp.document),
  }
}

const EDITOR_ROLES = new Set(['owner', 'admin', 'editor'])

// Reemplaza el cuerpo de un doc existente por `newBlocks`:
//  1. lee el estado actual y verifica rol editor+ (403 limpio para viewer);
//  2. computa el delta Yjs (borra el body viejo + inserta el nuevo) — el spike
//     confirmó que converge sin duplicar;
//  3. persiste con CAS+merge (RLS sigue siendo el guard real);
//  4. lo emite en vivo por Realtime (best-effort).
export async function replaceDocBody(
  supabase: SupabaseClient,
  jwt: string,
  userId: string,
  docId: string,
  newBlocks: PartialBlock[],
): Promise<{ res: PersistResult; broadcast: boolean }> {
  const { data: doc, error } = await supabase
    .from('documents')
    .select('team_id, ydoc_state')
    .eq('id', docId)
    .is('deleted_at', null) // no editar un doc en la papelera
    .maybeSingle()
  if (error) return { res: { ok: false, status: 500, error: error.message }, broadcast: false }
  if (!doc) {
    return { res: { ok: false, status: 404, error: 'Documento no encontrado o sin acceso.' }, broadcast: false }
  }

  // Permiso de edición: rol editor+ en el team del doc. La RLS también lo gatea en
  // el UPDATE (defensa en profundidad); este check solo da un 403 claro al viewer.
  const { data: mem } = await supabase
    .from('memberships')
    .select('role')
    .eq('team_id', doc.team_id as string)
    .eq('user_id', userId)
    .maybeSingle()
  if (!mem || !EDITOR_ROLES.has(mem.role as string)) {
    return { res: { ok: false, status: 403, error: 'Sin permiso para editar este documento.' }, broadcast: false }
  }

  const ydoc = new Y.Doc()
  if (doc.ydoc_state) Y.applyUpdate(ydoc, base64ToUpdate(doc.ydoc_state as string))
  const frag = ydoc.getXmlFragment(BLOCKNOTE_FRAGMENT)
  const preSV = Y.encodeStateVector(ydoc)

  const tmp = BlockNoteEditor.create({ schema, initialContent: newBlocks as never })
  ydoc.transact(() => {
    frag.delete(0, frag.length)
    blocksToYXmlFragment(tmp, tmp.document, frag)
  })
  const delta = updateToBase64(Y.encodeStateAsUpdate(ydoc, preSV))
  const content = JSON.stringify(tmp.document)

  const res = await casMergeYdoc(supabase, docId, delta, content)
  if (!res.ok) return { res, broadcast: false }

  const b = await broadcastDocUpdate(jwt, docId, delta)
  return { res, broadcast: b.ok }
}
