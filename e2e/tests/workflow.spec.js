import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { ADMIN, PHONE, apiToken, chooseMachine, faultNumber, setupFixture, signIn } from './helpers'

// A real 4×3 PNG: the server decodes and re-encodes every photo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGPUiFrAAANMDEgAhQMAKg4BKHNpEfAAAAAASUVORK5CYII=',
  'base64',
)

async function reportAs(request, worker, machine, data) {
  const token = await apiToken(request, worker)
  const response = await request.post('/api/kvarovi', {
    headers: { Authorization: `Bearer ${token}` },
    data: { oprema_id: machine.id, prioritet: 'Normalno', ...data },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

test('lead puts a fault on hold with a reason; the overview counts it and the worker sees why', async ({ page, request, browser }) => {
  const { machine, worker } = await setupFixture(request)
  const fault = await reportAs(request, worker, machine, { naslov: 'Ležaj škripi' })

  await signIn(page, ADMIN)
  await page.goto(`/admin/kvarovi/${fault.id}`)
  await page.getByRole('button', { name: 'Preuzmi kvar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Status: U rješavanju' })).toBeVisible()

  await page.getByRole('button', { name: 'Stavi na čekanje' }).click()
  const dialog = page.getByRole('dialog', { name: 'Zašto kvar čeka?' })
  await dialog.getByRole('button', { name: 'Stavi na čekanje' }).click()
  await expect(dialog.getByText('Odaberite razlog.')).toBeVisible()
  await dialog.getByLabel(/Rezervni dijelovi/).check()
  await dialog.getByRole('button', { name: 'Stavi na čekanje' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('complementary').getByText('Čeka: Rezervni dijelovi')).toBeVisible()
  await expect(page.getByText(/U rješavanju → Na čekanju \(Rezervni dijelovi\)/)).toBeVisible()

  // The overview figure leads to a list that contains this fault.
  await page.goto('/admin')
  await page.getByRole('navigation', { name: 'Ključni pokazatelji' }).getByRole('link', { name: /Na čekanju/ }).click()
  await expect(page).toHaveURL(/status=Na/)
  await expect(page.locator('tbody tr', { hasText: faultNumber(fault.id) })).toBeVisible()

  const phone = await (await browser.newContext({ viewport: PHONE })).newPage()
  await signIn(phone, worker)
  const card = phone.locator('a', { hasText: faultNumber(fault.id) })
  await expect(card.getByText('Ažurirano')).toBeVisible()
  await expect(card.getByText('Čeka: Rezervni dijelovi')).toBeVisible()
  await card.click()
  await phone.waitForURL(new RegExp(`/radnik/kvar/${fault.id}$`))
  await expect(phone.getByRole('heading', { name: 'Ležaj škripi' })).toBeVisible()
  await expect(phone.getByText('Čeka: Rezervni dijelovi')).toBeVisible()
  await phone.goto('/radnik')
  await expect(phone.locator('a', { hasText: faultNumber(fault.id) }).getByText('Ažurirano')).toHaveCount(0)
})

test('a save based on an outdated page is refused with a way to load the latest', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  const fault = await reportAs(request, worker, machine, { naslov: 'Remen klizi' })
  const admin = { Authorization: `Bearer ${await apiToken(request, ADMIN)}` }

  // Without live updates (e.g. a dropped connection) the server's version check still protects the save.
  await page.route('**/api/uzivo', (route) => route.abort())
  await signIn(page, ADMIN)
  await page.goto(`/admin/kvarovi/${fault.id}`)
  await expect(page.getByRole('button', { name: 'Preuzmi kvar' })).toBeVisible()

  // Someone else changes the fault while this page is open.
  const other = await request.put(`/api/kvarovi/${fault.id}`, { headers: admin, data: { prioritet: 'Hitno' } })
  expect(other.ok()).toBeTruthy()

  await page.getByLabel('Što je napravljeno').fill('Zategnut remen.')
  await page.getByRole('button', { name: 'Spremi promjene' }).click()
  const banner = page.getByRole('alert').filter({ hasText: 'Netko je u međuvremenu promijenio ovaj kvar.' })
  await expect(banner).toBeVisible()
  const saved = await (await request.get(`/api/kvarovi/${fault.id}`, { headers: admin })).json()
  expect(saved.sto_je_uradjeno).toBeNull()

  await banner.getByRole('button', { name: 'Učitaj najnovije' }).click()
  await expect(banner).toBeHidden()
  await expect(page.getByLabel('Prioritet')).toHaveValue('Hitno')
  await page.getByLabel('Što je napravljeno').fill('Zategnut remen.')
  await page.getByRole('button', { name: 'Spremi promjene' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Spremljeno' })).toBeVisible()
})

test('worker is told about open faults on the machine, can still report, and attaches a photo', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  await reportAs(request, { username: ADMIN.username, password: ADMIN.password }, machine, { naslov: 'Već poznat kvar' })

  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Prijavi kvar' }).click()
  await expect(page.getByRole('navigation', { name: 'Glavna navigacija' })).toBeHidden()
  await chooseMachine(page, machine.naziv)
  await expect(page.getByText('Na ovoj mašini već je prijavljeno otvorenih kvarova: 1')).toBeVisible()
  await expect(page.getByText('Već poznat kvar')).toBeVisible()

  await page.getByLabel('Dio mašine').selectOption({ label: 'Nož' })
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByLabel('Što se događa?').fill('Nož se zaglavljuje')
  await page.locator('input[type=file]').setInputFiles({ name: 'kvar.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'Odabrana fotografija 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()

  await page.getByRole('link', { name: 'Pogledaj kvar' }).click()
  await expect(page.getByRole('button', { name: /Otvori fotografiju/ })).toBeVisible()
  await page.getByRole('button', { name: /Otvori fotografiju/ }).click()
  await expect(page.getByRole('dialog').getByRole('img', { name: /Fotografija kvara/ })).toBeVisible()
})

test('overview says why a fault needs attention and opens it', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  const fault = await reportAs(request, worker, machine, { naslov: 'Nitko ga ne gleda', prioritet: 'Hitno' })

  await signIn(page, ADMIN)
  await page.goto('/admin')
  // The queue holds the most pressing few; on a shared test database others may outrank this one.
  const queue = page.getByRole('region', { name: 'Prioritetni kvarovi' })
  const first = queue.getByRole('row').nth(1)
  await expect(first.getByText(/Hitno|Normalno|Nisko/).first()).toBeVisible()
  await first.getByRole('link').click()
  await expect(page).toHaveURL(/\/admin\/kvarovi\/\d+$/)

  await page.goto(`/admin/kvarovi/${fault.id}`)
  await expect(page.getByText('Nitko nije preuzeo')).toBeVisible()
})

// A fake back camera that shows one QR image, for browsers driven by tests. BarcodeDetector is
// removed, as on iPhone, so the in-app JavaScript decoder is what reads it.
async function fakeCamera(page, fixture, { deny = false } = {}) {
  const png = `data:image/png;base64,${readFileSync(new URL(`../fixtures/${fixture}`, import.meta.url)).toString('base64')}`
  await page.addInitScript(({ png, deny }) => {
    delete window.BarcodeDetector
    navigator.mediaDevices.getUserMedia = async () => {
      if (deny) throw new DOMException('Permission denied', 'NotAllowedError')
      const image = new Image()
      image.src = png
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const context = canvas.getContext('2d')
      const draw = () => {
        context.fillStyle = '#777'
        context.fillRect(0, 0, 640, 480)
        context.drawImage(image, 170, 90, 300, 300)
      }
      draw()
      setInterval(draw, 100)
      return canvas.captureStream(10)
    }
  }, { png, deny })
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1'

test('iPhone: a worker scans a machine label inside the app and lands on the report with that machine', async ({ browser, request }) => {
  const { worker } = await setupFixture(request)
  const page = await (await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, userAgent: IPHONE_UA })).newPage()
  await fakeCamera(page, 'qr-machine-4242.png')
  await signIn(page, worker)
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Skeniraj' }).click()
  await expect(page).toHaveURL(/\/radnik\/prijava\?oprema=4242$/, { timeout: 10_000 })
})

test('a code that is not a machine label is named as such; camera refused offers the manual route', async ({ browser, request }) => {
  const { worker } = await setupFixture(request)
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, userAgent: IPHONE_UA })
  const page = await context.newPage()
  await fakeCamera(page, 'qr-foreign.png')
  await signIn(page, worker)
  await page.goto('/radnik/skeniraj')
  await expect(page.getByRole('status').filter({ hasText: 'Ovo nije QR oznaka mašine' })).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/radnik\/skeniraj$/)

  const denied = await context.newPage()
  await fakeCamera(denied, 'qr-foreign.png', { deny: true })
  await denied.goto('/radnik/skeniraj')
  await expect(denied.getByRole('alert')).toContainText('Pristup kameri nije dopušten')
  await denied.getByRole('link', { name: 'Ručno odaberi mašinu' }).click()
  await expect(denied).toHaveURL(/\/radnik\/prijava$/)
})

