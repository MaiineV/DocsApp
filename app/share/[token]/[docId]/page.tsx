import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchSharedDoc } from '@/lib/api/shared-doc'
import { getDictionary, getLocale } from '@/lib/i18n'
import { SharedDocView } from '../shared-doc-view'

export const runtime = 'nodejs'

// Subpágina de un link público. La RPC valida que `docId` pertenezca al set
// compartido (raíz + descendientes si include_subpages); fuera del set → 404.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string; docId: string }>
}): Promise<Metadata> {
  const { token, docId } = await params
  const [doc, t] = await Promise.all([
    fetchSharedDoc(token, docId),
    getLocale().then(getDictionary),
  ])
  const robots = { index: false, follow: false }
  if (!doc) return { title: t.metadata.title, robots }
  return { title: `${doc.title || t.common.untitled} · DocsApp`, robots }
}

export default async function ShareSubPage({
  params,
}: {
  params: Promise<{ token: string; docId: string }>
}) {
  const { token, docId } = await params
  const doc = await fetchSharedDoc(token, docId)
  if (!doc) notFound()
  const t = getDictionary(await getLocale())
  return <SharedDocView doc={doc} untitled={t.common.untitled} />
}
