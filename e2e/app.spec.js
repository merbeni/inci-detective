// E2E suite mirroring the manual test plan (docs/Plan-de-Pruebas-INCI-Detective.xlsx,
// TC-01..TC-18). Each test starts on a fresh browser context (clean IndexedDB),
// so flows build their own state via the shared helpers.

import { test, expect } from '@playwright/test'
import {
  completeOnboarding,
  analyzeQaList,
  watchConsole,
  signInFakeUser,
  QA_INCI_LIST,
  TINY_PNG,
} from './helpers.js'

test.describe('Primer uso', () => {
  test('TC-01: sin perfil, / redirige a /onboarding', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByRole('button', { name: 'Empezar' })).toBeVisible()
  })

  test('TC-02/03: onboarding completo llega a un Home funcional', async ({ page }) => {
    await completeOnboarding(page)
    await expect(page.getByRole('button', { name: 'Escanear un producto' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ingresar código manualmente' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Buscar por producto o marca' })).toBeVisible()
    await expect(page.getByText('Todavía no hay escaneos')).toBeVisible()
    // Perfil persistido: recargar no vuelve a onboarding.
    await page.reload()
    await expect(page.getByText('Hola QA Tester')).toBeVisible()
  })

  test('TC-15: una ruta inexistente redirige a Home', async ({ page }) => {
    await completeOnboarding(page)
    await page.goto('/no-existe')
    await expect(page.getByRole('button', { name: 'Escanear un producto' })).toBeVisible()
  })
})

test.describe('Análisis manual', () => {
  test('TC-04: código de barras inválido bloquea con aviso', async ({ page }) => {
    await completeOnboarding(page)
    await page.getByRole('button', { name: 'Ingresar código manualmente' }).click()
    await page.locator('#manual-barcode').fill('123')
    await page.getByRole('button', { name: 'Buscar y analizar' }).click()
    await expect(page.locator('.toast')).toHaveText('Ingresá un código válido de 8 a 13 dígitos')
  })

  test('TC-05..TC-10 + TC-18: recorrido analizar → guardar → vigilar → historial → borrar', async ({
    page,
  }) => {
    const consoleErrors = watchConsole(page)
    await completeOnboarding(page)

    // TC-05 — semáforo y clasificación
    await analyzeQaList(page)
    const formol = page.locator('.ingcard', { hasText: 'Formaldehyde' })
    await expect(formol).toHaveClass(/ingcard--alert/)
    await expect(formol.getByText('Alerta')).toBeVisible()
    // H-01 (regresión): un prohibido jamás lleva leyenda tranquilizadora.
    await expect(formol.locator('.ingcard__context')).toHaveCount(0)
    // El inventado cae a Precaución por defecto, marcado como desconocido.
    const fake = page.locator('.ingcard', { hasText: 'Blorptastic' })
    await expect(fake).toHaveClass(/ingcard--caution/)
    await expect(fake.getByText('No está en el catálogo local', { exact: false })).toBeVisible()

    // TC-06 — guardar: deshabilitado sin nombre, habilitado con nombre
    const saveBtn = page.getByRole('button', { name: 'Guardar' })
    await expect(saveBtn).toBeDisabled()
    await page.locator('#analysis-name').fill('Crema QA Test')
    await page.locator('#analysis-brand').fill('MarcaTest')
    await saveBtn.click()
    await expect(page.locator('.toast')).toHaveText('Guardado en tu historial')
    await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]{36}/)

    // TC-07 — vigilar el primer ingrediente desde la tarjeta
    await page.locator('.ingcard__eye').first().click()
    await expect(page.locator('.toast')).toHaveText('Agregado a vigilados')

    // TC-08 — pantalla Vigilados: sugerencias, alta y baja
    await page.getByRole('link', { name: 'Vigilados' }).click()
    await expect(page.locator('.watchlist__chip')).toHaveCount(1)
    await page.getByPlaceholder('Buscá ingredientes a evitar').fill('parab')
    const sugg = page.locator('.watchlist__sugg').first()
    await expect(sugg).toContainText(/paraben/i)
    await sugg.click()
    await expect(page.locator('.watchlist__chip')).toHaveCount(2)
    await page.locator('.watchlist__chip').last().locator('button').click()
    await expect(page.locator('.watchlist__chip')).toHaveCount(1)

    // TC-09 — historial muestra el escaneo y abre el detalle
    await page.getByRole('link', { name: 'Historial' }).click()
    const item = page.locator('.history__item', { hasText: 'Crema QA Test' })
    await expect(item).toContainText('MarcaTest')
    await expect(item).toContainText('10 ingredientes')
    await expect(item).toContainText('Hoy')
    await item.locator('.history__main').click()
    await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]{36}/)

    // TC-10 — borrado en dos toques
    await page.locator('.analysis__del').click()
    await expect(page.locator('.analysis__del')).toHaveText('¿Borrar?')
    await page.locator('.analysis__del').click()
    await expect(page.locator('.toast')).toHaveText('Escaneo borrado')
    await expect(page).toHaveURL(/\/history/)
    await expect(page.getByText('Todavía no hay escaneos.')).toBeVisible()

    // TC-18 — consola limpia durante todo el recorrido
    expect(consoleErrors).toEqual([])
  })
})

