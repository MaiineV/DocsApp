// Tipos del dominio (Fase 0). Espejo del schema en supabase/migrations.
// Más adelante se pueden autogenerar con `supabase gen types typescript`.

export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

export type Team = {
  id: string
  name: string
  color: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type Membership = {
  id: string
  team_id: string
  user_id: string
  role: Role
  created_at: string
  updated_at: string
}

export type Document = {
  id: string
  team_id: string
  title: string
  // Emoji del documento (picker del título). Null = sin ícono.
  icon: string | null
  content: string
  created_by: string | null
  parent_id: string | null
  // Orden manual entre hermanos (fractional indexing, menor = más arriba).
  position: number
  created_at: string
  updated_at: string
}

// Miembro de un team (lo devuelve la RPC list_team_members): email + perfil.
export type TeamMember = {
  user_id: string
  email: string
  role: Role
  nickname: string | null
  avatar_url: string | null
}

// Perfil de usuario (Fase 6): nick + avatar.
export type Profile = {
  id: string
  nickname: string | null
  avatar_url: string | null
}

// Resultado de búsqueda de documentos (Fase 10).
export type SearchResult = { id: string; title: string; icon: string | null; team: string }

// Scope de un Personal Access Token (Fase 7.2): read (GET) o read_write (todo).
export type ApiTokenScope = 'read' | 'read_write'

// Personal Access Token de la API (Fase 7.2). NUNCA incluye el token crudo ni su
// hash: solo el prefijo visible (dapp_xxxx…) para identificarlo en la UI.
export type ApiTokenRow = {
  id: string
  name: string
  scope: ApiTokenScope
  token_prefix: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

// Evento o deadline del calendario de un team. all_day: starts_at/ends_at son
// medianoches UTC con fin exclusivo (misma semántica que `date` en Google).
export type EventKind = 'event' | 'deadline'

export type TeamEvent = {
  id: string
  team_id: string
  title: string
  description: string
  kind: EventKind
  all_day: boolean
  starts_at: string
  ends_at: string
  created_by: string | null
  google_event_id: string | null
  google_updated_at: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
}

// Evento con el team resuelto (vista consolidada del perfil).
export type CalendarEvent = Pick<
  TeamEvent,
  'id' | 'team_id' | 'title' | 'description' | 'kind' | 'all_day' | 'starts_at' | 'ends_at'
> & { team_name: string; team_color: string | null }

// Estado de la integración Google de un team, para la UI. Nunca incluye tokens.
export type TeamCalendarStatus = {
  hosted: boolean
  host_user_id: string | null
  host_email: string | null
  last_synced_at: string | null
  shared_with_me: boolean
}

// Invitación pendiente (Fase 3).
export type Invitation = {
  id: string
  team_id: string
  email: string
  role: Role
  token: string
  invited_by: string | null
  created_at: string
  expires_at: string
}
