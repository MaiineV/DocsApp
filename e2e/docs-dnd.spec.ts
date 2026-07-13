import { test, expect, type Locator, type Page } from '@playwright/test'
import { login, E2E_READY } from './fixtures'

test.skip(!E2E_READY, 'Faltan E2E_EMAIL/E2E_PASSWORD (ver .env.test.example)')

// Goal de la fase de reorganización: reordenar hermanas, anidar como subpágina y
// des-anidar con drag & drop en la sidebar, persistido en DB (sobrevive reload).
// dnd-kit no responde a dragAndDrop() de Playwright → gestos con mouse.down/move/up
// (MouseSensor con activationConstraint distance:5).

const INDENT_ROOT = '4px' // paddingLeft depth 0 (depth*12+4)
const INDENT_CHILD = '16px' // paddingLeft depth 1

function sidebarRow(page: Page, title: string): Locator {
  return page.locator('aside li').filter({ has: page.getByRole('link', { name: title }) })
}

// Arrastra el centro de `source` hasta el centro de `target` (+dx horizontal).
// dx > 0 proyecta más profundidad (anidar); dx < 0 des-anida.
// scrollIntoView primero: si el row quedó abajo del fold, las coordenadas del
// mouse caerían fuera del viewport y el drag no se activa.
async function dragRow(page: Page, source: Locator, target: Locator, dx = 0) {
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  const sb = await source.boundingBox()
  const tb = await target.boundingBox()
  if (!sb || !tb) throw new Error('row sin bounding box')
  // Esperar la response del POST de moveDocument tras soltar: así el próximo
  // gesto no corre encima de una action + revalidate todavía en vuelo. La action
  // postea a la URL actual: /docs/<id> en el editor y /docs (sin barra) en el índice.
  const moved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.startsWith('/docs'),
    { timeout: 15_000 },
  )
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
  await page.mouse.down()
  // Superar el activation constraint (distance 5) antes del movimiento real.
  await page.mouse.move(sb.x + sb.width / 2 + 8, sb.y + sb.height / 2, { steps: 2 })
  await page.mouse.move(tb.x + tb.width / 2 + dx, tb.y + tb.height / 2, { steps: 12 })
  await page.mouse.up()
  await moved
}

// Crea un doc raíz desde la sidebar y le pone título; espera el badge "Saved ✓"
// (la señal de que persistTitle corrió — la fila de la sidebar ya NO sirve de
// barrera: el título se propaga client-side al instante, antes del persist).
// OJO: se llama estando en OTRO doc → hay que esperar el CAMBIO de URL (un
// regex de /docs/[id] matchearía la URL actual y el fill iría al doc equivocado).
async function createRootDoc(page: Page, title: string) {
  const before = page.url()
  await page.getByRole('button', { name: 'New page' }).click()
  await page.waitForURL(
    (url) => /\/docs\/[0-9a-f-]+/.test(url.pathname) && url.toString() !== before,
    { timeout: 15_000 },
  )
  await expect(page.getByLabel('Title')).toHaveValue('', { timeout: 15_000 })
  await page.getByLabel('Title').fill(title)
  await expect(page.locator('aside').getByRole('link', { name: title })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })
}

test('reordenar → anidar → des-anidar con drag & drop, persistido tras reload', async ({
  page,
}) => {
  await login(page)

  // Entrar al primer doc para tener la sidebar (el índice /docs no la muestra).
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })

  const stamp = Date.now()
  const tA = `E2E dnd A ${stamp}`
  const tB = `E2E dnd B ${stamp}`
  const tC = `E2E dnd C ${stamp}`
  await page.getByLabel('Title').fill(tA)
  await expect(page.locator('aside').getByRole('link', { name: tA })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })
  await createRootDoc(page, tB)
  await createRootDoc(page, tC)

  // Orden relativo de los 3 docs en la sidebar (ignora docs ajenos al test).
  async function relativeOrder(): Promise<string[]> {
    const all = await page.locator('aside ul a[href^="/docs/"]').allInnerTexts()
    return all.filter((t) => t.includes(`${stamp}`))
  }

  // Estado inicial: creación → A, B, C (position max+gap por doc nuevo).
  expect(await relativeOrder()).toEqual([tA, tB, tC])

  // 1) REORDENAR: C arriba de A → C, A, B.
  await dragRow(page, sidebarRow(page, tC), sidebarRow(page, tA))
  await expect.poll(relativeOrder, { timeout: 10_000 }).toEqual([tC, tA, tB])

  // 2) ANIDAR: B sobre sí mismo con offset a la derecha → hijo de A (su hermana
  //    de arriba). El row queda indentado a depth 1.
  await dragRow(page, sidebarRow(page, tB), sidebarRow(page, tB), 30)
  await expect(sidebarRow(page, tB).locator('div').first()).toHaveCSS(
    'padding-left',
    INDENT_CHILD,
    { timeout: 10_000 },
  )

  // Persistencia: reload → orden y jerarquía sobreviven (leídos de la DB).
  await page.reload()
  await expect(page.locator('aside').getByRole('link', { name: tB })).toBeVisible({
    timeout: 15_000,
  })
  expect(await relativeOrder()).toEqual([tC, tA, tB])
  await expect(sidebarRow(page, tB).locator('div').first()).toHaveCSS(
    'padding-left',
    INDENT_CHILD,
  )
  await expect(sidebarRow(page, tA).locator('div').first()).toHaveCSS(
    'padding-left',
    INDENT_ROOT,
  )

  // 3) DES-ANIDAR: B con offset a la izquierda → vuelve a raíz (indent 0).
  await dragRow(page, sidebarRow(page, tB), sidebarRow(page, tB), -40)
  await expect(sidebarRow(page, tB).locator('div').first()).toHaveCSS(
    'padding-left',
    INDENT_ROOT,
    { timeout: 10_000 },
  )

  // Reload final: el des-anidado también persistió.
  await page.reload()
  await expect(page.locator('aside').getByRole('link', { name: tB })).toBeVisible({
    timeout: 15_000,
  })
  await expect(sidebarRow(page, tB).locator('div').first()).toHaveCSS(
    'padding-left',
    INDENT_ROOT,
  )

  // Cleanup: borrar los 3 docs (B primero: si quedara anidado, borrar A lo
  // arrastraría a la papelera por cascada). Tras cada Delete caemos en el índice
  // /docs, que también lista los docs → navegar desde ahí al siguiente.
  for (const title of [tB, tC, tA]) {
    await page.getByRole('link', { name: title }).first().click()
    await expect(page.getByLabel('Title')).toHaveValue(title, { timeout: 15_000 })
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
  }
})

