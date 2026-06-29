import { JSDOM } from 'jsdom'

// BlockNote convierte markdown <-> blocks usando el DOM: `document.createElement`
// (al exportar) y `document.implementation.createHTMLDocument` (al parsear). En el
// server (Route Handlers) no hay DOM, así que montamos uno con jsdom UNA sola vez
// por proceso. Importar este módulo por su efecto secundario, antes de usar
// BlockNote para conversiones de texto.
//
// Seguridad entre requests: la conversión es síncrona (crea y serializa elementos
// y devuelve sin ceder el event loop en el medio), así que compartir el `document`
// global no genera interleaving entre requests concurrentes. linkedom NO alcanza
// (le falta `document.implementation.createHTMLDocument`); por eso jsdom.

const g = globalThis as unknown as {
  window?: unknown
  document?: unknown
  DOMParser?: unknown
}

if (typeof g.document === 'undefined') {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
  g.window = dom.window
  g.document = dom.window.document
  g.DOMParser ??= dom.window.DOMParser
}

export {}
