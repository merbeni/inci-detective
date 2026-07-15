// Prueba de la afirmación central del diseño: la app es offline-first.
// Tras una primera visita con red (que instala el SW y cachea el dataset en
// IndexedDB), se corta la red, se recarga la página y el flujo completo de
// análisis debe seguir funcionando en el dispositivo.

import { test, expect } from '@playwright/test'
import { completeOnboarding, analyzeQaList } from './helpers.js'

test('offline: tras la primera carga, la app funciona sin red', async ({ page, context }) => {
  // Primera visita online: onboarding + un análisis (calienta dataset -> IndexedDB).
  await completeOnboarding(page)
  await analyzeQaList(page)

  // Esperar a que el Service Worker esté activo y controlando la página.
  await page.goto('/')
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
      )
    }
    return Boolean(reg.active)
  })

  // Red cortada: recarga completa servida por el SW, análisis 100% local.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Hola QA Tester')).toBeVisible()
  await analyzeQaList(page)
  const formol = page.locator('.ingcard', { hasText: 'Formaldehyde' })
  await expect(formol).toHaveClass(/ingcard--alert/)
  await context.setOffline(false)
})
