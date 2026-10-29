import { expect, test } from '@playwright/test'
import { ADMIN, PHONE, apiToken, faultNumber, openAccountMenu, reportFault, settle, setupFixture, signIn, chooseComponent } from './helpers'

// Real-time updates, new-fault alerts, the active/resolved split and the install prompt.
// Each test opens separate browser contexts (a lead at a desk, a worker on a phone), so nothing
// is shared but the server: if a change shows up, it came over the live connection.

async function put(request, headers, id, data) {
  const current = await (await request.get(`/api/kvarovi/${id}`, { headers })).json()
  const response = await request.put(`/api/kvarovi/${id}`, { headers, data: { ...data, verzija: current.verzija } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

test('a report from a phone appears on the lead\'s overview at once, with one alert, and status changes reach the worker', async ({ browser, request }) => {
  const { machine, worker, headers } = await setupFixture(request)

  const lead = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
  await signIn(lead, ADMIN)
  await lead.getByRole('heading', { name: 'Prioritetni kvarovi' }).waitFor()
  await expect(lead.getByText('U stvarnom vremenu', { exact: true })).toBeVisible()
  const bell = lead.locator('button[aria-label^="Novi kvarovi"]:visible')
  const unreadBefore = Number(((await bell.getAttribute('aria-label')).match(/(\d+)$/) || [0, 0])[1])
  const openFigure = lead.getByRole('navigation', { name: 'Ključni pokazatelji' }).getByRole('link', { name: /Otvoreni kvarovi/ }).locator('.numeral')
  await expect(openFigure).toHaveText(/^\d+$/)
  const openBefore = Number(await openFigure.textContent())
  const title = `Uživo prijava ${Date.now().toString(36)}`

  const phone = await (await browser.newContext({ viewport: PHONE, hasTouch: true })).newPage()
  await signIn(phone, worker)
  await phone.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Prijavi', exact: true }).click()
  await reportFault(phone, { machine: machine.naziv, component: 'Nož', headline: title })
  const id = Number((await phone.getByText(/^#\d+$/).textContent()).slice(1))

  // The lead never reloads: the toast, the bell, the counters and the lists update by themselves.
  const toast = lead.getByRole('status').filter({ hasText: `Novi kvar #${id}` })
  await expect(toast).toBeVisible()
  await expect(toast).toHaveCount(1)
  await expect(bell).toHaveAttribute('aria-label', `Novi kvarovi, nepročitano: ${unreadBefore + 1}`)
  const activity = lead.getByRole('region', { name: 'Aktivnost uživo' })
  const reported = activity.getByRole('link').filter({ hasText: faultNumber(id) })
  await expect(reported).toHaveCount(1)
  await expect(openFigure).toHaveText(String(openBefore + 1)) // the open count moved too

  // A resync (the tab came back from the background) must not announce it again or duplicate it.
  await lead.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await lead.waitForTimeout(800)
  await expect(lead.getByRole('status').filter({ hasText: `Novi kvar #${id}` })).toHaveCount(1)
  await expect(reported).toHaveCount(1)

  // The bell lists it; opening it marks it read.
  await bell.click()
  await lead.getByRole('region', { name: 'Nove prijave' }).getByRole('link', { name: new RegExp(title) }).click()
  await expect(lead).toHaveURL(new RegExp(`/admin/kvarovi/${id}$`))
  await expect(bell).toHaveAttribute('aria-label', unreadBefore ? `Novi kvarovi, nepročitano: ${unreadBefore}` : 'Novi kvarovi')

  // Someone else takes, holds and resolves it: the worker's phone follows without a reload.
  await phone.goto('/radnik/kvarovi') // from the confirmation screen; everything after this arrives live
  const card = phone.locator('a', { hasText: faultNumber(id) })
  await put(request, headers, id, { status: 'U rješavanju' })
  await expect(card.getByText('U rješavanju')).toBeVisible()
  await put(request, headers, id, { status: 'Na čekanju', razlog_cekanja: 'dijelovi' })
  await expect(card.getByText('Na čekanju')).toBeVisible()
  // The lead has this fault open; it follows too (nothing was being edited).
  await expect(lead.getByRole('complementary').getByText('Čeka: Rezervni dijelovi')).toBeVisible()
  await put(request, headers, id, { status: 'Riješeno', sto_je_uradjeno: 'Zamijenjen nož.' })
  await expect(card).toHaveCount(0) // left the open tab
  await phone.getByRole('tab', { name: /Riješeni/ }).click()
  await expect(phone.locator('a', { hasText: faultNumber(id) })).toBeVisible()
})

test('resolving removes a fault from the active list at once; it stays in Resolved, searchable and openable; reopening brings it back', async ({ page, request }) => {
  const { machine, worker, headers } = await setupFixture(request)
  const workerHeaders = { Authorization: `Bearer ${await apiToken(request, worker)}` }
  const title = `Arhiva E2E ${machine.id}`
  const fault = await (await request.post('/api/kvarovi', { headers: workerHeaders, data: { oprema_id: machine.id, naslov: title } })).json()

  await signIn(page, ADMIN)
  await page.goto(`/admin/kvarovi?q=${encodeURIComponent(title)}`)
  await settle(page)
  const activeTab = page.getByRole('tab', { name: /Aktivni/ })
  const resolvedTab = page.getByRole('tab', { name: /Riješeni/ })
  await expect(activeTab).toHaveAttribute('aria-selected', 'true')
  await expect(activeTab).toContainText('1')
  await expect(resolvedTab).toContainText('0')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await put(request, headers, fault.id, { status: 'Riješeno', sto_je_uradjeno: 'Podešeno.' })
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
  await expect(activeTab).toContainText('0')
  await expect(resolvedTab).toContainText('1')

  await resolvedTab.click()
  await expect(page).toHaveURL(/pregled=rijeseni/)
  await expect(page.getByRole('searchbox')).toHaveValue(title) // search carries over
  await page.getByRole('link', { name: title }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByText('Podešeno.')).toBeVisible()
  await expect(page.getByText(/Novo → Riješeno/)).toBeVisible() // the timeline is intact

  // A deep link to a resolved fault still works.
  await page.goto(`/admin/kvarovi/${fault.id}`)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  // Reopened elsewhere: back in the active list without a reload.
  await page.goto(`/admin/kvarovi?q=${encodeURIComponent(title)}`)
  await settle(page)
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
  await put(request, headers, fault.id, { status: 'U rješavanju' })
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Riješeni/ })).toContainText('0')
})

test('a change made elsewhere while a lead is editing keeps their edits and says so', async ({ page, request }) => {
  const { machine, worker, headers } = await setupFixture(request)
  const workerHeaders = { Authorization: `Bearer ${await apiToken(request, worker)}` }
  const fault = await (await request.post('/api/kvarovi', { headers: workerHeaders, data: { oprema_id: machine.id, naslov: 'Uređivanje uživo' } })).json()

  await signIn(page, ADMIN)
  await page.goto(`/admin/kvarovi/${fault.id}`)
  await expect(page.getByRole('button', { name: 'Preuzmi kvar' })).toBeVisible()
  await page.getByLabel('Što je napravljeno').fill('Moje bilješke')

  await put(request, headers, fault.id, { prioritet: 'Hitno' })
  const banner = page.getByRole('alert').filter({ hasText: 'Netko je u međuvremenu promijenio ovaj kvar.' })
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('nespremljene izmjene još su tu')
  await expect(page.getByLabel('Što je napravljeno')).toHaveValue('Moje bilješke')

  await banner.getByRole('button', { name: 'Učitaj najnovije' }).click()
  await expect(page.getByLabel('Prioritet', { exact: true })).toHaveValue('Hitno')
})

test('a worker never receives live events for another worker\'s fault', async ({ browser, request }) => {
  const first = await setupFixture(request)
  const second = await setupFixture(request)
  const phone = await (await browser.newContext({ viewport: PHONE })).newPage()
  const seen = []
  phone.on('response', async (response) => {
    if (response.url().includes('/api/kvarovi/') && response.request().method() === 'GET') seen.push(response.url())
  })
  await signIn(phone, first.worker)
  await phone.getByRole('heading', { name: 'Moji kvarovi' }).waitFor()
  await settle(phone)
  seen.length = 0

  const otherHeaders = { Authorization: `Bearer ${await apiToken(request, second.worker)}` }
  const other = await (await request.post('/api/kvarovi', { headers: otherHeaders, data: { oprema_id: second.machine.id, naslov: 'Tuđa prijava' } })).json()
  await put(request, first.headers, other.id, { status: 'U rješavanju' })
  await phone.waitForTimeout(1500)
  expect(seen.filter((url) => url.includes(`/api/kvarovi/${other.id}`))).toEqual([])
  await expect(phone.getByText('Tuđa prijava')).toHaveCount(0)
})

test('iPhone: a one-time install card explains Add to Home Screen; dismissed it stays away; the menu brings the steps back', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()
  await signIn(page, ADMIN)
  const card = page.getByRole('complementary', { name: 'Instalirajte Adix Paper' })
  await expect(card).toBeVisible({ timeout: 6000 })
  await card.getByRole('button', { name: 'Pokaži kako' }).click()
  const dialog = page.getByRole('dialog', { name: 'Instalirajte Adix Paper' })
  await expect(dialog.getByText(/Dodaj na početni zaslon/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Gotovo' }).click()
  await expect(card).toBeHidden()

  await page.reload()
  await page.waitForTimeout(3500)
  await expect(page.getByRole('complementary', { name: 'Instalirajte Adix Paper' })).toHaveCount(0)

  await openAccountMenu(page)
  await page.getByRole('button', { name: 'Instaliraj aplikaciju' }).click()
  await expect(page.getByRole('dialog', { name: 'Instalirajte Adix Paper' })).toBeVisible()
  await context.close()
})

test('Android: the card uses the browser\'s own install prompt', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  })
  const page = await context.newPage()
  await signIn(page, ADMIN)
  // Chrome fires this when the app is installable; headless Chromium does not, so the test does.
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt')
    event.prompt = () => { window.__installPrompted = true }
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(event)
  })
  const card = page.getByRole('complementary', { name: 'Instalirajte Adix Paper' })
  await expect(card).toBeVisible({ timeout: 6000 })
  await card.getByRole('button', { name: 'Instaliraj' }).click()
  await expect.poll(() => page.evaluate(() => window.__installPrompted === true)).toBe(true)
  await expect(card).toBeHidden()
  await context.close()
})