test.describe('Contribución a Open Beauty Facts', () => {
  test('con sesión, guardar con la casilla activa envía el producto a /api/obf', async ({
    page,
  }) => {
    // La contribución a OBF ahora exige sesión (el Worker escribe con las
    // credenciales propias de la app). Simulamos usuario e interceptamos la red.
    await signInFakeUser(page)
    let obfPayload = null
    let obfAuth = null
    await page.route('**/api/obf', async (route) => {
      obfPayload = route.request().postDataJSON()
      obfAuth = route.request().headers()['authorization'] || null
      await route.fulfill({ json: { ok: true, status: 'saved' } })
    })

    await completeOnboarding(page)
    await page.getByRole('button', { name: 'Ingresar código manualmente' }).click()
    // Un código con formato válido que OBF no conoce: el flujo cae a la pestaña
    // de ingredientes conservando el código (el caso que habilita contribuir).
    await page.locator('#manual-barcode').fill('2099999999992')
    await page.getByRole('tab', { name: 'Ingredientes' }).click()
    await page.locator('#manual-list').fill(QA_INCI_LIST)
    await page.getByRole('button', { name: 'Analizar ingredientes' }).click()
    await expect(page).toHaveURL(/\/analysis\/new/)

    const checkbox = page.getByRole('checkbox')
    await expect(checkbox).toBeChecked() // opt-out, no opt-in
    await expect(page.getByText('Compartir en Open Beauty Facts')).toBeVisible()

    await page.locator('#analysis-name').fill('Crema QA OBF')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('.toast')).toHaveText(
      '¡Gracias! Producto enviado a Open Beauty Facts',
      { timeout: 10_000 },
    )
    expect(obfPayload).toMatchObject({
      code: '2099999999992',
      productName: 'Crema QA OBF',
      lang: 'es',
    })
    expect(obfPayload.ingredientsText).toContain('Formaldehyde')
    // SEC: el fix adjunta el JWT — el Worker rechaza escrituras anónimas.
    expect(obfAuth).toMatch(/^Bearer /)
  })

  test('SEC: sin sesión, la casilla de OBF no se ofrece aunque haya código', async ({ page }) => {
    // Regresión del hallazgo del pentest: un usuario anónimo no debe poder
    // disparar una escritura a OBF con las credenciales de la app.
    await completeOnboarding(page)
    await page.getByRole('button', { name: 'Ingresar código manualmente' }).click()
    await page.locator('#manual-barcode').fill('2099999999992')
    await page.getByRole('tab', { name: 'Ingredientes' }).click()
    await page.locator('#manual-list').fill(QA_INCI_LIST)
    await page.getByRole('button', { name: 'Analizar ingredientes' }).click()
    await expect(page).toHaveURL(/\/analysis\/new/)
    await expect(page.getByText('Compartir en Open Beauty Facts')).toHaveCount(0)
    await expect(page.getByRole('checkbox')).toHaveCount(0)
  })

  test('sin código de barras la casilla de OBF no se ofrece', async ({ page }) => {
    await signInFakeUser(page)
    await completeOnboarding(page)
    await analyzeQaList(page)
    await expect(page.getByText('Compartir en Open Beauty Facts')).toHaveCount(0)
  })
})

