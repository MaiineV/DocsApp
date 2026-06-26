import { redirect } from 'next/navigation'
import { getMyTeams } from '@/lib/teams'

// Entry point. El proxy garantiza que acá ya hay sesión. Si el usuario no
// tiene ningún team -> onboarding; si tiene -> al listado de documentos.
export default async function Home() {
  const teams = await getMyTeams()
  if (teams.length === 0) redirect('/onboarding')
  redirect('/docs')
}