// La página /docs (índice) usa el MISMO árbol interactivo que la sidebar
// (variante 'index'): drag & drop para reordenar y chevrons para colapsar.
test('índice /docs: colapsar/expandir subárbol y reordenar por drag, persistido', async ({
  page,
}) => {
  await login(page)

  // Doc raíz A con una subpágina, y doc raíz B (desde la sidebar del editor).
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]+/, { timeout: 15_000 })
  const stamp = Date.now()
  const tA = `E2E idx A ${stamp}`
  const tChild = `E2E idx child ${stamp}`
  const tB = `E2E idx B ${stamp}`
  await page.getByLabel('Title').fill(tA)
  const rowA = sidebarRow(page, tA)
  await expect(rowA).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })

  // Subpágina de A vía el "+" del row (navega a la subpágina nueva).
  const beforeChild = page.url()
  await rowA.getByRole('button', { name: 'Add subpage' }).click()
  await page.waitForURL(
    (url) => /\/docs\/[0-9a-f-]+/.test(url.pathname) && url.toString() !== beforeChild,
    { timeout: 15_000 },
  )
  await expect(page.getByLabel('Title')).toHaveValue('', { timeout: 15_000 })
  await page.getByLabel('Title').fill(tChild)
  await expect(page.locator('aside').getByRole('link', { name: tChild })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })
  await createRootDoc(page, tB)

  // Al índice. Los rows del test (el índice no tiene <aside>).
  await page.goto('/docs')
  const idxRow = (title: string) =>
    page.locator('li').filter({ has: page.getByRole('link', { name: title }) })
  const idxLink = (title: string) => page.getByRole('link', { name: title })
  await expect(idxLink(tA)).toBeVisible({ timeout: 15_000 })
  await expect(idxLink(tChild)).toBeVisible()

  // La subpágina viene indentada (depth 1 → paddingLeft 20px, raíz 0px).
  await expect(idxRow(tChild).locator('div').first()).toHaveCSS('padding-left', '20px')
  await expect(idxRow(tA).locator('div').first()).toHaveCSS('padding-left', '0px')

  // Colapsar A → la subpágina se oculta; expandir → vuelve.
  await idxRow(tA).getByRole('button', { name: 'Expand or collapse' }).click()
  await expect(idxLink(tChild)).toBeHidden()
  await idxRow(tA).getByRole('button', { name: 'Expand or collapse' }).click()
  await expect(idxLink(tChild)).toBeVisible()

  // Reordenar: B arriba de A → B, A. Persiste tras reload.
  // El link del índice incluye la fecha en otra línea → quedarse con el título.
  async function relativeOrder(): Promise<string[]> {
    const all = await page.locator('ul a[href^="/docs/"]').allInnerTexts()
    return all.map((t) => t.split('\n')[0].trim()).filter((t) => t.includes(`${stamp}`))
  }
  expect(await relativeOrder()).toEqual([tA, tChild, tB])
  await dragRow(page, idxRow(tB), idxRow(tA))
  await expect.poll(relativeOrder, { timeout: 10_000 }).toEqual([tB, tA, tChild])
  await page.reload()
  await expect(idxLink(tB)).toBeVisible({ timeout: 15_000 })
  expect(await relativeOrder()).toEqual([tB, tA, tChild])

  // Cleanup: borrar B y A (la subpágina cae en cascada con A).
  for (const title of [tB, tA]) {
    await idxLink(title).first().click()
    await expect(page.getByLabel('Title')).toHaveValue(title, { timeout: 15_000 })
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/docs(\?.*)?$/, { timeout: 15_000 })
  }
})
