import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

test('crear PAT → revelar una vez → aparece en la lista → revocar', async ({ page }) => {
  await login(page)
  await page.goto('/profile/tokens')

  const name = `e2e-${Date.now()}`

  // Crear el token (scope/expiry por defecto).
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Generate token' }).click()

  // Se revela el valor UNA vez (banner "Token created" con el dapp_…).
  await expect(page.getByText('Token created')).toBeVisible({ timeout: 15_000 })

  // Aparece en la lista, identificado por su nombre único.
  const row = page.locator('li').filter({ hasText: name })
  await expect(row).toBeVisible({ timeout: 10_000 })

  // Revocar (confirm inline) → desaparece de la lista.
  await row.getByRole('button', { name: 'Revoke', exact: true }).click()
  await row.getByRole('button', { name: 'Yes, revoke' }).click()
  await expect(page.locator('li').filter({ hasText: name })).toHaveCount(0, { timeout: 10_000 })
})
