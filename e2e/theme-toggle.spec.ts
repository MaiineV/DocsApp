import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

test('el toggle de dark mode setea data-theme y persiste tras reload', async ({ page }) => {
  await login(page)

  const html = page.locator('html')
  // aria-label del toggle: "Theme: System|Light|Dark".
  const toggle = page.getByRole('button', { name: /Theme:/ })

  // Cicla sistema → claro → oscuro. Clickear hasta que el tema resuelto sea dark.
  for (let i = 0; i < 3; i++) {
    if ((await html.getAttribute('data-theme')) === 'dark') break
    await toggle.click()
  }
  expect(await html.getAttribute('data-theme')).toBe('dark')

  // Persiste (localStorage → script anti-flash) tras recargar.
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark', { timeout: 10_000 })
})
