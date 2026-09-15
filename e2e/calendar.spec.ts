import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

// Goal calendario: un editor+ crea, edita y borra un evento en el calendario
// del equipo activo. No requiere Google (el sync es no-op sin host).
test('crear evento → aparece en la grilla → editar → borrar', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Calendar' }).click()
  await expect(page).toHaveURL(/\/teams\/[0-9a-f-]+\/calendar/, { timeout: 15_000 })

  const title = `e2e-${Date.now()}`
  const edited = `${title}-edited`

  // Panel del día 15 del mes visible → "New event".
  await page.getByRole('button', { name: /^\d{4}-\d{2}-15$/ }).click()
  await page.getByRole('button', { name: 'New event' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  // Chip en la grilla (title attribute = título del evento).
  const chip = page.locator('[role=gridcell] button[title]').filter({ hasText: title })
  await expect(chip).toBeVisible({ timeout: 15_000 })

  // Abrir → editar título → guardar.
  await chip.click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Title').fill(edited)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('[role=gridcell] button[title]').filter({ hasText: edited })).toBeVisible({
    timeout: 15_000,
  })

  // Borrar con confirm inline → desaparece.
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.locator('[role=gridcell] button[title]').filter({ hasText: edited })).toHaveCount(0, {
    timeout: 15_000,
  })
})
