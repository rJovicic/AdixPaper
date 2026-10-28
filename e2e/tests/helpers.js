import { expect } from '@playwright/test'

export const ADMIN = {
  username: process.env.E2E_ADMIN_USER || 'admin',
  password: process.env.E2E_ADMIN_PASSWORD || 'admin-pass-123',
}
export const PHONE = { width: 390, height: 844 }
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`

export async function apiToken(request, { username, password }) {
  const response = await request.post('/api/auth/login', { form: { username, password } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()).access_token
}

/** Creates an isolated machine (with one part) and a worker for a test. */
export async function setupFixture(request) {
  const token = await apiToken(request, ADMIN)
  const headers = { Authorization: `Bearer ${token}` }
  const id = stamp()
  const machine = await (await request.post('/api/oprema', { headers, data: { naziv: `E2E mašina ${id}`, tip: 'Test', lokacija: 'Hala E2E' } })).json()
  const component = await (await request.post(`/api/oprema/${machine.id}/komponente`, { headers, data: { naziv: 'Nož' } })).json()
  const worker = { username: `e2e.${id}`, password: 'e2e-pass-123' }
  const created = await request.post('/api/korisnici', {
    headers,
    data: { ...worker, ime: 'Iva', prezime: `Test ${id}`, rola: 'radnik' },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  return { headers, machine, component, worker }
}

export async function signIn(page, { username, password }) {
  await page.goto('/login')
  await page.getByLabel(/Korisničko ime|Username/).fill(username)
  await page.getByLabel(/^(Lozinka|Password)$/).fill(password)
  await page.getByRole('button', { name: /Prijavi se|Sign in/ }).click()
  await page.waitForURL(/\/(admin|radnik)/)
}

/** Matches a fault number as rendered ("#" for screen readers, zero-padded digits: #047). */
export const faultNumber = (id) => new RegExp(`#0*${id}(?!\\d)`)

/**
 * Waits until the screen has loaded its data. Not `networkidle`: the live-updates connection stays
 * open for as long as the page does, so the network is never idle.
 */
export async function settle(page) {
  await page.locator('main').first().waitFor()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
  await page.waitForTimeout(250)
}

/**
 * Opens where the signed-in person's language, password and sign-out live: the account menu at the
 * foot of the lead's rail on wide screens, the profile screen (avatar in the header) on phones.
 */
export async function openAccountMenu(page) {
  // The rail's account button is the one control that always names the panel it opens.
  const menu = page.locator('aside button[aria-expanded][aria-controls]:visible')
  if (await menu.count()) return menu.first().click()
  const tab = page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: /^(Profil|Više)$/ })
  if (await tab.isVisible()) return tab.click()
  // Full-screen forms hide the tab bar; the profile has its own address.
  await page.goto(new URL(page.url()).pathname.startsWith('/admin') ? '/admin/profil' : '/radnik/profil')
}

/** Chooses a machine on step 1 of the report (a list of large radio rows). */
export async function chooseMachine(page, name) {
  await page.locator('label').filter({ hasText: name }).first().click()
}

/**
 * Walks the three report steps and sends: machine (+ part), what is wrong, priority.
 * Leaves the page on the confirmation screen.
 */
export async function reportFault(page, { machine, component, headline, details, priority }) {
  if (machine) await chooseMachine(page, machine)
  if (component) await page.getByLabel('Dio mašine').selectOption({ label: component })
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByLabel('Što se događa?').fill(headline)
  if (details) await page.getByLabel('Detalji').fill(details)
  await page.getByRole('button', { name: 'Dalje' }).click()
  if (priority) await page.getByLabel(new RegExp(priority)).check()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()
  await expect(page.getByRole('heading', { name: 'Kvar je uspješno prijavljen' })).toBeVisible()
}
