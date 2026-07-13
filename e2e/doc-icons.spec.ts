import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

// Goal del emoji por documento: asignarlo desde el título, verlo en la sidebar,
// persistir tras reload y poder quitarlo.
test('asignar emoji → visible en sidebar → persiste tras reload → quitar', async ({ page }) => {
  await login(page)

  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })

  const title = `E2E icon ${Date.now()}`
  await page.getByLabel('Title').fill(title)
  const sidebarLink = page.locator('aside').getByRole('link', { name: new RegExp(title) })
  await expect(sidebarLink).toBeVisible({ timeout: 15_000 })
  // Esperar el persist real ("Saved ✓") antes de seguir: la fila de la sidebar
  // aparece client-side al instante, ANTES de que el título se guarde en DB.
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })

  // Abrir el picker (trigger = <summary>), buscar y elegir 🚀.
  await page.locator('summary[aria-label="Add icon"]').click()
  await page.getByLabel('Search emoji…').fill('rocket')
  await page.getByRole('button', { name: /rocket launch/ }).click()

  // El header muestra el emoji (el trigger pasa a "Change icon") y la sidebar
  // lo refleja cuando la action revalida el layout.
  const changeIcon = page.locator('summary[aria-label="Change icon"]')
  await expect(changeIcon).toContainText('🚀')
  await expect(sidebarLink).toContainText('🚀', { timeout: 15_000 })

  // Persistencia: reload → sigue en header y sidebar.
  await page.reload()
  await expect(changeIcon).toContainText('🚀', { timeout: 15_000 })
  await expect(sidebarLink).toContainText('🚀')

  // Quitar el ícono → vuelve el trigger "Add icon" y la sidebar queda sin emoji.
  await changeIcon.click()
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('summary[aria-label="Add icon"]')).toBeVisible()
  await expect(sidebarLink).not.toContainText('🚀', { timeout: 15_000 })

  // Cleanup.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
})
