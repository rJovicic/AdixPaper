import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { ADMIN, setupFixture, signIn } from './helpers'

async function axe(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return results.violations
    .filter((violation) => ['serious', 'critical'].includes(violation.impact))
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(', ')}`)
}

test('language switch translates and persists', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: 'Hrvatski' }).click()
  await expect(page.getByRole('heading', { name: 'Prijava' })).toBeVisible()
})

test('wrong password shows an actionable error', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Korisničko ime').fill('admin')
  await page.getByLabel('Lozinka', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Prijavi se' }).click()
  await expect(page.getByRole('alert')).toContainText('Pogrešno korisničko ime ili lozinka')
})

test('unknown routes show a not-found page', async ({ page }) => {
  await page.goto('/ovo-ne-postoji')
  await expect(page.getByRole('heading', { name: 'Stranica ne postoji' })).toBeVisible()
})

test('no serious accessibility violations on worker screens', async ({ page, request }) => {
  const { worker } = await setupFixture(request)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  expect(await axe(page), 'login').toEqual([])
  await signIn(page, worker)
  expect(await axe(page), 'my faults').toEqual([])
  await page.goto('/radnik/prijava')
  await page.getByLabel('Mašina', { exact: true }).waitFor()
  expect(await axe(page), 'report form').toEqual([])
})

test('no serious accessibility violations on lead screens', async ({ page }) => {
  await signIn(page, ADMIN)
  for (const path of ['/admin', '/admin/kvarovi', '/admin/oprema', '/admin/rezervni-dijelovi', '/admin/korisnici']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    expect(await axe(page), path).toEqual([])
  }
  await page.goto('/admin/kvarovi')
  await page.locator('tbody a').first().click()
  await page.getByRole('heading', { level: 1 }).waitFor()
  expect(await axe(page), 'fault detail').toEqual([])
})

test('no horizontal scrolling at phone, tablet and desktop widths', async ({ page }) => {
  await signIn(page, ADMIN)
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/admin', '/admin/kvarovi', '/admin/oprema', '/admin/rezervni-dijelovi', '/admin/korisnici']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
    }
  }
})
