import { authenticateRequest, isAuthError } from '@/lib/api/auth'
import { fail, ok } from '@/lib/api/respond'

export const runtime = 'nodejs'

// GET /api/v1/teams — equipos del usuario autenticado + su rol. La RLS solo
// devuelve memberships propias filtradas por user_id (ver gotcha de getMyTeams:
// la policy también expone las de compañeros, por eso el filtro explícito).
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth.error
  const { supabase, user } = auth

  const { data, error } = await supabase
    .from('memberships')
    .select('role, teams(id, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
  if (error) return fail('internal', error.message)

  type Row = { role: string; teams: { id: string; name: string } | null }
  const teams = ((data ?? []) as unknown as Row[])
    .filter((m): m is Row & { teams: { id: string; name: string } } => m.teams !== null)
    .map((m) => ({ id: m.teams.id, name: m.teams.name, role: m.role }))

  return ok({ teams })
}
