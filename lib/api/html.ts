import '@/lib/api/dom-shim' // monta globalThis.window (jsdom). DEBE ir antes de dompurify.
import createDOMPurify from 'dompurify'

// La página pública `/share/<token>` renderiza HTML derivado del contenido del doc
// (autorado por miembros del team) con `dangerouslySetInnerHTML`. Aunque BlockNote
// escapa el texto, la página es PÚBLICA y sin login → sanitizamos server-side como
// defensa en profundidad: corta `<script>`, handlers `on*` y esquemas peligrosos
// (`javascript:`) en hrefs. DOMPurify sobre el `window` de jsdom que ya monta
// `dom-shim`; instancia única por proceso (la sanitización es síncrona → segura
// entre requests, igual que el headless editor).
const purify = createDOMPurify(
  globalThis.window as unknown as Parameters<typeof createDOMPurify>[0],
)

export function sanitizeHtml(html: string): string {
  return purify.sanitize(html, { USE_PROFILES: { html: true } })
}
