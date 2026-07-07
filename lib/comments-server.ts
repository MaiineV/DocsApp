import {
  CommentsExtension,
  YjsThreadStore,
  DefaultThreadStoreAuth,
} from '@blocknote/core/comments'
import { Y } from '@/lib/yjs/yjs'

// Los comentarios de BlockNote anclan cada hilo con un mark ProseMirror `comment`
// que vive en el fragment Yjs del documento. Cualquier schema que CONVIERTA ese
// fragment (yXmlFragmentToBlocks / exporters) debe registrar ese mark: si no,
// prosemirror-model hace `schema.marks["comment"].create()` sobre undefined y tira
// TypeError. Las rutas server-side (readDocBody → API `/api/v1` y vista `/share`)
// usan el editor headless de `lib/api/markdown.ts`, así que necesitan el mark.
//
// La extensión de comentarios exige un `threadStore` + `resolveUsers`, pero el
// server SOLO lee/serializa el documento (nunca crea/lee hilos), así que un store
// stub sobre un Y.Doc vacío alcanza: registra el mark y jamás se lo invoca. Es
// React-free (viene de `@blocknote/core`, no de `@blocknote/react`) → seguro para
// Route Handlers, igual que `serverSchema`.
export function commentMarkExtension() {
  const threadsYMap = new Y.Doc().getMap('threads')
  const auth = new DefaultThreadStoreAuth('server', 'editor')
  const threadStore = new YjsThreadStore('server', threadsYMap, auth)
  return CommentsExtension({ threadStore, resolveUsers: async () => [] })
}
