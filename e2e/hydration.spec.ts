import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

// Guardia de hidratación para las vistas con el árbol DnD (sidebar del editor e
// índice /docs): React loguea los mismatches como console.error ("Hydration
// failed" / "hydrated but some attributes..."). Regresiones ya cazadas acá:
// portal del DragOverlay en SSR (dom-shim define document global) y el id no
// determinista de DndContext (DndDescribedBy-N).
test('las vistas del árbol hidratan sin errores', async ({ page }) => {
  const hydrationErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && /hydrat/i.test(m.text())) hydrationErrors.push(m.text())
  })
  page.on('pageerror', (e) => {
    if (/hydrat/i.test(e.message)) hydrationErrors.push(e.message)
  })

  await login(page)

  // Crear un doc para tener sidebar (y algo que listar en el índice).
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })
  const title = `E2E hydration ${Date.now()}`
  await page.getByLabel('Title').fill(title)
  await expect(page.locator('aside').getByRole('link', { name: title })).toBeVisible({
    timeout: 15_000,
  })

  // Recarga dura del editor (SSR + hidratación de la sidebar con DnD).
  await page.reload()
  await expect(page.locator('aside').getByRole('link', { name: title })).toBeVisible({
    timeout: 15_000,
  })

  // Índice /docs (variante index del árbol).
  await page.goto('/docs')
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 })

  expect(hydrationErrors).toEqual([])

  // Cleanup.
  await page.getByRole('link', { name: title }).first().click()
  await expect(page.getByLabel('Title')).toHaveValue(title, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
})
