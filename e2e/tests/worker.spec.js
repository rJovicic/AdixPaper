import { expect, test } from '@playwright/test'
import { PHONE, setupFixture, signIn } from './helpers'

test.use({ viewport: PHONE })

test('worker reports a fault on a phone and can follow it', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  await signIn(page, worker)
  await expect(page.getByRole('heading', { name: 'Moji kvarovi' })).toBeVisible()

  await page.getByRole('link', { name: 'Prijavi kvar' }).click()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()
  // Validation: field-level message and focus on the first invalid field.
  await expect(page.getByLabel('Mašina', { exact: true })).toBeFocused()
  await expect(page.getByText('Obavezno polje.').first()).toBeVisible()

  await page.getByLabel('Mašina', { exact: true }).selectOption({ label: `${machine.naziv} — Hala E2E` })
  await page.getByLabel('Dio mašine').selectOption({ label: 'Nož' })
  await page.getByLabel('Što se događa?').fill('Nož ne reže do kraja')
  await page.getByLabel(/Hitno/).check()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()

  await expect(page.getByRole('status').filter({ hasText: /je prijavljen/ })).toBeVisible()
  await expect(page).toHaveURL(/\/radnik$/)
  const card = page.getByRole('link', { name: /Nož ne reže do kraja/ })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Hitno')

  await card.click()
  await expect(page.getByRole('heading', { name: 'Nož ne reže do kraja' })).toBeVisible()
  await expect(page.getByText('Čeka preuzimanje')).toBeVisible()
  await page.getByLabel('Komentar', { exact: true }).fill('Stroj je zaustavljen.')
  await page.getByRole('button', { name: 'Dodaj komentar' }).click()
  await expect(page.getByText('Stroj je zaustavljen.')).toBeVisible()
})

test('opening the app root keeps the worker signed in', async ({ page, request }) => {
  const { worker } = await setupFixture(request)
  await signIn(page, worker)
  await page.goto('/')
  await expect(page).toHaveURL(/\/radnik$/)
  await page.goto('/login')
  await expect(page).toHaveURL(/\/radnik$/)
})

test('worker cannot open lead screens', async ({ page, request }) => {
  const { worker } = await setupFixture(request)
  await signIn(page, worker)
  await page.goto('/admin/kvarovi')
  await expect(page).toHaveURL(/\/radnik$/)
})

test('worker changes their own password; the old one stops working', async ({ page, request }) => {
  const { worker } = await setupFixture(request)
  await signIn(page, worker)
  await page.getByRole('button', { name: 'Promijeni lozinku' }).click()
  const dialog = page.getByRole('dialog', { name: 'Promijeni lozinku' })
  await dialog.getByLabel('Trenutna lozinka').fill(worker.password)
  await dialog.getByLabel('Nova lozinka', { exact: true }).fill('nova-lozinka-42')
  await dialog.getByLabel('Ponovite novu lozinku').fill('nova-lozinka-43')
  await dialog.getByRole('button', { name: 'Promijeni lozinku' }).click()
  await expect(dialog.getByText('Lozinke se ne podudaraju.')).toBeVisible()
  await dialog.getByLabel('Ponovite novu lozinku').fill('nova-lozinka-42')
  await dialog.getByRole('button', { name: 'Promijeni lozinku' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Lozinka je promijenjena.' })).toBeVisible()

  // This device stays signed in with the new token.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Moji kvarovi' })).toBeVisible()
  expect((await request.post('/api/auth/login', { form: worker })).status()).toBe(401)
  expect((await request.post('/api/auth/login', { form: { ...worker, password: 'nova-lozinka-42' } })).ok()).toBeTruthy()
})

test('after an expired session, signing in returns to the same screen', async ({ page, request }) => {
  const { worker } = await setupFixture(request)
  await signIn(page, worker)
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('adix.session'))
    localStorage.setItem('adix.session', JSON.stringify({ ...session, token: 'expired-token' }))
  })
  await page.goto('/radnik/prijava')
  await expect(page).toHaveURL(/\/login\?reason=expired/)
  await expect(page.getByText('Sesija je istekla. Prijavite se ponovno.')).toBeVisible()
  await page.getByLabel(/Korisničko ime|Username/).fill(worker.username)
  await page.getByLabel(/^(Lozinka|Password)$/).fill(worker.password)
  await page.getByRole('button', { name: /Prijavi se|Sign in/ }).click()
  await expect(page).toHaveURL(/\/radnik\/prijava$/)
})
