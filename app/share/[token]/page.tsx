import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchSharedDoc } from '@/lib/api/shared-doc'
import { getDictionary, getLocale } from '@/lib/i18n'
import { SharedDocView } from './shared-doc-view'

export const runtime = 'nodejs' // jsdom/yjs para renderizar el cuerpo

// noindex por defecto (friends-and-family): un link público no debería aparecer en
// buscadores salvo que se agregue un toggle explícito (futuro). El título del doc
// sirve para previews al compartir el link (OG lo hereda del title).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const [doc, t] = await Promise.all([fetchSharedDoc(token), getLocale().then(getDictionary)])
  const robots = { index: false, follow: false }
  if (!doc) return { title: t.metadata.title, robots }
  return { title: `${doc.title || t.common.untitled} · DocsApp`, robots }
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const doc = await fetchSharedDoc(token)
  if (!doc) notFound()
  const t = getDictionary(await getLocale())
  return <SharedDocView doc={doc} untitled={t.common.untitled} />
}