test.describe('Preferencias', () => {
  test('TC-11: modo oscuro aplica y persiste el tema', async ({ page }) => {
    await completeOnboarding(page)
    await page.getByRole('link', { name: 'Perfil' }).click()
    const html = page.locator('html')
    const toggle = page.getByRole('switch', { name: 'Modo oscuro' })
    await expect(html).toHaveAttribute('data-theme', 'light')
    await toggle.click()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await toggle.click()
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('foto de perfil: subir una imagen la guarda y la muestra', async ({ page }) => {
    await completeOnboarding(page)
    await page.getByRole('link', { name: 'Perfil' }).click()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    })
    await expect(page.locator('.toast')).toHaveText('Foto de perfil actualizada')
    await expect(page.locator('.profile__avatar img')).toBeVisible()
    // Persistida en IndexedDB: sobrevive una recarga.
    await page.reload()
    await expect(page.locator('.profile__avatar img')).toBeVisible()
  })

  test('TC-12: cambio de idioma en caliente ES ↔ EN', async ({ page }) => {
    await completeOnboarding(page)
    await page.getByRole('link', { name: 'Perfil' }).click()
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.getByText('Preferences')).toBeVisible()
    await page.getByRole('button', { name: 'Español' }).click()
    await expect(page.getByText('Preferencias')).toBeVisible()
  })
})

test.describe('Cuentas y compartidos', () => {
  test('TC-13: login con credenciales inválidas muestra error claro', async ({ page }) => {
    await completeOnboarding(page)
    await page.goto('/auth')
    await page.getByPlaceholder('Email').fill('qa-no-existe@example.com')
    await page.getByPlaceholder('Contraseña').fill('incorrecta123')
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    const toast = page.locator('.toast')
    await expect(toast).toBeVisible({ timeout: 15_000 })
    const text = await toast.textContent()
    // Con Supabase configurado el mensaje es el traducido (regresión H-03);
    // en un build sin cloud el flujo degrada a un aviso genérico.
    if (!/cloud-disabled/.test(text)) {
      expect(text).toBe('Email o contraseña incorrectos')
    }
  })

  test('olvidé mi contraseña: el enlace existe y sin email pide completarlo', async ({ page }) => {
    await completeOnboarding(page)
    await page.goto('/auth')
    const forgot = page.getByRole('button', { name: '¿Olvidaste tu contraseña?' })
    await expect(forgot).toBeVisible()
    await forgot.click()
    await expect(page.locator('.toast')).toHaveText('Escribí tu email arriba y volvé a tocar')
  })

  test('/auth/reset sin sesión de recuperación degrada a "pedir enlace nuevo"', async ({
    page,
  }) => {
    await page.goto('/auth/reset')
    await expect(page.getByText('El enlace expiró o no es válido', { exact: false })).toBeVisible({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: 'Ir a iniciar sesión' }).click()
    await expect(page).toHaveURL(/\/auth$/)
  })

  test('TC-14: /share con id inexistente muestra aviso y CTA', async ({ page }) => {
    await page.goto('/share/idinexistente123')
    await expect(page.getByText('Este análisis compartido no está disponible.')).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: 'Abrir INCI Detective' })).toBeVisible()
  })
})

test.describe('Captura', () => {
  test('TC-17: /scan sin cámara ofrece los dos fallbacks', async ({ page }) => {
    await completeOnboarding(page)
    await page.goto('/scan')
    await expect(page.getByRole('button', { name: 'Leer etiqueta' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ingresar manualmente' })).toBeVisible()
  })

  test('TC-16: búsqueda por texto en OBF genera un análisis', async ({ page }) => {
    test.slow() // red externa (Open Beauty Facts)
    await completeOnboarding(page)
    await page.getByRole('button', { name: 'Buscar por producto o marca' }).click()
    await page.getByPlaceholder(/Producto o marca/).fill('nivea creme')
    const withIngredients = page
      .locator('.search__item', { has: page.getByText('Con ingredientes') })
      .first()
    await expect(withIngredients).toBeVisible({ timeout: 30_000 })
    await withIngredients.click()
    await expect(page).toHaveURL(/\/analysis\/new/, { timeout: 30_000 })
    await expect(page.locator('.ingcard').first()).toBeVisible({ timeout: 15_000 })
  })
})

// Referencia compartida para mantener la lista sincronizada con el Excel.
test('la lista QA tiene los 10 ingredientes del plan', () => {
  expect(QA_INCI_LIST.split(',')).toHaveLength(10)
})
