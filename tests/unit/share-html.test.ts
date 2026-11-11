// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseMarkdown, renderHtml } from '@/lib/api/markdown'
import { sanitizeHtml } from '@/lib/api/html'
import { linkDocRefs } from '@/lib/api/print-doc'

// La vista pública /share renderiza el contenido del doc a HTML semántico
// (blocksToHTMLLossy) sanitizado. Requiere DOM (jsdom) para el exporter de BlockNote
// y para DOMPurify.
describe('share html rendering', () => {
  it('should render blocks to semantic HTML preserving the text when given markdown content', async () => {
    // Arrange
    const blocks = await parseMarkdown('# Título\n\nUn **párrafo** de texto.\n\n- item uno\n- item dos\n')

    // Act
    const html = await renderHtml(blocks)

    // Assert
    expect(html).toContain('Título')
    expect(html).toContain('párrafo')
    expect(html).toContain('item uno')
    expect(html).toContain('item dos')
    expect(html.toLowerCase()).toContain('<h1')
  })

  it('should strip script tags, javascript: hrefs and inline handlers when given hostile HTML', () => {
    // Arrange
    const dirty =
      '<p>contenido ok</p>' +
      '<script>alert(1)</script>' +
      '<a href="javascript:alert(2)">link</a>' +
      '<img src="x" onerror="alert(3)">'

    // Act
    const clean = sanitizeHtml(dirty).toLowerCase()

    // Assert
    expect(clean).toContain('contenido ok')
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('javascript:')
    expect(clean).not.toContain('onerror')
  })

  it('should turn @mentions into internal links only when the target is inside the export', async () => {
    // Arrange
    const blocks = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Ver ', styles: {} },
          { type: 'docref', props: { docId: 'in-1', label: 'Adentro' } },
          { type: 'text', text: ' y ', styles: {} },
          { type: 'docref', props: { docId: 'out-1', label: 'Afuera' } },
        ],
      },
    ] as never

    // Act
    const html = linkDocRefs(sanitizeHtml(await renderHtml(blocks)), new Set(['in-1']))

    // Assert
    expect(html).toContain('<a href="#doc-in-1" class="print-docref">Adentro</a>')
    expect(html).toMatch(/<span[^>]*data-doc-id="out-1"[^>]*>Afuera<\/span>/)
  })
})
