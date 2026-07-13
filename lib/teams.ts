import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import type { Role } from '@/lib/types'

export type TeamWithRole = {
  id: string
  name: string
  role: Role
}

// Cookie del team activo (multi-team). httpOnly: solo el server la lee/escribe.
export const ACTIVE_TEAM_COOKIE = 'active_team_id'

export function activeTeamCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  }
}

// Teams del usuario actual con su rol, ordenados por antigüedad de la
// membership. RLS garantiza que solo devuelve teams donde es miembro.
// `cache` deduplica la query dentro de un mismo render pass.
export const getMyTeams = cache(async (): Promise<TeamWithRole[]> => {
  const user = await getAuthUser()
  if (!user) return []
  const supabase = await createClient()

  // Filtrar a las memberships PROPIAS. La policy memberships_select también deja
  // ver las de los compañeros del mismo team (para listar miembros); sin este
  // filtro, un usuario podría tomar el rol de OTRO miembro del team (p. ej. ver
  // un team donde es viewer como si fuera owner).
  const { data, error } = await supabase
    .from('memberships')
    .select('role, teams(id, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  // many-to-one: en runtime `teams` es un objeto, pero supabase-js (sin tipos
  // generados) lo infiere como array -> casteamos vía unknown.
  type Row = { role: Role; teams: { id: string; name: string } | null }
  return ((data ?? []) as unknown as Row[])
    .filter((m): m is Row & { teams: { id: string; name: string } } => m.teams !== null)
    .map((m) => ({ id: m.teams.id, name: m.teams.name, role: m.role }))
})

// Team activo: el de la cookie si el usuario sigue siendo miembro, si no el
// primero. La cookie se valida contra getMyTeams() (filtrado por RLS), así que
// si apunta a un team del que te sacaron, cae al fallback de forma segura. No se
// reescribe la cookie acá (los writes se tragan fuera de un Server Action).
export const getActiveTeam = cache(async (): Promise<TeamWithRole | null> => {
  const teams = await getMyTeams()
  if (teams.length === 0) return null

  const cookieStore = await cookies()
  const wanted = cookieStore.get(ACTIVE_TEAM_COOKIE)?.value
  const active = wanted ? teams.find((t) => t.id === wanted) : undefined
  return active ?? teams[0]
})
