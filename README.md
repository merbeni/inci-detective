# INCI Detective

An **offline-first PWA** that scans cosmetic products (barcode or label photo),
extracts the INCI ingredient list, and classifies each ingredient by risk level
— **Safe / Caution / Alert** — entirely on-device. Optional AI enrichment runs
opt-in when there's connectivity.

This is the working implementation of the design documented in
`INCI_Detective_Actividades_Practicas_M1_U4.docx`. It follows the architecture
recommended in that document section by section.

## Architecture (as designed in §1.3)

| Concern            | Implementation |
| ------------------ | -------------- |
| Pattern            | PWA offline-first, no managed server |
| Frontend           | React + Vite (no SSR) |
| Service worker     | Workbox via `vite-plugin-pwa` — CacheFirst assets, StaleWhileRevalidate for OBF, NetworkFirst for the AI proxy |
| Barcode scanning   | ZXing (`@zxing/browser`, WASM, client-side) |
| OCR fallback       | Tesseract.js + Canvas pre-processing (grayscale + threshold) |
| Fuzzy matching     | In-tree Levenshtein, ~0.85 threshold, exact-only for names < 5 chars |
| Local DB           | Dexie.js over IndexedDB |
| Dataset            | CosIng-derived JSON, built at build time, precached by the SW |
| Product lookup     | Open Beauty Facts API (with offline / not-found fallbacks) |
| AI (opt-in)        | Gemini 2.5 Flash via a Cloudflare Worker reverse proxy, or a user-supplied key |
| Semantic search    | Workers AI (`bge-small-en-v1.5`) + Cloudflare Vectorize, RAG answers via Gemini |
| i18n               | es/en (`src/i18n/`), auto-detected from the device, switchable in Profile |

## How the pieces map to the design doc

- **DER (§1.2)** → `src/db/db.js`. The N:M `SCAN_RESULT`–`INGREDIENT` join
  (`SCAN_INGREDIENT` with `matched_inci_name`, `confidence_score`, `position`)
  is stored as the `items` array of each scan.
- **State machine (§1.2)** → `src/core/analyze.js`: barcode lookup → (found ?
  classify : OCR / manual fallback) → local classification. Every path
  converges on the offline classifier.
- **Static dataset decision (§1.5)** → `data/cosing-source.json` +
  `data/risk-mapping.json` → `scripts/build-dataset.mjs` →
  `public/dataset/ingredients-v<version>.json`. The catalogue ships as a
  versioned static JSON (fetched on first use, persisted in IndexedDB) so the
  app bundle and PWA precache stay small; the risk mapping is a separate,
  versionable config and the `cosing_version` shows in the Profile screen.
- **"Unknown → Caution, never Alert" (§1.4)** → `src/core/classifier.js`.
- **Visual system (§3.5 / §4.4)** → `src/styles/theme.css` (exact palette:
  rose `#C4687A`, cream `#FFF8F5`, lavender `#C4A8D4`; semaphore sage/peach/coral).
  Risk is always conveyed by **badge + text label**, never colour alone (WCAG).

## Screens

Home · Scan (camera) · Manual entry (barcode / paste / photo-OCR) · Analysis ·
History · Watchlist · Profile · 4-step Onboarding — matching §3.4.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # rebuilds the dataset, then the PWA into dist/
npm run preview    # serve the production build
```

> The camera (ZXing) requires HTTPS or `localhost`. On a phone, use `vite dev --host`
> behind HTTPS, or deploy to Cloudflare Pages.

### Updating the ingredient dataset

Edit `data/cosing-source.json` / `data/risk-mapping.json` and run
`npm run build:dataset`. In production this script would parse the official ECHA
CosIng CSV; here it uses a curated set of common ingredients so the app is
genuinely useful offline without shipping the full ~27k catalogue.

## Cloud / backend setup (optional)

The app is **offline-first and works with no backend at all** — every cloud
feature degrades gracefully when Supabase isn't configured. Enabling the backend
adds: user accounts, multi-device sync, shareable analysis links, and a
remote-updatable CosIng dataset. (See `../INCI_Detective_Requerimientos_Backend_Addendum.md`.)

1. Create a free [Supabase](https://supabase.com) project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor (tables,
   RLS policies, the new-user trigger).
3. (For Google login) enable the Google provider in Supabase → Authentication.
4. Copy `.env.example` to `.env.local` and fill:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
5. `npm run dev` — a "Sign in" section now appears in Profile.

### Remote dataset (optional, RF-B4)

Push the built dataset to the cloud so clients update without an app redeploy:

```bash
# add SUPABASE_SERVICE_ROLE_KEY to .env.local (server-side only, never shipped)
npm run build:dataset
npm run seed:dataset
```

Bump `version` in `data/risk-mapping.json` before re-seeding; clients pick up the
newer `cosing_version` on next launch and cache it in IndexedDB.

### How sync works

IndexedDB stays the source of truth (instant, offline). Local writes fire a
best-effort push to Supabase; on login / reconnect, `fullSync()` reconciles both
ways (last-write-wins on the shared UUID key). The Gemini key is **never** synced.

## Cloudflare Worker (optional — AI proxy, semantic search, share previews)

`worker/` is a single Cloudflare Worker (`inci-detective-api`) with three routes:

- `POST /api/ai` — Gemini reverse proxy. The API key lives only in the Worker's
  encrypted secret; requests are rate-limited per IP and image uploads capped.
- `POST /api/search` — semantic ingredient search: embeds the query with
  Workers AI (`bge-small-en-v1.5`, same model the corpus was built with) and
  queries the Vectorize index; `mode: "rag"` also returns a Gemini-written
  recommendation grounded in the retrieved candidates.
- `GET /share/:id` — server-rendered Open Graph tags for shared analyses, so
  WhatsApp/Telegram link previews work (bots get meta tags, humans get the SPA).

Deploy:

```bash
npx wrangler vectorize create inci-ingredients --dimensions=384 --metric=cosine
npx wrangler secret put GEMINI_API_KEY      # never shipped to the client
npx wrangler deploy
# build + upload the vector corpus (needs CF_ACCOUNT_ID + a "Workers AI: Read" token)
node scripts/build-vectors.mjs
npx wrangler vectorize insert inci-ingredients --file data/vectors.ndjson
```

Then point the `/api/*` and `/share/*` rewrites in `vercel.json` at your
`workers.dev` subdomain. Vars in `wrangler.toml`: `ALLOWED_ORIGIN`, `APP_ORIGIN`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY` (the public anon key, used read-only for
share previews).

Alternatively, each user can paste their own Google AI Studio key in Profile →
the request then goes directly to Gemini (the "bring your own key" scaling path
from §1.4). AI is strictly opt-in; core classification never depends on it.

## Dev workflow

```bash
npm run lint     # ESLint (flat config)
npm test         # Vitest — parser / classifier / levenshtein suites
npm run build    # dataset + PWA
npm run test:e2e # Playwright E2E over the production build (build first)
```

CI (GitHub Actions):

- `ci.yml` — lint → test → build → `npm audit` plus the Playwright E2E suite
  on every push/PR to main.
- `deploy-worker.yml` — deploys the Cloudflare Worker when `worker/**` or
  `wrangler.toml` change on main (needs the `CLOUDFLARE_API_TOKEN` secret).
- `dataset-refresh.yml` — monthly (and on dataset changes) rebuild + re-seed of
  the Supabase remote dataset (needs `VITE_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` secrets).
