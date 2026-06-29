import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

test('la búsqueda encuentra un documento y navega a él', async ({ page }) => {
  await login(page)

  // Crear un doc con un token único en el título.
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })
  const createdUrl = page.url()
  const token = `zxq${Date.now()}`
  await page.getByLabel('Title').fill(`E2E search ${token}`)
  // El "Saved ✓" garantiza que el título (y por ende search_text vía trigger) persistió.
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })

  // Ir a /docs (sin doc abierto → la búsqueda vive en el header).
  await page.goto('/docs')
  await page.getByPlaceholder('Search documents…').first().fill(token)

  // Aparece el resultado y navega al doc.
  const result = page.getByRole('button', { name: new RegExp(token) })
  await expect(result).toBeVisible({ timeout: 10_000 })
  await result.click()
  await expect(page).toHaveURL(createdUrl, { timeout: 15_000 })

  // Cleanup.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
})
