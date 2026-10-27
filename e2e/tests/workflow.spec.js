import { expect, test } from '@playwright/test'
import { ADMIN, PHONE, apiToken, faultNumber, setupFixture, signIn } from './helpers'

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
  await page.getByRole('link', { name: /Čekaju dijelove/ }).click()
  await expect(page).toHaveURL(/cekanje=dijelovi/)
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
  await page.getByLabel('Mašina', { exact: true }).selectOption(String(machine.id))
  await expect(page.getByText('Na ovoj mašini već je prijavljeno otvorenih kvarova: 1')).toBeVisible()
  await expect(page.getByText('Već poznat kvar')).toBeVisible()

  await page.getByLabel('Dio mašine').selectOption({ label: 'Nož' })
  await page.getByLabel('Što se događa?').fill('Nož se zaglavljuje')
  await page.locator('input[type=file]').setInputFiles({ name: 'kvar.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'Odabrana fotografija' })).toBeVisible()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()

  await page.waitForURL(/\/radnik$/)
  await page.locator('a', { hasText: 'Nož se zaglavljuje' }).click()
  await expect(page.getByRole('button', { name: /Otvori fotografiju/ })).toBeVisible()
  await page.getByRole('button', { name: /Otvori fotografiju/ }).click()
  await expect(page.getByRole('dialog').getByRole('img', { name: /Fotografija kvara/ })).toBeVisible()
})

test('overview says why a fault needs attention and drills into one person\'s work', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  const fault = await reportAs(request, worker, machine, { naslov: 'Nitko ga ne gleda', prioritet: 'Hitno' })

  await signIn(page, ADMIN)
  await page.goto('/admin')
  const row = page.locator('#attention-title').locator('xpath=ancestor::section').locator('li', { hasText: faultNumber(fault.id) })
  await expect(row.getByText('Nitko nije preuzeo')).toBeVisible()
  await expect(row.getByText('Hitno')).toBeVisible()

  await page.getByRole('link', { name: /Admin Adix · vi/ }).click()
  await expect(page).toHaveURL(/preuzeo=1/)
  await expect(page.getByLabel('Preuzeo')).toHaveValue('1')
})
