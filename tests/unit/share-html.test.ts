// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseMarkdown, renderHtml } from '@/lib/api/markdown'
import { sanitizeHtml } from '@/lib/api/html'

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
})
