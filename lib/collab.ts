// Identidad de presencia/cursor para la colaboración. Puro (sin BlockNote ni
// Yjs) → lo puede importar tanto el server (page) como el cliente.

export type CollabUser = { name: string; color: string }

// Color estable por usuario (mismo id → mismo color) para el cursor. HSL con
// saturación/luz fijas para que contraste razonable en claro y oscuro.
export function cursorColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 68%, 55%)`
}

// Nombre visible: nick → prefijo del mail → 'Anónimo'. Puro (sin server/client
// imports) → lo usan header, members-list y la presencia.
export function displayName(
  nickname: string | null | undefined,
  email: string | null | undefined,
): string {
  return nickname?.trim() || email?.split('@')[0]?.trim() || 'Anónimo'
}

// Identidad de presencia a partir del perfil (nick) con fallback al email.
export function collabUserFromProfile(
  nickname: string | null | undefined,
  email: string | null | undefined,
  id: string,
): CollabUser {
  return { name: displayName(nickname, email), color: cursorColor(id || email || '') }
}

// Nombre visible del colaborador a partir del email (parte antes del @).
export function collabUserFromEmail(email: string | null | undefined, id: string): CollabUser {
  const name = email?.split('@')[0]?.trim() || 'Anónimo'
  return { name, color: cursorColor(id || email || name) }
}
