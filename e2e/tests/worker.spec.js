import { expect, test } from '@playwright/test'
import { ADMIN, PHONE, chooseMachine, openAccountMenu, reportFault, setupFixture, signIn, chooseComponent } from './helpers'

test.use({ viewport: PHONE })

test('worker reports a fault on a phone and can follow it', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  await signIn(page, worker)
  await expect(page.getByRole('heading', { name: 'Moji kvarovi' })).toBeVisible()

  await page.getByRole('main').getByRole('link', { name: /Prijavi kvar|Ili odaberite mašinu ručno/ }).click()
  await expect(page.getByRole('list', { name: 'Koraci prijave' })).toBeVisible()
  await page.getByRole('button', { name: 'Dalje' }).click()
  // Validation: field-level message and focus on the first invalid field.
  await expect(page.getByRole('radio').first()).toBeFocused()
  await expect(page.getByText('Obavezno polje.').first()).toBeVisible()

  await chooseMachine(page, machine.naziv)
  // A component is optional: the whole machine is the default, the machine's components are offered.
  await expect(page.getByRole('radio', { name: /^Cijela mašina/ })).toBeChecked()
  await chooseComponent(page, 'Nož')
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByRole('button', { name: 'Dalje' }).click()
  await expect(page.getByLabel('Što se događa?')).toBeFocused()
  await page.getByLabel('Što se događa?').fill('Nož ne reže do kraja')
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByLabel(/Hitno/).check()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()

  await expect(page.getByRole('heading', { name: 'Kvar je uspješno prijavljen' })).toBeVisible()
  await expect(page.getByText(machine.naziv)).toBeVisible()
  await page.goto('/radnik')
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
  await openAccountMenu(page)
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
  await expect(page.getByRole('button', { name: 'Promijeni lozinku' })).toBeVisible()
  expect((await request.post('/api/auth/login', { form: worker })).status()).toBe(401)
  expect((await request.post('/api/auth/login', { form: { ...worker, password: 'nova-lozinka-42' } })).ok()).toBeTruthy()
})

test('after an expired session, signing in returns to the same screen', async ({ page, request }) => {
  const { worker } = await setupFixture(request)
  await signIn(page, worker)
  // Swap the token as the next page starts, before any app code runs: changed from the running page,
  // a profile refresh still in flight from sign-in could write the valid token back first.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e.expired')) return
    sessionStorage.setItem('e2e.expired', '1')
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

test('scanning a machine QR label opens the report with that machine chosen, even when signed out', async ({ page, request }) => {
  const { machine, worker } = await setupFixture(request)
  await page.goto(`/m/${machine.id}`)
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel(/Korisničko ime|Username/).fill(worker.username)
  await page.getByLabel(/^(Lozinka|Password)$/).fill(worker.password)
  await page.getByRole('button', { name: /Prijavi se|Sign in/ }).click()

  await expect(page).toHaveURL(new RegExp(`/radnik/prijava\\?oprema=${machine.id}$`))
  await expect(page.getByText('Skenirana mašina')).toBeVisible()
  await expect(page.getByText(machine.naziv, { exact: true })).toBeVisible()

  // A half-written report, and the step it is on, survive a reload.
  await chooseComponent(page, 'Nož')
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByLabel('Što se događa?').fill('Remen proklizava')
  await page.reload()
  await expect(page.getByLabel('Što se događa?')).toHaveValue('Remen proklizava')
  await expect(page.getByRole('button', { name: new RegExp(`${machine.naziv}.*Nož`) })).toBeVisible()

  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByRole('button', { name: 'Pošalji prijavu' }).click()
  await expect(page.getByRole('heading', { name: 'Kvar je uspješno prijavljen' })).toBeVisible()
  await page.goto('/radnik')
  await expect(page.getByRole('link', { name: /Remen proklizava/ })).toContainText(machine.naziv)
  // The draft is gone after sending.
  await page.goto('/radnik/prijava')
  await expect(page.getByRole('radio', { name: new RegExp(machine.naziv) })).not.toBeChecked()
})

test('a lead scanning a machine QR label sees that machine\'s faults', async ({ page, request }) => {
  const { machine } = await setupFixture(request)
  await signIn(page, ADMIN)
  await page.goto(`/m/${machine.id}`)
  await expect(page).toHaveURL(new RegExp(`/admin/kvarovi\\?oprema=${machine.id}$`))
  await expect(page.getByText(`Mašina: ${machine.naziv}`)).toBeVisible()
})

test('worker signs out from the account menu', async ({ page, request }) => {
  const { worker } = await setupFixture(request)
  await signIn(page, worker)
  await openAccountMenu(page)
  await page.getByRole('button', { name: 'Odjava' }).click()
  await expect(page).toHaveURL(/\/login\?reason=signedOut/)
})
