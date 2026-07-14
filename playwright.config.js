import { defineConfig, devices } from '@playwright/test'

// E2E suite over the production build (`npm run build` first — the webServer
// below only serves dist/). Mirrors the manual test plan in
// docs/Plan-de-Pruebas-INCI-Detective.xlsx (TC-01..TC-18).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false, // specs share the preview server; state isolation is per-context
  retries: process.env.CI ? 2 : 0, // OBF searches can be slow/flaky in CI
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    // The app's target market: previous manual QA ran in Spanish (rioplatense).
    locale: 'es-AR',
    viewport: { width: 400, height: 760 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
