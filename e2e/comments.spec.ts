import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

// Cubre el goal de la Fase 13: un editor crea un comentario sobre una selección,
// el comentario PERSISTE al recargar y se puede RESOLVER. El UI interno de
// comentarios de BlockNote está en inglés (locale en-US del proyecto).
test('comentar una selección → persiste tras reload → resolver', async ({ page }) => {
  await login(page)

  // Crear doc con contenido único y esperar el autosave.
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })
  const stamp = `c${Date.now()}`
  const bodyText = `comment target ${stamp}`
  const commentText = `nice point ${stamp}`
  await page.getByLabel('Title').fill(`E2E comments ${stamp}`)
  const body = page.locator('[contenteditable="true"]').first()
  await body.click()
  await page.keyboard.type(bodyText)
  await expect(body).toContainText(bodyText)
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })

  // Seleccionar el párrafo (triple click) → toolbar → "Add comment".
  await body.click({ clickCount: 3 })
  await page.getByRole('button', { name: 'Add comment' }).click()

  // Escribir el comentario en el composer flotante (editor anidado) y guardar.
  const composer = page.locator('.bn-comment-editor [contenteditable="true"]')
  await composer.click()
  await page.keyboard.type(commentText)
  await page.getByRole('button', { name: 'Save' }).click()

  // El texto quedó marcado como comentado y el toggle muestra 1 hilo abierto.
  await expect(page.locator('.bn-thread-mark').first()).toBeVisible({ timeout: 10_000 })
  const toggle = page.getByRole('button', { name: /comments/i })
  await expect(toggle).toContainText('1')

  // Recargar: el comentario PERSISTE (vive en ydoc_state por el autosave existente).
  await page.reload()
  await expect(page.locator('.bn-thread-mark').first()).toBeVisible({ timeout: 15_000 })

  // Abrir el panel y confirmar que el hilo aparece con su texto.
  await page.getByRole('button', { name: /comments/i }).click()
  const panel = page.getByLabel('Comments')
  await expect(panel.getByText(commentText)).toBeVisible({ timeout: 10_000 })

  // Resolver el hilo desde el panel → BlockNote lo marca como resuelto.
  await panel.getByRole('button', { name: 'Resolve' }).click()
  await expect(panel.getByText(/resolved/i)).toBeVisible({ timeout: 10_000 })

  // Cleanup: borrar el doc.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
})
