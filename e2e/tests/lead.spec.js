import { expect, test } from '@playwright/test'
import { ADMIN, apiToken, setupFixture, signIn } from './helpers'

test('lead takes, records parts for, and resolves a fault; the worker sees the result', async ({ page, request, browser }) => {
  const { machine, component, worker } = await setupFixture(request)
  const workerToken = await apiToken(request, worker)
  const fault = await (await request.post('/api/kvarovi', {
    headers: { Authorization: `Bearer ${workerToken}` },
    data: { oprema_id: machine.id, komponenta_id: component.id, naslov: 'Curi zrak na ventilu', prioritet: 'Normalno' },
  })).json()

  await signIn(page, ADMIN)
  await page.goto(`/admin/kvarovi?q=${fault.id}`)
  await page.locator('tbody tr', { hasText: new RegExp(`#${fault.id}(?!\\d)`) }).getByRole('link', { name: 'Curi zrak na ventilu' }).click()
  await expect(page.getByRole('heading', { name: 'Curi zrak na ventilu' })).toBeVisible()

  await page.getByRole('button', { name: 'Preuzmi kvar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Status: U rješavanju' })).toBeVisible()

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
  await workerPage.locator('a', { hasText: new RegExp(`#${fault.id}(?!\\d)`) }).click()
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
