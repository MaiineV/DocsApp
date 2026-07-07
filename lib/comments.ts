import type { TeamMember } from '@/lib/types'
import { displayName } from '@/lib/collab'

// Identidad de un autor de comentario, en la forma que consume BlockNote
// (`User = { id, username, avatarUrl }`) para renderizar nombre/avatar en los hilos.
export type CommentUser = { id: string; username: string; avatarUrl: string }

// Miembro del team → autor de comentario. Solo nombre + avatar (NO el email):
// es lo único que necesita el UI de comentarios y evita filtrar mails al cliente.
// `displayName`: nick → prefijo del mail → 'Anónimo' (mismo que la presencia).
export function toCommentUser(
  m: Pick<TeamMember, 'user_id' | 'nickname' | 'email' | 'avatar_url'>,
): CommentUser {
  return {
    id: m.user_id,
    username: displayName(m.nickname, m.email),
    avatarUrl: m.avatar_url ?? '',
  }
}
