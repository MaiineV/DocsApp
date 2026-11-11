import { test, expect, type Locator, type Page } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

// Goal del export a PDF: /print/<id> concatena la página + subpáginas en orden de
// sidebar (pre-order), con portada e índice, y dispara window.print() solo.
// window.print se stubbea (el diálogo nativo bloquearía el browser headless).

function sidebarRow(page: Page, title: string): Locator {
  return page.locator('aside li').filter({ has: page.getByRole('link', { name: title }) })
}

// Crea una subpágina de `parentTitle` con el "+" del row y le pone título.
async function addSubpage(page: Page, parentTitle: string, title: string) {
  const before = page.url()
  await sidebarRow(page, parentTitle).getByRole('button', { name: 'Add subpage' }).click()
  await page.waitForURL(
    (url) => /\/docs\/[0-9a-f-]+/.test(url.pathname) && url.toString() !== before,
    { timeout: 15_000 },
  )
  await expect(page.getByLabel('Title')).toHaveValue('', { timeout: 15_000 })
  await page.getByLabel('Title').fill(title)
  await expect(sidebarRow(page, title)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })
}

test('should export the page and its subpages in sidebar order when opening /print/<id>', async ({
  page,
}) => {
  // Arrange: raíz → hijo → nieto, con texto en el cuerpo del nieto.
  await login(page)
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })
  const rootId = new URL(page.url()).pathname.split('/').pop() as string
  const stamp = Date.now()
  const tRoot = `E2E print root ${stamp}`
  const tChild = `E2E print child ${stamp}`
  const tGrand = `E2E print grand ${stamp}`
  const bodyText = `grand body ${stamp}`
  await page.getByLabel('Title').fill(tRoot)
  await expect(sidebarRow(page, tRoot)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })
  await addSubpage(page, tRoot, tChild)
  await addSubpage(page, tChild, tGrand)

  const bodyPersisted = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.startsWith('/docs') &&
      (r.request().postData()?.includes('paragraph') ?? false),
    { timeout: 15_000 },
  )
  await page.locator('[contenteditable="true"]').first().click()
  await page.keyboard.type(bodyText)
  await bodyPersisted

  // El botón del doc apunta al export.
  await page.getByRole('link', { name: tRoot }).first().click()
  await expect(page.getByLabel('Title')).toHaveValue(tRoot, { timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Export PDF' })).toHaveAttribute(
    'href',
    `/print/${rootId}`,
  )

  await page.addInitScript(() => {
    ;(window as unknown as { __printed: number }).__printed = 0
    window.print = () => {
      ;(window as unknown as { __printed: number }).__printed++
    }
  })

  // Act
  await page.goto(`/print/${rootId}`)

  // Assert: portada, índice y secciones en pre-order, con el cuerpo renderizado.
  await expect(page.locator('.print-cover-title')).toHaveText(tRoot)
  await expect(page.locator('.print-toc li')).toHaveText([tRoot, tChild, tGrand])
  await expect(page.locator('section.print-page .print-page-title')).toHaveText([
    tRoot,
    tChild,
    tGrand,
  ])
  await expect(page.locator('section.print-page').nth(2)).toContainText(bodyText)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed))
    .toBe(1)

  // Cleanup: borrar la raíz (hijo y nieto caen en cascada).
  await page.goto(`/docs/${rootId}`)
  await expect(page.getByLabel('Title')).toHaveValue(tRoot, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
})

test('should return 404 when the document does not exist or is not accessible', async ({
  page,
}) => {
  // Arrange
  await login(page)

  // Act
  const res = await page.goto('/print/00000000-0000-0000-0000-000000000000')

  // Assert
  expect(res?.status()).toBe(404)
})
