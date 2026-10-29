import { expect, test } from '@playwright/test'
import { ADMIN, PHONE, apiToken, chooseMachine, settle, setupFixture, signIn } from './helpers'

// The redesigned shell and flows: the tab bar's "+", the stepped report, phone tabs on a fault, Profile.

test('phone tab bar: "+" opens the report; the steps go back and forth without losing what was typed', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  const nav = page.getByRole('navigation', { name: 'Glavna navigacija' })
  await expect(nav.getByRole('link')).toHaveText(['Početna', 'Kvarovi', 'Prijavi', 'Profil'])
  await nav.getByRole('link', { name: 'Prijavi', exact: true }).click()
  await expect(page).toHaveURL(/\/radnik\/prijava$/)
  await expect(nav).toBeHidden() // never above the keyboard

  const steps = page.getByRole('list', { name: 'Koraci prijave' })
  await expect(steps.locator('[aria-current="step"]')).toContainText('1')
  await chooseMachine(page, machine.naziv)
  await page.getByLabel('Dio mašine').selectOption({ label: 'Nož' })
  await page.getByRole('button', { name: 'Dalje' }).click()
  await expect(steps.locator('[aria-current="step"]')).toContainText('2')
  await expect(page.getByRole('heading', { name: /Opišite kvar/ })).toBeFocused()
  await page.getByLabel('Što se događa?').fill('Natrag i naprijed')
  await page.getByRole('button', { name: 'Prethodni korak' }).click()
  await expect(page.getByRole('radio', { name: new RegExp(machine.naziv) })).toBeChecked()
  await page.getByRole('button', { name: 'Dalje' }).click()
  await expect(page.getByLabel('Što se događa?')).toHaveValue('Natrag i naprijed')
  await page.getByRole('button', { name: 'Dalje' }).click()
  await expect(page.getByRole('radio', { name: /Normalno/ })).toBeChecked() // the default
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()

  await expect(page.getByRole('heading', { name: 'Kvar je uspješno prijavljen' })).toBeFocused()
  await page.getByRole('button', { name: 'Novi kvar' }).click()
  await expect(steps.locator('[aria-current="step"]')).toContainText('1')
  await expect(page.getByRole('radio', { name: new RegExp(machine.naziv) })).not.toBeChecked()
})

test('phone: a long machine list scrolls inside its box and never stretches the page', async ({ page, request }) => {
  const { headers, worker } = await setupFixture(request)
  // Enough machines that the list overflows its box (the e2e database grows with every run).
  for (let i = 0; i < 12; i++) {
    await request.post('/api/oprema', { headers, data: { naziv: `Duga lista ${Date.now()}-${i}`, tip: 'Test' } })
  }
  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  await page.goto('/radnik/prijava')
  await settle(page)
  const { page: pageHeight, viewport } = await page.evaluate(() => ({ page: document.documentElement.scrollHeight, viewport: innerHeight }))
  expect(pageHeight).toBeLessThan(viewport + 200)
})

test('a scanned machine with no parts starts on the description step', async ({ page, request }) => {
  const { headers, worker } = await setupFixture(request)
  const bare = await (await request.post('/api/oprema', { headers, data: { naziv: `Bez dijelova ${Date.now()}`, tip: 'Test', lokacija: 'Hala E2E' } })).json()
  await page.setViewportSize(PHONE)
  await signIn(page, worker)
  await page.goto(`/radnik/prijava?oprema=${bare.id}`)
  await expect(page.getByLabel('Što se događa?')).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(bare.naziv) })).toBeVisible() // the chosen machine, to change it
})

test('administrators manage faults but never report them: no action, no screen, no API', async ({ page, request }) => {
  const { machine } = await setupFixture(request)
  for (const viewport of [{ width: 1440, height: 900 }, PHONE]) {
    await page.setViewportSize(viewport)
    await signIn(page, ADMIN)
    await settle(page)
    await expect(page.getByRole('link', { name: /^(Prijavi kvar|Novi kvar|Prijavi)$/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^(Prijavi kvar|Novi kvar)$/ })).toHaveCount(0)
    await page.goto('/admin/kvarovi')
    await settle(page)
    await expect(page.getByRole('link', { name: /^(Prijavi kvar|Novi kvar|Prijavi)$/ })).toHaveCount(0)
    // Typed by hand: neither the old lead form nor the worker's form opens.
    await page.goto('/admin/prijava')
    await expect(page).toHaveURL(/\/admin$/)
    await page.goto('/radnik/prijava')
    await expect(page).toHaveURL(/\/admin$/)
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
  }
  const token = await apiToken(request, ADMIN)
  const refused = await request.post('/api/kvarovi', { headers: { Authorization: `Bearer ${token}` }, data: { oprema_id: machine.id, naslov: 'Admin ne prijavljuje' } })
  expect(refused.status()).toBe(403)
})

test('phone: a fault shows one section at a time under tabs; wide screens show them all', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  const token = await apiToken(request, worker)
  const fault = await (await request.post('/api/kvarovi', { headers: { Authorization: `Bearer ${token}` }, data: { oprema_id: machine.id, naslov: 'Kartice E2E' } })).json()
  await page.setViewportSize(PHONE)
  await signIn(page, ADMIN)
  await page.goto(`/admin/kvarovi/${fault.id}`)
  await settle(page)

  const tabs = page.getByRole('tablist', { name: 'Dijelovi kvara' })
  await expect(tabs.getByRole('tab')).toHaveText(['Detalji', 'Aktivnost', 'Fotografije', 'Radovi'])
  await expect(page.getByRole('button', { name: 'Preuzmi kvar' })).toBeVisible()
  await expect(page.getByLabel('Što je napravljeno')).toBeHidden()

  await tabs.getByRole('tab', { name: 'Radovi' }).click()
  await expect(page.getByLabel('Što je napravljeno')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preuzmi kvar' })).toBeHidden()
  await tabs.getByRole('tab', { name: 'Aktivnost' }).click()
  await expect(page.getByLabel('Komentar', { exact: true })).toBeVisible()
  await tabs.getByRole('tab', { name: 'Fotografije' }).click()
  await expect(page.getByRole('button', { name: /Dodaj fotografiju/ })).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(tabs).toBeHidden()
  await expect(page.getByRole('button', { name: 'Preuzmi kvar' })).toBeVisible()
  await expect(page.getByLabel('Što je napravljeno')).toBeVisible()
  await expect(page.getByLabel('Komentar', { exact: true })).toBeVisible()
})

test('Profile holds language, password and sign-out; leads also reach the screens not on the tab bar', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await signIn(page, ADMIN)
  await page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name: 'Više' }).click()
  await expect(page).toHaveURL(/\/admin\/profil$/)
  for (const name of ['Rezervni dijelovi', 'Analize', 'Korisnici']) await expect(page.getByRole('link', { name })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Promijeni lozinku' })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Profile and settings' })).toBeAttached()
  await page.getByRole('button', { name: 'Hrvatski' }).click()
  await page.getByRole('link', { name: 'Analize' }).click()
  await expect(page.getByRole('heading', { name: 'Analize' })).toBeVisible()
})
