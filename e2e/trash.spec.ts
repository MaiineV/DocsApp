import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

test('borrar → papelera → restaurar → vuelve → borrar definitivo', async ({ page }) => {
  await login(page)

  // Crear doc con título único.
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })
  const token = `trash${Date.now()}`
  const title = `E2E ${token}`
  await page.getByLabel('Title').fill(title)
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })

  // Borrar → va a la papelera y redirige a /docs; ya no está en la lista activa.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
  await expect(page.getByRole('link', { name: new RegExp(token) })).toHaveCount(0)

  // Aparece en la papelera.
  await page.goto('/docs/trash')
  const row = page.locator('li').filter({ hasText: token })
  await expect(row).toBeVisible({ timeout: 10_000 })

  // Restaurar → desaparece de la papelera y vuelve a /docs.
  await row.getByRole('button', { name: 'Restore' }).click()
  await expect(page.locator('li').filter({ hasText: token })).toHaveCount(0, { timeout: 10_000 })
  await page.goto('/docs')
  await expect(page.getByRole('link', { name: new RegExp(token) })).toBeVisible({ timeout: 10_000 })

  // Re-borrar y borrar DEFINITIVO (cleanup).
  await page.getByRole('link', { name: new RegExp(token) }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })

  await page.goto('/docs/trash')
  const row2 = page.locator('li').filter({ hasText: token })
  await row2.getByRole('button', { name: 'Delete permanently' }).click()
  await row2.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.locator('li').filter({ hasText: token })).toHaveCount(0, { timeout: 10_000 })
})
