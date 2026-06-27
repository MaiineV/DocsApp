import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getDocument, listTeamDocs } from '@/lib/documents'
import { getMyTeams } from '@/lib/teams'
import DocSidebar from '@/components/doc-sidebar'

const SIDEBAR_COOKIE = 'docs_sidebar_collapsed'

// Layout del documento: aporta el sidebar con el árbol de docs del team. Es un
// layout COMPARTIDO → persiste entre navegaciones /docs/[id] → /docs/[id2]
// (solo cambia `children`), así el estado de colapso y la animación no se reinician.
export default async function DocLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const doc = await getDocument(id) // cacheado → la page reusa este fetch
  if (!doc) notFound()

  const [teamDocs, teams, cookieStore] = await Promise.all([
    listTeamDocs(doc.team_id),
    getMyTeams(),
    cookies(),
  ])
  const role = teams.find((t) => t.id === doc.team_id)?.role
  const canEdit = role !== undefined && role !== 'viewer'
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === '1'

  return (
    <div className="relative flex flex-1 overflow-hidden">
      <DocSidebar
        docs={teamDocs.map((d) => ({ id: d.id, title: d.title, parentId: d.parent_id }))}
        activeDocId={id}
        canEdit={canEdit}
        initialCollapsed={collapsed}
      />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
