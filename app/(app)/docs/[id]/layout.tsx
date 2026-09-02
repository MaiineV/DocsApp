import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getDocument, listTeamDocs } from '@/lib/documents'
import { getMyTeams } from '@/lib/teams'
import DocSidebar from '@/components/doc-sidebar'
import { SIDEBAR_WIDTH_COOKIE, parseSidebarWidthCookie } from '@/lib/sidebar-width'

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
  const width = parseSidebarWidthCookie(cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value)

  return (
    // min-h-0: sin esto el flex item crece con el contenido y el overflow-hidden
    // no acota nada → sidebar y documento scrollean cada uno por su lado.
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
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
        initialWidth={width}
      />
      {/* min-w-0: con el sidebar ancho, un editor intrínsecamente ancho no debe
          empujar la fila flex más allá del overflow-hidden del contenedor. */}
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
