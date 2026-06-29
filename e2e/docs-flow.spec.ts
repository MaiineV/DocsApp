import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

// Sin credenciales (E2E_EMAIL/E2E_PASSWORD) no se puede correr → skip explícito.
test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

test('login → crear doc → título persiste tras reload → borrar', async ({ page }) => {
  await login(page)

  // Crear documento (redirige a /docs/<id>).
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })

  // Título único.
  const unique = `E2E ${Date.now()}`
  await page.getByLabel('Title').fill(unique)

  // Cuerpo: tipear en el editor BlockNote (contenteditable) y verlo in-session.
  const body = page.locator('[contenteditable="true"]').first()
  await body.click()
  await page.keyboard.type('Hello from E2E')
  await expect(body).toContainText('Hello from E2E')

  // Esperar el autosave del título.
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })

  // Reload → el título persiste.
  await page.reload()
  await expect(page.getByLabel('Title')).toHaveValue(unique, { timeout: 15_000 })

  // Borrar (cleanup) → vuelve a /docs.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
})
