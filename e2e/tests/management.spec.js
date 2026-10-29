import { expect, test } from '@playwright/test'
import { ADMIN, apiToken, faultNumber, settle, setupFixture, signIn } from './helpers'

// Management screens (2026-10-29 pass): machines, spare parts, users, and the first-response rule
// as a lead sees it on a fault.

test('machines: filter by status; a machine with faults offers no dead "delete", one without does', async ({ page, request }) => {
  const { headers, machine, worker } = await setupFixture(request)
  const workerToken = await apiToken(request, worker)
  await request.post('/api/kvarovi', { headers: { Authorization: `Bearer ${workerToken}` }, data: { oprema_id: machine.id, naslov: 'Ima kvar' } })
  const bare = await (await request.post('/api/oprema', { headers, data: { naziv: `Bez kvarova ${Date.now()}`, tip: 'Test', status: 'Na servisu' } })).json()

  await signIn(page, ADMIN)
  await page.goto('/admin/oprema')
  await settle(page)
  await page.getByRole('searchbox', { name: 'Pretraži' }).fill('E2E mašina')
  await expect(page.getByRole('button', { name: `Obriši mašinu: ${machine.naziv}` })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Pretraži' }).fill(bare.naziv)
  await expect(page.getByRole('button', { name: `Obriši mašinu: ${bare.naziv}` })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Pretraži' }).fill('')
  await page.getByRole('combobox', { name: 'Status' }).selectOption('Na servisu')
  await expect(page.locator('tbody tr', { hasText: bare.naziv })).toBeVisible()
  await expect(page.locator('tbody tr', { hasText: machine.naziv })).toHaveCount(0)
})

test('spare parts: a removed part can be found and returned to the catalogue', async ({ page, request }) => {
  const token = await apiToken(request, ADMIN)
  const headers = { Authorization: `Bearer ${token}` }
  const name = `Uklonjivi dio ${Date.now()}`
  const part = await (await request.post('/api/rezervni-dijelovi', { headers, data: { naziv: name, cijena: 3 } })).json()
  await request.delete(`/api/rezervni-dijelovi/${part.id}`, { headers })

  await signIn(page, ADMIN)
  await page.goto('/admin/rezervni-dijelovi')
  await settle(page)
  await page.getByRole('searchbox', { name: 'Pretraži' }).fill(name)
  await expect(page.getByText('Nijedan dio ne odgovara pretrazi')).toBeVisible()
  await page.getByLabel('Prikaži uklonjene').check()
  const row = page.locator('tbody tr', { hasText: name })
  await expect(row.getByText('Uklonjen')).toBeVisible()
  await row.getByRole('button', { name: `Vrati u katalog: ${name}` }).click()
  await expect(page.getByText('Dio je vraćen u katalog.')).toBeVisible()
  await page.getByLabel('Prikaži uklonjene').uncheck()
  await expect(page.locator('tbody tr', { hasText: name })).toBeVisible()

  // Editing the price says past use keeps its price.
  await page.getByRole('button', { name: `Uredi: ${name}` }).click()
  await expect(page.getByText('Već evidentirani utrošci zadržavaju cijenu iz trenutka utroška.')).toBeVisible()
})

test('users: search by name and filter by role', async ({ page, request }) => {
  const { worker } = await setupFixture(request)
  await signIn(page, ADMIN)
  await page.goto('/admin/korisnici')
  await settle(page)
  await page.getByRole('searchbox', { name: 'Pretraži' }).fill(worker.username)
  await expect(page.getByText('Rezultata: 1')).toBeVisible()
  await expect(page.locator('tbody').getByText(`@${worker.username}`)).toBeVisible()
  await page.getByRole('combobox', { name: 'Uloga' }).selectOption('admin')
  await expect(page.getByText('Nijedan korisnik ne odgovara pretrazi')).toBeVisible()
  await page.getByRole('button', { name: 'Očisti filtre' }).click()
  await expect(page.getByRole('searchbox', { name: 'Pretraži' })).toHaveValue('')
})

test('first response: a new fault counts down to a response; taking it records the response on time', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  const workerToken = await apiToken(request, worker)
  const fault = await (await request.post('/api/kvarovi', {
    headers: { Authorization: `Bearer ${workerToken}` },
    data: { oprema_id: machine.id, naslov: 'Čeka odziv', prioritet: 'Hitno' },
  })).json()

  await signIn(page, ADMIN)
  await page.goto(`/admin/kvarovi/${fault.id}`)
  await expect(page.getByText(/odziv za 1 h 5\d min|odziv za 2 h/).first()).toBeVisible()
  await expect(page.getByText('Čeka odziv').first()).toBeVisible()
  await page.getByRole('button', { name: 'Preuzmi kvar' }).click()
  await expect(page.getByText('Odziv u roku').first()).toBeVisible()
  await expect(page.getByText(/odziv za/)).toHaveCount(0)

  await page.goto(`/admin/kvarovi?q=${fault.id}`)
  await expect(page.locator('tbody tr', { hasText: faultNumber(fault.id) }).getByText('Odziv u roku')).toBeVisible()
})
