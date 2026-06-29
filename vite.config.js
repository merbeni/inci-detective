import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Offline-first PWA configuration.
// - CacheFirst for static assets (app shell + WASM + dataset)
// - StaleWhileRevalidate for Open Beauty Facts
// - NetworkFirst for the Gemini AI proxy
export default defineConfig({
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
        // The CosIng dataset can be a few MB; allow precaching it.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,json}'],
        runtimeCaching: [
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
