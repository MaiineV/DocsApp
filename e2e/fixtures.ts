import { type Page, expect } from '@playwright/test'

export const E2E_EMAIL = process.env.E2E_EMAIL ?? ''
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? ''
export const E2E_READY = Boolean(E2E_EMAIL && E2E_PASSWORD)

// Login por la UI con la cuenta de prueba. Tras loguear con un team existente,
// la app redirige a /docs.
export async function login(page: Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(E2E_EMAIL)
  const pw = page.locator('input[type="password"]')
  await pw.fill(E2E_PASSWORD)
  await pw.press('Enter') // submitea el form (Server Action) sin ambigüedad de selector
  await expect(page).toHaveURL(/\/docs/, { timeout: 15_000 })
}
