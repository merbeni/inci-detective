import { expect } from '@playwright/test'

// A 10-token INCI list matching the manual plan's TC-05: one Annex II banned
// ingredient (Formaldehyde), several caution-level ones and one invented name
// that must fall back to "unknown -> caution".
export const QA_INCI_LIST =
  'Aqua, Glycerin, Niacinamide, Phenoxyethanol, Butylparaben, Retinol, ' +
  'Parfum, Formaldehyde, Cetearyl Alcohol, Blorptastic Extract'

// First-run onboarding: language -> name -> skin -> concerns (-> account).
// The account step only exists when the build has Supabase configured, so the
// helper handles both layouts.
export async function completeOnboarding(page, { name = 'QA Tester' } = {}) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/onboarding/)

  await page.getByRole('button', { name: 'Empezar' }).click()
  await page.getByPlaceholder('Tu nombre').fill(name)
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('button', { name: /Equilibrada/ }).click() // piel Normal
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('button', { name: 'Acné' }).click()

  const finish = page.getByRole('button', { name: 'Completar' })
  if (await finish.isVisible().catch(() => false)) {
    await finish.click() // build without cloud: onboarding ends here
  } else {
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('button', { name: 'Continuar como invitado' }).click()
  }
  await expect(page.getByText(`Hola ${name}`)).toBeVisible()
}

// Paste the QA list in Entrada manual and land on the /analysis/new preview.
export async function analyzeQaList(page) {
  await page.getByRole('button', { name: 'Ingresar código manualmente' }).click()
  await page.getByRole('tab', { name: 'Ingredientes' }).click()
  await page.locator('#manual-list').fill(QA_INCI_LIST)
  await page.getByRole('button', { name: 'Analizar ingredientes' }).click()
  await expect(page).toHaveURL(/\/analysis\/new/)
  await expect(page.getByText('Contiene alertas')).toBeVisible({ timeout: 15_000 })
}

// Minimal valid 1x1 red PNG for upload tests (profile photo).
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// Collect console errors + uncaught page errors for the whole test (TC-18).
export function watchConsole(page) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}
