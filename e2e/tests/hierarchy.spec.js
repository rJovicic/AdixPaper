import { expect, test } from '@playwright/test'
import { ADMIN, PHONE, apiToken, settle, signIn } from './helpers'

// Machine → component → fault (2026-10-30): the admin's hierarchy, component QR labels, and the
// worker's report against a component or the whole machine.

const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`

async function line(request) {
  const headers = { Authorization: `Bearer ${await apiToken(request, ADMIN)}` }
  const id = stamp()
  const machine = await (await request.post('/api/oprema', { headers, data: { naziv: `LINIJA ${id}` } })).json()
  const odmotac = await (await request.post(`/api/oprema/${machine.id}/komponente`, { headers, data: { naziv: 'ODMOTAČ 2', model: 'BS 2602', proizvodac: 'PCMC' } })).json()
  const pakirka = await (await request.post(`/api/oprema/${machine.id}/komponente`, { headers, data: { naziv: 'STROJ ZA SKUPNO PAKIRANJE', model: 'ROLL BUNDLER FORZA', proizvodac: 'STAX TECHNOLOGIES' } })).json()
  const worker = { username: `hij.${id}`, password: 'e2e-pass-123' }
  await request.post('/api/korisnici', { headers, data: { ...worker, ime: 'Ana', prezime: `Hijerarhija ${id}`, rola: 'radnik' } })
  return { headers, machine, odmotac, pakirka, worker }
}

test('admin: a machine page lists its components, finds one by model, and its page holds the QR label', async ({ page, request }) => {
  const { machine } = await line(request)
  await signIn(page, ADMIN)
  await page.goto(`/admin/oprema/${machine.id}`)
  await settle(page)
  await expect(page.getByRole('heading', { name: machine.naziv, level: 1 })).toBeVisible()
  await expect(page.getByText('Komponenti: 2')).toBeVisible()

  // Add a component; identifiers may stay empty.
  await page.getByRole('button', { name: 'Dodaj komponentu' }).click()
  const dialog = page.getByRole('dialog', { name: 'Dodaj komponentu' })
  await dialog.getByLabel('Naziv komponente').fill('ODMOTAČ 3')
  await dialog.getByLabel('Model').fill('BS 2603')
  await dialog.getByLabel('Proizvođač').fill('PCMC')
  await dialog.getByRole('button', { name: 'Spremi' }).click()
  await expect(page.getByText('Komponenta je spremljena.')).toBeVisible()

  await page.getByRole('searchbox', { name: /Naziv, model/ }).fill('ROLL BUNDLER')
  const table = page.locator('table')
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await table.getByRole('link', { name: 'STROJ ZA SKUPNO PAKIRANJE' }).click()

  await expect(page.getByRole('heading', { name: 'STROJ ZA SKUPNO PAKIRANJE', level: 1 })).toBeVisible()
  await expect(page.getByText(`Komponenta · ${machine.naziv}`)).toBeVisible()
  await expect(page.getByText('Nije uneseno').first()).toBeVisible()
  await expect(page.getByRole('img', { name: 'QR kod oznake' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Preuzmi naljepnicu' }).click()
  expect((await download).suggestedFilename()).toBe('adix-paper-qr-komponenta.pdf')

  // The inventory number can be entered later.
  await page.getByRole('button', { name: 'Uredi' }).click()
  await page.getByRole('dialog').getByLabel('Inventurni broj').fill(`INV-${stamp()}`)
  await page.getByRole('dialog').getByRole('button', { name: 'Spremi' }).click()
  await expect(page.getByText(/^INV-/)).toBeVisible()
})

test('worker: a component label, scanned signed out, opens the report with that component and sends it', async ({ page, request }) => {
  const { machine, odmotac, worker } = await line(request)
  await page.setViewportSize(PHONE)
  await page.goto(`/q/${odmotac.qr_oznaka}`)
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel(/Korisničko ime/).fill(worker.username)
  await page.getByLabel(/^Lozinka$/).fill(worker.password)
  await page.getByRole('button', { name: /Prijavi se/ }).click()

  // Straight to the description, the target in view: machine → component, model · manufacturer.
  await expect(page.getByRole('heading', { name: /Opišite kvar/ })).toBeVisible()
  const target = page.getByRole('button', { name: new RegExp(`${machine.naziv}.*ODMOTAČ 2.*BS 2602 · PCMC`) })
  await expect(target).toBeVisible()
  await page.getByLabel('Što se događa?').fill('Papir puca na odmotaču')
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()
  await expect(page.getByRole('heading', { name: 'Kvar je uspješno prijavljen' })).toBeVisible()
  await expect(page.getByText('ODMOTAČ 2 · BS 2602')).toBeVisible()

  const token = await apiToken(request, worker)
  const [fault] = await (await request.get('/api/kvarovi', { headers: { Authorization: `Bearer ${token}` } })).json()
  expect(fault.komponenta.id).toBe(odmotac.id)
  await page.goto('/radnik/kvarovi')
  await expect(page.getByText('ODMOTAČ 2').first()).toBeVisible()
})

test('worker: a machine label offers "whole machine" by default and the components to choose from', async ({ page, request }) => {
  const { machine, pakirka, worker } = await line(request)
  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  await page.goto(`/q/${machine.qr_oznaka}`)
  await expect(page.getByText('Skenirana mašina')).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Cijela mašina/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: /^STROJ ZA SKUPNO PAKIRANJE/ })).not.toBeChecked()

  // Whole machine.
  await page.getByRole('button', { name: 'Dalje' }).click()
  await expect(page.getByRole('button', { name: new RegExp(`${machine.naziv}.*Cijela mašina`) })).toBeVisible()
  await page.getByLabel('Što se događa?').fill('Cijela linija stoji')
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()
  await expect(page.getByRole('heading', { name: 'Kvar je uspješno prijavljen' })).toBeVisible()

  // Then a component, from the same label.
  await page.goto(`/q/${machine.qr_oznaka}`)
  await page.getByRole('radiogroup', { name: 'Komponenta' }).locator('label').filter({ hasText: 'STROJ ZA SKUPNO PAKIRANJE' }).click()
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByLabel('Što se događa?').fill('Folija se kida')
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()
  await expect(page.getByRole('heading', { name: 'Kvar je uspješno prijavljen' })).toBeVisible()

  const token = await apiToken(request, worker)
  const faults = await (await request.get('/api/kvarovi', { headers: { Authorization: `Bearer ${token}` } })).json()
  expect(faults.map((fault) => fault.komponenta?.id ?? null).sort()).toEqual([pakirka.id, null].sort())
})

test('unknown and retired labels say so instead of starting a report that would fail', async ({ page, request }) => {
  const { headers, machine, odmotac, worker } = await line(request)
  await request.put(`/api/oprema/komponente/${odmotac.id}`, { headers, data: { aktivna: false } })
  await page.setViewportSize(PHONE)
  await signIn(page, worker)

  await page.goto('/q/nepostojeca-oznaka')
  await expect(page.getByRole('heading', { name: 'QR oznaka nije prepoznata' })).toBeVisible()

  await page.goto(`/q/${odmotac.qr_oznaka}`)
  await expect(page.getByRole('heading', { name: 'ODMOTAČ 2 više nije u upotrebi' })).toBeVisible()
  await page.getByRole('link', { name: `Prijavi kvar na mašini ${machine.naziv}` }).click()
  await expect(page.getByRole('radio', { name: /^Cijela mašina/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: /^ODMOTAČ 2/ })).toHaveCount(0)
})

test('lead: a component label opens the component; the fault list filters by component', async ({ page, request }) => {
  const { machine, odmotac, pakirka, worker } = await line(request)
  const workerHeaders = { Authorization: `Bearer ${await apiToken(request, worker)}` }
  await request.post('/api/kvarovi', { headers: workerHeaders, data: { oprema_id: machine.id, komponenta_id: odmotac.id, naslov: 'Na odmotaču' } })
  await request.post('/api/kvarovi', { headers: workerHeaders, data: { oprema_id: machine.id, naslov: 'Na cijeloj liniji' } })

  await signIn(page, ADMIN)
  await page.goto(`/q/${pakirka.qr_oznaka}`)
  await expect(page.getByRole('heading', { name: 'STROJ ZA SKUPNO PAKIRANJE', level: 1 })).toBeVisible()

  await page.goto(`/admin/kvarovi?oprema=${machine.id}`)
  await expect(page.getByText('Rezultata: 2')).toBeVisible()
  await page.getByLabel('Komponenta', { exact: true }).selectOption({ label: 'ODMOTAČ 2' })
  await expect(page.getByText('Rezultata: 1')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Na odmotaču' })).toBeVisible()
  await page.getByLabel('Komponenta', { exact: true }).selectOption({ label: 'Samo kvarovi na cijeloj mašini' })
  await expect(page.getByRole('link', { name: 'Na cijeloj liniji' })).toBeVisible()
  await expect(page.getByText('Rezultata: 1')).toBeVisible()
})

test('worker: after a component label, the machine label offers the whole machine again (no stale component)', async ({ page, request }) => {
  const { machine, odmotac, worker } = await line(request)
  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  await page.goto(`/q/${odmotac.qr_oznaka}`)
  await page.getByLabel('Što se događa?').fill('Započeto pa skenirana druga oznaka')
  await expect(page.getByRole('button', { name: /ODMOTAČ 2/ })).toBeVisible()

  await page.goto(`/q/${machine.qr_oznaka}`)
  await expect(page.getByRole('radio', { name: /^Cijela mašina/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: /^ODMOTAČ 2/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Dalje' }).click()
  await expect(page.getByLabel('Što se događa?')).toHaveValue('Započeto pa skenirana druga oznaka') // typed text kept
})
