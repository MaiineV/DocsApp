import type { SharedDoc } from '@/lib/api/shared-doc'

// Render read-only del documento compartido. El HTML ya viene sanitizado desde
// `fetchSharedDoc` (DOMPurify server-side), por eso el dangerouslySetInnerHTML es
// seguro. `.share-content` da la tipografía de prosa (ver globals.css).
export function SharedDocView({ doc, untitled }: { doc: SharedDoc; untitled: string }) {
  return (
    <article className="mx-auto w-full max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold tracking-tight break-words">
        {doc.title || untitled}
      </h1>
      <div className="share-content" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </article>
  )
}
