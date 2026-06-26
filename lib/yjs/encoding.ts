import { fromBase64, toBase64 } from 'lib0/buffer'
import { Y } from '@/lib/yjs/yjs'

// Los updates/state vectors de Yjs son binarios (Uint8Array). El payload de
// Supabase Broadcast es JSON y la columna ydoc_state es text, así que viajan en
// base64. lib0/buffer elige automáticamente impl de browser o Node, por lo que
// estos helpers sirven en el cliente (provider) y en el server (persist).

export const updateToBase64 = (u: Uint8Array): string => toBase64(u)

export const base64ToUpdate = (s: string): Uint8Array => fromBase64(s)

// Combina varios updates base64 en un snapshot base64. Los merges de Yjs son
// conmutativos e idempotentes, así que el orden no importa y aplicar dos veces
// el mismo update es inocuo. Base de la persistencia con merge (no overwrite).
export function mergeBase64Updates(updates: string[]): string {
  return toBase64(Y.mergeUpdates(updates.map(fromBase64)))
}
