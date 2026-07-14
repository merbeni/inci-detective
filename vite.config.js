import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Offline-first PWA configuration.
// - CacheFirst for static assets (app shell + WASM + dataset)
// - StaleWhileRevalidate for Open Beauty Facts
// - NetworkFirst for the Gemini AI proxy
// Local dev/preview hit the deployed Worker directly — in production /api is
// rewritten by vercel.json, which doesn't apply outside Vercel. (/share is NOT
// proxied: its Worker route serves the production app shell to browsers, while
// locally the SPA route must render this build.)
const apiProxy = {
  '/api': {
    target: 'https://inci-detective-api.merbeni.workers.dev',
    changeOrigin: true,
  },
}

export default defineConfig({
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: {
    // e2e/ holds Playwright specs (own runner via `npm run test:e2e`) —
    // vitest's default *.spec.js glob must not pick them up.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  build: {
    rollupOptions: {
      output: {
        // Split large vendors into their own long-lived cache chunks.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'INCI Detective',
        short_name: 'INCI',
        description:
          'Scan cosmetic products and classify their INCI ingredients by risk level — offline.',
        theme_color: '#C4687A',
        background_color: '#FFF8F5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml' },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,json}'],
        // The CosIng catalogue (multi-MB versioned JSON) is fetched on demand
        // and persisted in IndexedDB — precaching it would double the install
        // weight for data the app already keeps offline.
        globIgnores: ['dataset/**'],
        runtimeCaching: [
          {
            // Belt-and-braces for the catalogue fetch (e.g. IndexedDB blocked
            // in private mode). The filename is versioned, so CacheFirst never
            // serves a stale catalogue.
            urlPattern: ({ url }) => url.pathname.startsWith('/dataset/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'inci-dataset',
              expiration: { maxEntries: 2 },
            },
          },
          {
            urlPattern: ({ url }) => url.href.includes('openbeautyfacts.org'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'obf-products',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/ai'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ai-proxy',
              networkTimeoutSeconds: 20,
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
