import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/user'
import { getDocument } from '@/lib/documents'
import { fetchPrintBundle, PRINT_MAX_DOCS } from '@/lib/api/print-doc'
import { getDictionary, getLocale } from '@/lib/i18n'
import { fmt } from '@/lib/i18n/format'
import { PrintTrigger } from './print-trigger'

export const runtime = 'nodejs'

// Export a PDF: la página + todas sus subpáginas (orden de sidebar) en un único
// documento listo para "Guardar como PDF" del navegador. Vive FUERA de `(app)` para
// no heredar header ni sidebar. Acceso: sesión + RLS (doc ajeno → 404).

// Fuerza tema claro en el export aunque el usuario use dark: corre en el parseo,
// después del THEME_INIT del root layout → sin flash.
const FORCE_LIGHT = `document.documentElement.setAttribute('data-theme','light')`

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const [doc, t] = await Promise.all([getDocument(id), getLocale().then(getDictionary)])
  const robots = { index: false, follow: false }
  // El título es el nombre de archivo que sugiere "Guardar como PDF".
  return { title: doc ? doc.title || t.common.untitled : t.metadata.title, robots }
}

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [user, bundle, locale] = await Promise.all([
    getAuthUser(),
    fetchPrintBundle(id),
    getLocale(),
  ])
  if (!user) redirect('/login')
  if (!bundle) notFound()

  const t = getDictionary(locale)
  const untitled = t.common.untitled
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date())
  const hasSubpages = bundle.pages.length > 1

  return (
    <main className="print-root">
      <script dangerouslySetInnerHTML={{ __html: FORCE_LIGHT }} />
      <PrintTrigger
        backHref={`/docs/${id}`}
        labels={{ print: t.print.printButton, back: t.print.back, hint: t.print.hint }}
      />

      <section className="print-cover">
        {bundle.root.icon ? <div className="print-cover-icon">{bundle.root.icon}</div> : null}
        <h1 className="print-cover-title">{bundle.root.title || untitled}</h1>
        <p className="print-cover-meta">
          {fmt(t.print.exportedAt, { date })}
          {hasSubpages ? ` · ${fmt(t.print.pageCount, { count: bundle.pages.length })}` : null}
        </p>
        {bundle.truncated ? (
          <p className="print-cover-warning">{fmt(t.print.truncated, { max: PRINT_MAX_DOCS })}</p>
        ) : null}
      </section>

      {hasSubpages ? (
        <nav className="print-toc" aria-label={t.print.toc}>
          <h2>{t.print.toc}</h2>
          <ol>
            {bundle.pages.map((p) => (
              <li key={p.id} style={{ paddingLeft: `${p.depth * 1.25}rem` }}>
                <a href={`#doc-${p.id}`}>
                  {p.icon ? `${p.icon} ` : null}
                  {p.title || untitled}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {bundle.pages.map((p) => (
        <section key={p.id} id={`doc-${p.id}`} className="print-page" data-depth={p.depth}>
          <h1 className="print-page-title">
            {p.icon ? <span className="mr-2">{p.icon}</span> : null}
            {p.title || untitled}
          </h1>
          {/* HTML sanitizado server-side (DOMPurify) en fetchPrintBundle. */}
          <div className="share-content" dangerouslySetInnerHTML={{ __html: p.html }} />
        </section>
      ))}
    </main>
  )
}
