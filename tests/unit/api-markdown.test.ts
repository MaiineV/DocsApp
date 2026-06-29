// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseMarkdown, renderMarkdown } from '@/lib/api/markdown'

// Mismo mecanismo que validó el spike de Fase 7 (la API lee/escribe markdown
// server-side). Requiere DOM (jsdom) para el exporter/parser de BlockNote.
describe('api markdown round-trip', () => {
  it('parsea markdown a blocks y vuelve, conservando el contenido', async () => {
    const md = '# Hello\n\nThis is **bold** and a list:\n\n- one\n- two\n'
    const blocks = await parseMarkdown(md)
    expect(Array.isArray(blocks)).toBe(true)
    expect(blocks.length).toBeGreaterThan(0)

    const out = await renderMarkdown(blocks)
    expect(out).toContain('Hello')
    expect(out).toContain('one')
    expect(out).toContain('two')
  })
})
