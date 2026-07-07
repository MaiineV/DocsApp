// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { seedBody, readDocBody } from '@/lib/api/doc-body'
import { headlessEditor } from '@/lib/api/markdown'
import { Y, BLOCKNOTE_FRAGMENT } from '@/lib/yjs/yjs'
import { base64ToUpdate, updateToBase64 } from '@/lib/yjs/encoding'
import { toCommentUser } from '@/lib/comments'

// Los comentarios de BlockNote anclan cada hilo con un mark `comment` en el fragment
// Yjs. Las rutas server (readDocBody → API `/api/v1` y vista `/share`) convierten ese
// fragment con el editor headless; si el mark no está registrado en el schema,
// prosemirror-model tira TypeError. Estos tests son la regresión de ese crash-guard.

// Encuentra el primer Y.XmlText del árbol (el texto del primer bloque del doc).
function firstXmlText(node: unknown): InstanceType<typeof Y.XmlText> | null {
  if (node instanceof Y.XmlText) return node
  const withChildren = node as { toArray?: () => unknown[] }
  if (typeof withChildren.toArray === 'function') {
    for (const child of withChildren.toArray()) {
      const found = firstXmlText(child)
      if (found) return found
    }
  }
  return null
}

describe('comment mark crash-guard on server read paths', () => {
  it('should register the comment mark on the headless server editor', () => {
    // Arrange / Act: el editor headless singleton de las conversiones server.
    const marks = headlessEditor().pmSchema.marks

    // Assert: sin este mark, convertir un fragment con comentarios tiraría.
    expect(marks.comment).toBeDefined()
  })

  it('should convert a comment-bearing document to markdown without throwing and without leaking the thread id', async () => {
    // Arrange: sembrar un doc normal y anclarle a mano un comment mark, tal como hace
    // BlockNote al crear un hilo (un atributo `comment` sobre el texto del bloque).
    const { ydocState } = seedBody([{ type: 'paragraph', content: 'hello world' } as never])
    const doc = new Y.Doc()
    Y.applyUpdate(doc, base64ToUpdate(ydocState))
    const text = firstXmlText(doc.getXmlFragment(BLOCKNOTE_FRAGMENT))
    expect(text).not.toBeNull()
    text!.format(0, text!.length, { comment: { threadId: 'thread-abc', orphan: false } })
    const ydoc_state = updateToBase64(Y.encodeStateAsUpdate(doc))

    // Act
    const md = (await readDocBody({ content: null, ydoc_state }, 'markdown')) as string

    // Assert: se convierte (no tira), conserva el texto y NO filtra el id del hilo.
    expect(md).toContain('hello world')
    expect(md).not.toContain('thread-abc')
  })
})

describe('toCommentUser', () => {
  it('should map a member to id + nickname + avatar when both are present', () => {
    // Arrange / Act
    const user = toCommentUser({
      user_id: 'u1',
      nickname: 'Ada',
      email: 'ada@example.com',
      avatar_url: 'https://cdn/x.png',
    })

    // Assert
    expect(user).toEqual({ id: 'u1', username: 'Ada', avatarUrl: 'https://cdn/x.png' })
  })

  it('should fall back to the email prefix and empty avatar when nickname/avatar are null', () => {
    // Arrange / Act
    const user = toCommentUser({
      user_id: 'u2',
      nickname: null,
      email: 'bob@example.com',
      avatar_url: null,
    })

    // Assert
    expect(user).toEqual({ id: 'u2', username: 'bob', avatarUrl: '' })
  })
})