test('a lead scans a label from the phone header and gets that machine\'s faults', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, userAgent: IPHONE_UA })).newPage()
  await fakeCamera(page, 'qr-machine-4242.png')
  await signIn(page, ADMIN)
  await page.getByRole('link', { name: 'Skeniraj QR oznaku mašine' }).click()
  await expect(page).toHaveURL(/\/admin\/kvarovi\?oprema=4242$/, { timeout: 10_000 })
})

test('a report whose response is lost is not created twice when the worker sends it again', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  await page.goto('/radnik/prijava')
  await chooseMachine(page, machine.naziv)
  await page.getByLabel('Dio mašine').selectOption({ label: 'Nož' })
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByLabel('Što se događa?').fill('Izgubljen odgovor')
  await page.getByRole('button', { name: 'Dalje' }).click()

  // The first POST reaches the server, but the phone never sees the answer (dropped Wi-Fi).
  let dropped = false
  await page.route('**/api/kvarovi', async (route) => {
    if (route.request().method() === 'POST' && !dropped) {
      dropped = true
      await route.fetch()
      await route.abort('internetdisconnected')
      return
    }
    await route.continue()
  })
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()
  await expect(page.getByRole('heading', { name: 'Kvar je uspješno prijavljen' })).toBeVisible()

  const token = await apiToken(request, worker)
  const mine = await (await request.get('/api/kvarovi', { headers: { Authorization: `Bearer ${token}` } })).json()
  expect(mine.filter((fault) => fault.naslov === 'Izgubljen odgovor')).toHaveLength(1)
})
