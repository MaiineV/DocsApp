import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getDocument, listTeamDocs } from '@/lib/documents'
import { getMyTeams } from '@/lib/teams'
import DocSidebar from '@/components/doc-sidebar'

const SIDEBAR_COOKIE = 'docs_sidebar_collapsed'

// Layout del documento: aporta el sidebar con el árbol de docs del team. OJO:
// el segmento [id] se re-renderiza entero al cambiar de doc (el param es parte
// de la identidad del segmento), así que este layout corre en cada navegación
// doc→doc — por eso el colapso persiste vía cookie y el fetch va en paralelo.
export default async function DocLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // getDocument solo bloquea a listTeamDocs (necesita team_id); el resto corre
  // en paralelo. React.cache dedupea ambos fetches con la page.
  const docP = getDocument(id)
  const teamDocsP = docP.then((d) => (d ? listTeamDocs(d.team_id) : []))
  const [doc, teamDocs, teams, cookieStore] = await Promise.all([
    docP,
    teamDocsP,
    getMyTeams(),
    cookies(),
  ])
  if (!doc) notFound()
  const role = teams.find((t) => t.id === doc.team_id)?.role
  const canEdit = role !== undefined && role !== 'viewer'
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === '1'

  return (
    <div className="relative flex flex-1 overflow-hidden">
      <DocSidebar
        docs={teamDocs.map((d) => ({
          id: d.id,
          title: d.title,
          icon: d.icon,
          parentId: d.parent_id,
          position: d.position,
        }))}
        activeDocId={id}
        canEdit={canEdit}
        initialCollapsed={collapsed}
      />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
