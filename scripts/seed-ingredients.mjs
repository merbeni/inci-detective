// Upload the built CosIng dataset to Supabase (tables `ingredients` +
// `dataset_meta`). Powers the remote-updatable dataset: bump the version in
// data/risk-mapping.json, run `npm run build:dataset`, then run this script and
// every client picks up the new version on next launch — no app redeploy.
//
// Requires (env or .env.local):
//   VITE_SUPABASE_URL            your project URL
//   SUPABASE_SERVICE_ROLE_KEY    service-role key (server-side only, NEVER shipped)
//
// Usage: node scripts/seed-ingredients.mjs

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

// Minimal .env.local loader (no dependency).
function loadEnv() {
  const file = resolve(root, '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See .env.example.')
  process.exit(1)
}

const dataset = JSON.parse(readFileSync(resolve(root, 'src/data/ingredients.json'), 'utf-8'))
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// `norm` is the dataset's unique merge key, so it doubles as the row id (the
// built entries carry no separate `id` field).
const rows = dataset.ingredients.map((i) => ({
  id: i.norm,
  inci: i.inci,
  norm: i.norm,
  common: i.common,
  function: i.function,
  annex: i.annex,
  annex_label: i.annexLabel,
  safety: i.safety,
  concern: i.concern,
  note: i.note,
}))

console.log(`Uploading ${rows.length} ingredients (v${dataset.cosing_version})…`)

// Upsert in chunks to stay within request limits.
const CHUNK = 500
for (let i = 0; i < rows.length; i += CHUNK) {
  const slice = rows.slice(i, i + CHUNK)
  const { error } = await supabase.from('ingredients').upsert(slice)
  if (error) {
    console.error('ingredients upsert failed:', error.message)
    process.exit(1)
  }
}

const { error: metaErr } = await supabase.from('dataset_meta').upsert({
  id: 1,
  cosing_version: dataset.cosing_version,
  count: dataset.count,
  generated_at: dataset.generatedAt,
  annex_labels: dataset.annexLabels,
  updated_at: new Date().toISOString(),
})
if (metaErr) {
  console.error('dataset_meta upsert failed:', metaErr.message)
  process.exit(1)
}

console.log('Done. Clients will pick up this version on next launch.')
