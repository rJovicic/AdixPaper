import { expect, test } from '@playwright/test'
import { ADMIN, apiToken, faultNumber, setupFixture, signIn } from './helpers'

test('lead takes, records parts for, and resolves a fault; the worker sees the result', async ({ page, request, browser }) => {
  const { machine, component, worker } = await setupFixture(request)
  const workerToken = await apiToken(request, worker)
  const fault = await (await request.post('/api/kvarovi', {
    headers: { Authorization: `Bearer ${workerToken}` },
    data: { oprema_id: machine.id, komponenta_id: component.id, naslov: 'Curi zrak na ventilu', prioritet: 'Normalno' },
  })).json()

  await signIn(page, ADMIN)
  await page.goto(`/admin/kvarovi?q=${fault.id}`)
  await page.locator('tbody tr', { hasText: faultNumber(fault.id) }).getByRole('link', { name: 'Curi zrak na ventilu' }).click()
  await expect(page.getByRole('heading', { name: 'Curi zrak na ventilu' })).toBeVisible()

  await page.getByRole('button', { name: 'Preuzmi kvar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Status: U rješavanju' })).toBeVisible()
  // Taking a fault makes the lead its owner (the form used to send "unassigned" and undo it).
  await expect(page.locator('dl').getByText('Admin Adix')).toBeVisible()

  // Resolving needs a description of the work done.
  await page.getByRole('button', { name: 'Označi riješenim' }).click()
  await expect(page.getByText('Prije zatvaranja upišite što je napravljeno.')).toBeVisible()
  await expect(page.getByLabel('Što je napravljeno')).toBeFocused()

  await page.getByLabel('Što je napravljeno').fill('Zamijenjena brtva ventila.')
  await page.getByLabel('Zastoj (min)').fill('40')
  await page.getByRole('button', { name: 'Dodaj dio' }).click()
  const picker = page.getByRole('combobox', { name: /Utrošeni rezervni dijelovi 1/ })
  await picker.fill('Relej')
  await page.getByRole('listbox').getByRole('option').first().click()
  await page.getByRole('button', { name: 'Spremi promjene' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Spremljeno' })).toBeVisible()

  await page.getByRole('button', { name: 'Označi riješenim' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Status: Riješeno' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ponovno otvori' })).toBeVisible()
  await expect(page.getByText('Ažurirani rezervni dijelovi')).toBeVisible()

  const workerPage = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await signIn(workerPage, worker)
  await workerPage.getByRole('tab', { name: /Riješeni/ }).click()
  await workerPage.locator('a', { hasText: faultNumber(fault.id) }).click()
  await expect(workerPage.getByText('Zamijenjena brtva ventila.')).toBeVisible()
})

test('machine form keeps focus while typing and saves', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/admin/oprema')
  await page.getByRole('button', { name: 'Dodaj mašinu' }).click()
  const name = page.getByLabel('Naziv')
  await name.click()
  await page.keyboard.type('Rezačica E2E', { delay: 20 })
  await expect(name).toHaveValue('Rezačica E2E')
  await page.getByLabel('Tip').fill('Rezačica')
  await page.getByRole('button', { name: 'Spremi', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Mašina je spremljena.' })).toBeVisible()
  // New machine stays open for adding parts.
  await expect(page.getByRole('heading', { name: 'Dijelovi mašine' })).toBeVisible()
})

test('admin cannot deactivate their own account', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/admin/korisnici')
  const own = page.getByRole('button', { name: /Deaktiviraj: Admin/ }).first()
  await expect(own).toBeDisabled()
})

test('dashboard figures link to filtered fault lists', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.getByRole('link', { name: /Hitni/ }).click()
  await expect(page).toHaveURL(/status=otvoreni&prioritet=Hitno/)
  await expect(page.getByLabel('Prioritet')).toHaveValue('Hitno')
})

test('lead opens a machine\'s faults from the machine list and filters by assignee', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  const adminHeaders = { Authorization: `Bearer ${await apiToken(request, ADMIN)}` }
  const workerHeaders = { Authorization: `Bearer ${await apiToken(request, worker)}` }
  const mine = await (await request.post('/api/kvarovi', { headers: workerHeaders, data: { oprema_id: machine.id, naslov: 'Moj kvar E2E' } })).json()
  await request.post('/api/kvarovi', { headers: workerHeaders, data: { oprema_id: machine.id, naslov: 'Tuđi kvar E2E' } })
  await request.put(`/api/kvarovi/${mine.id}`, { headers: adminHeaders, data: { status: 'U rješavanju' } })

  await signIn(page, ADMIN)
  await page.goto('/admin/oprema')
  await page.getByRole('searchbox').fill(machine.naziv)
  await page.getByRole('link', { name: `Kvarovi mašine ${machine.naziv}: 2` }).click()
  await expect(page).toHaveURL(new RegExp(`oprema=${machine.id}`))
  await expect(page.getByText(`Mašina: ${machine.naziv}`)).toBeVisible()
  await expect(page.getByText('Rezultata: 2')).toBeVisible()

  await page.getByLabel('Preuzeo').selectOption({ label: 'Moji kvarovi' })
  await expect(page.getByText('Rezultata: 1')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Moj kvar E2E' })).toBeVisible()
  await page.getByLabel('Preuzeo').selectOption({ label: 'Nepreuzeti' })
  await expect(page.getByRole('link', { name: 'Tuđi kvar E2E' })).toBeVisible()

  await page.getByRole('button', { name: 'Ukloni filtar mašine' }).click()
  await expect(page).not.toHaveURL(/oprema=/)
})

test('lead finds a fault by number and a machine by name with Ctrl K', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  const workerHeaders = { Authorization: `Bearer ${await apiToken(request, worker)}` }
  const fault = await (await request.post('/api/kvarovi', { headers: workerHeaders, data: { oprema_id: machine.id, naslov: 'Remen klizi E2E' } })).json()

  await signIn(page, ADMIN)
  await page.getByRole('button', { name: /Traži/ }).waitFor() // the lead shell is lazy-loaded
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox', { name: 'Pretraživanje' })
  await expect(search).toBeFocused()
  await search.fill(String(fault.id))
  await expect(page.getByRole('option').first()).toContainText('Remen klizi E2E')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/admin/kvarovi/${fault.id}$`))
  await expect(page.getByRole('heading', { name: 'Remen klizi E2E' })).toBeVisible()

  await page.getByRole('button', { name: /Traži/ }).click()
  await search.fill(machine.naziv)
  await page.getByRole('option', { name: new RegExp(machine.naziv) }).last().click()
  await expect(page).toHaveURL(new RegExp(`oprema=${machine.id}`))
})

test('overview "Mine" tab lists only the lead\'s own faults', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  const adminHeaders = { Authorization: `Bearer ${await apiToken(request, ADMIN)}` }
  const workerHeaders = { Authorization: `Bearer ${await apiToken(request, worker)}` }
  const title = `Preuzet E2E ${machine.id}`
  const mine = await (await request.post('/api/kvarovi', { headers: workerHeaders, data: { oprema_id: machine.id, naslov: title, prioritet: 'Hitno' } })).json()
  await request.put(`/api/kvarovi/${mine.id}`, { headers: adminHeaders, data: { status: 'U rješavanju' } })

  await signIn(page, ADMIN)
  await page.getByRole('button', { name: /^Moji/ }).click()
  await expect(page.getByRole('button', { name: /^Moji/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Zahtijeva pažnju' }).getByText(title)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Moji kvarovi' }).getByText(title)).toBeVisible()
})
