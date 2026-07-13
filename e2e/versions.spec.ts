import { test, expect, type Page } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

// Espera el autosave del CUERPO (persistYdoc): se distingue del guardado del
// título porque solo persistYdoc lleva el JSON de bloques ("paragraph") en el
// payload. Mismo patrón que share.spec.ts.
function waitForBodyPersist(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.startsWith('/docs') &&
      (r.request().postData()?.includes('paragraph') ?? false),
    { timeout: 15_000 },
  )
}

// Goal Fase 14: los guardados dejan versiones coalescidas; el historial lista,
// previsualiza y RESTAURA de forma no destructiva (checkpoint pre-restore).
// La ventana de coalescing (10 min) implica: 1 versión por ráfaga — el spec
// espera exactamente 1 versión tras dos guardados, y 2 tras el restore.
test('editar → 1 versión en historial → preview → restore no destructivo', async ({ page }) => {
  await login(page)

  // Crear doc; el PRIMER guardado del cuerpo solo siembra ydoc_state (sin
  // versión: no hay "antes"); el SEGUNDO captura el estado previo ("alpha").
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })
  const stamp = `v${Date.now()}`
  const title = `E2E versions ${stamp}`
  const alphaText = `alpha ${stamp}`
  const bravoText = `bravo ${stamp}`
  await page.getByLabel('Title').fill(title)

  const body = page.locator('[contenteditable="true"]').first()
  await body.click()
  const persisted1 = waitForBodyPersist(page)
  await page.keyboard.type(alphaText)
  await persisted1

  const persisted2 = waitForBodyPersist(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type(bravoText)
  await persisted2

  // Historial: exactamente 1 versión (la ráfaga "bravo" capturó el estado alpha).
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page).toHaveURL(/\/versions/, { timeout: 15_000 })
  const rows = page.locator('main .mx-auto ul li')
  await expect(rows).toHaveCount(1, { timeout: 10_000 })

  // Preview: muestra el estado PRE-ráfaga (alpha sí, bravo no).
  await rows.first().locator('a').click()
  const preview = page.locator('.share-content')
  await expect(preview).toContainText(alphaText, { timeout: 10_000 })
  await expect(preview).not.toContainText(bravoText)

  // Restore (confirm inline) → vuelve al doc con el cuerpo revertido.
  await page.getByRole('button', { name: 'Restore this version' }).click()
  await page.getByRole('button', { name: 'Yes, restore' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+$/, { timeout: 15_000 })
  const restoredBody = page.locator('[contenteditable="true"]').first()
  await expect(restoredBody).toContainText(alphaText, { timeout: 15_000 })
  await expect(restoredBody).not.toContainText(bravoText)

  // No destructivo: el estado pisado ("bravo") quedó como checkpoint pre-restore.
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.locator('main .mx-auto ul li')).toHaveCount(2, { timeout: 10_000 })
  await page.locator('main .mx-auto ul li a').first().click()
  await expect(page.locator('.share-content')).toContainText(bravoText, { timeout: 10_000 })

  // Cleanup: borrar y purgar definitivo (ejercita además el CASCADE de versiones).
  await page.getByRole('link', { name: 'Back to document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+$/, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
  await page.goto('/docs/trash')
  const trashRow = page.locator('li').filter({ hasText: stamp })
  await trashRow.getByRole('button', { name: 'Delete permanently' }).click()
  await trashRow.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.locator('li').filter({ hasText: stamp })).toHaveCount(0, { timeout: 10_000 })
})
