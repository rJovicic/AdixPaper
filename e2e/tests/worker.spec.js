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
