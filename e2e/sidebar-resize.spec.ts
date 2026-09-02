import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

// Sin credenciales (E2E_EMAIL/E2E_PASSWORD) no se puede correr → skip explícito.
test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

// Sidebar redimensionable (desktop): drag del handle, persistencia por cookie
// (sobrevive reload sin errores de hidratación), teclado, y el ancho elegido
// sobrevive a colapsar/expandir. Anchos: min 200, max 480, default 256.
test('el sidebar se redimensiona y el ancho persiste', async ({ page }) => {
  const hydrationErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && /hydrat/i.test(m.text())) hydrationErrors.push(m.text())
  })

  await login(page)
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })

  const aside = page.locator('aside')
  const handle = page.getByRole('separator', { name: 'Resize sidebar' })
  const asideWidth = async () => (await aside.boundingBox())!.width

  expect(await asideWidth()).toBeCloseTo(256, 0)

  // Drag +100px.
  const box = (await handle.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 50, cy)
  await page.mouse.move(cx + 100, cy)
  await page.mouse.up()
  expect(await asideWidth()).toBeCloseTo(356, 0)

  // Persiste tras reload (cookie leída en SSR) y sin mismatch de hidratación.
  await page.reload()
  await expect(handle).toBeVisible({ timeout: 15_000 })
  expect(await asideWidth()).toBeCloseTo(356, 0)
  expect(hydrationErrors).toEqual([])

  // Teclado: flecha derecha +16, Enter → default.
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(asideWidth).toBeCloseTo(372, 0)
  await page.keyboard.press('Enter')
  await expect.poll(asideWidth).toBeCloseTo(256, 0)

  // Colapsar y expandir conserva el ancho elegido (y el handle desaparece
  // mientras está colapsado).
  await page.keyboard.press('ArrowRight')
  await expect.poll(asideWidth).toBeCloseTo(272, 0)
  await page.getByRole('button', { name: 'Collapse panel' }).click()
  await expect(handle).toBeHidden()
  await expect.poll(asideWidth).toBeCloseTo(0, 0)
  await page.getByRole('button', { name: 'Expand panel' }).click()
  await expect(handle).toBeVisible()
  await expect.poll(asideWidth).toBeCloseTo(272, 0)

  // Cleanup: volver al default y borrar el doc.
  await handle.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
})
