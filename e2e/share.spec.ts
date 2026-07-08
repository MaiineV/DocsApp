import { test, expect } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

// Cubre el goal de la Fase 12: crear un link view-only, verlo SIN login, revocarlo
// y que el link deje de funcionar (404).
test('compartir doc → ver deslogueado → revocar → 404', async ({ page, browser }) => {
  await login(page)

  // Crear doc con título + contenido únicos y esperar el autosave.
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })
  const token = `share${Date.now()}`
  const title = `E2E ${token}`
  const bodyText = `contenido publico ${token}`
  await page.getByLabel('Title').fill(title)
  const body = page.locator('[contenteditable="true"]').first()
  await body.click()
  await page.keyboard.type(bodyText)
  // El autosave del CUERPO (persistYdoc, debounce 2s, payload grande con el
  // snapshot base64) debe commitear ANTES de crear el link: el badge "Saved ✓"
  // puede venir del guardado del TÍTULO (debounce 0.8s) con el cuerpo todavía
  // en vuelo → la vista pública anon saldría sin contenido.
  // Se lo distingue del guardado del título porque solo persistYdoc lleva el
  // JSON de bloques ("paragraph") en el payload.
  const persisted = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.startsWith('/docs') &&
      (r.request().postData()?.includes('paragraph') ?? false),
    { timeout: 15_000 },
  )
  await expect(body).toContainText(bodyText)
  await persisted

  // Abrir el diálogo Compartir (summary de un <details>) y crear el link público.
  await page.locator('summary', { hasText: 'Share' }).click()
  await page.getByRole('button', { name: 'Create public link' }).click()

  // El link "Open" trae el href relativo /share/<token>.
  const openLink = page.getByRole('link', { name: /Open/ })
  await expect(openLink).toBeVisible({ timeout: 10_000 })
  const href = await openLink.getAttribute('href')
  expect(href).toMatch(/^\/share\/.+/)

  // Ver el doc en un contexto DESLOGUEADO (sin cookies de sesión).
  const anon = await browser.newContext()
  try {
    const anonPage = await anon.newPage()
    const resp = await anonPage.goto(href!)
    expect(resp?.status()).toBe(200)
    await expect(anonPage.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
    await expect(anonPage.getByText(bodyText)).toBeVisible()
    // Read-only: ni input de Título ni editor editable en la página pública.
    await expect(anonPage.getByLabel('Title')).toHaveCount(0)
    await expect(anonPage.locator('[contenteditable="true"]')).toHaveCount(0)
  } finally {
    await anon.close()
  }

  // Revocar el link (confirm inline). El diálogo vuelve al estado "sin link"
  // recién cuando la server action resolvió OK → esperarlo evita la race de
  // visitar el link público antes de que el revoke commitee en la DB.
  await page.getByRole('button', { name: 'Stop sharing' }).click()
  await page.getByRole('button', { name: 'Yes, stop sharing' }).click()
  await expect(page.getByRole('button', { name: 'Create public link' })).toBeVisible({
    timeout: 10_000,
  })

  // El link público ahora da 404.
  const anon2 = await browser.newContext()
  try {
    const anonPage2 = await anon2.newPage()
    const resp2 = await anonPage2.goto(href!)
    expect(resp2?.status()).toBe(404)
  } finally {
    await anon2.close()
  }

  // Cleanup: borrar el doc.
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
})