test('the web app manifest and icons are served for installation', async ({ request }) => {
  const manifest = await (await request.get('/manifest.json')).json()
  expect(manifest).toMatchObject({ display: 'standalone', start_url: expect.stringMatching(/^\//), scope: '/', theme_color: '#10265A' })
  const purposes = manifest.icons.map((icon) => icon.purpose)
  expect(purposes).toContain('maskable')
  for (const icon of [...manifest.icons.map((item) => item.src), '/apple-touch-icon.png']) {
    const response = await request.get(icon)
    expect(response.status(), icon).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
  }
  const sw = await request.get('/sw.js')
  expect(sw.status()).toBe(200)
})

test('the report form on a phone: no bars covering fields, clear progress, and no second report on a double tap', async ({ page, request }) => {
  const { machine, worker, headers } = await setupFixture(request)
  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  await page.goto(`/radnik/prijava?oprema=${machine.id}`)
  await expect(page.getByText('Skenirana mašina')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Glavna navigacija' })).toBeHidden()
  await chooseComponent(page, 'Nož')
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByLabel('Što se događa?').fill('Dvostruki dodir E2E')
  await page.getByRole('button', { name: 'Dalje' }).click()

  // Slow the server down so a second tap lands while the first is in flight.
  await page.route('**/api/kvarovi', async (route) => {
    if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, 800))
    await route.continue()
  })
  const submit = page.getByRole('button', { name: 'Pošalji prijavu' })
  await submit.click()
  await expect(page.getByRole('button', { name: /Slanje/ })).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Kvar je uspješno prijavljen' })).toBeVisible()
  const list = await (await request.get(`/api/kvarovi?oprema_id=${machine.id}&q=${encodeURIComponent('Dvostruki dodir E2E')}`, { headers })).json()
  expect(list).toHaveLength(1)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('the account menu stays reachable for sign-out while the install card shows', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()
  const { worker } = await setupFixture(page.request)
  await signIn(page, worker)
  await expect(page.getByRole('complementary', { name: 'Instalirajte Adix Paper' })).toBeVisible({ timeout: 6000 })
  await openAccountMenu(page)
  await expect(page.getByRole('button', { name: 'Odjava' })).toBeVisible()
  await context.close()
})

test('iPhone in Safari: the bell explains that notifications need the home-screen app and shows how', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()
  await signIn(page, ADMIN)
  await page.locator('button[aria-label^="Novi kvarovi"]:visible').click()
  const panel = page.getByRole('region', { name: 'Nove prijave' })
  await panel.getByRole('button', { name: /Obavijesti na iPhoneu/ }).click()
  await expect(page.getByRole('dialog', { name: 'Instalirajte Adix Paper' }).getByText(/Dodaj na početni zaslon/)).toBeVisible()
  await context.close()
})

test('back from the background after a while, the app opens a fresh live connection and re-reads', async ({ page, request }) => {
  const { worker } = await setupFixture(request)
  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  await settle(page)
  const streams = []
  page.on('request', (req) => { if (req.url().endsWith('/api/uzivo')) streams.push(req.url()) })
  // The phone locks: hidden for longer than the reconnect threshold (the clock is moved, not waited).
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    const now = Date.now
    Date.now = () => now() + 60_000
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => streams.length).toBeGreaterThan(0)
})

test('the icon family is served: rounded and full-bleed sizes, an SVG favicon, the iOS icon without transparency', async ({ request }) => {
  const manifest = await (await request.get('/manifest.json')).json()
  const sizes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']))
  expect(manifest.shortcuts).toBeUndefined() // shortcuts would offer every role the same actions
  const svg = await request.get('/favicon.svg')
  expect(svg.status()).toBe(200)
  expect(await svg.text()).toContain('<polygon')
  const apple = await (await request.get('/apple-touch-icon.png')).body()
  // PNG colour type byte (offset 25): 2 = RGB without alpha, which iOS needs to avoid a black ground.
  expect(apple[25]).toBe(2)
})

test('offline, every screen says the data may be behind; back online, the notice goes away', async ({ page, context, request }) => {
  const { worker } = await setupFixture(request)
  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  await page.goto('/radnik/kvarovi')
  await settle(page)
  const notice = page.getByText('Izvan mreže · prikazani su posljednji učitani podaci')
  await expect(notice).toHaveCount(0)
  await context.setOffline(true)
  await expect(notice).toBeVisible()
  await context.setOffline(false)
  await expect(notice).toHaveCount(0, { timeout: 15_000 })
})
