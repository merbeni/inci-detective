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

// Simulate a signed-in Supabase user WITHOUT a real login: seed a persisted
// session and stub the auth/REST endpoints. Enough for `user` to be truthy and
// for authHeaders() to attach a token — the Worker call itself is intercepted
// per-test. Must be called before the app first navigates.
export async function signInFakeUser(page, { id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', email = 'qa@example.com' } = {}) {
  const ref = 'shmdzlffwjhxcrhtkpfd'
  const user = { id, email, aud: 'authenticated', role: 'authenticated' }
  const session = {
    access_token: 'fake.jwt.token',
    refresh_token: 'fake-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  }
  await page.route('**/auth/v1/user**', (route) => route.fulfill({ json: user }))
  await page.route('**/auth/v1/token**', (route) => route.fulfill({ json: session }))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [`sb-${ref}-auth-token`, JSON.stringify(session)],
  )
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
