// Tipos del dominio (Fase 0). Espejo del schema en supabase/migrations.
// Más adelante se pueden autogenerar con `supabase gen types typescript`.

export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

export type Team = {
  id: string
  name: string
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
  content: string
  created_by: string | null
  parent_id: string | null
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
