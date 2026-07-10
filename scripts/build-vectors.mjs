// Build the Vectorize corpus: embed every ingredient with Workers AI (the SAME
// model the Worker uses at query time, so vectors are consistent) and write an
// NDJSON file ready for `wrangler vectorize insert`.
//
// Needs a Cloudflare API token with "Workers AI: Read" on your account:
//   CF_ACCOUNT_ID=xxxx CF_API_TOKEN=yyyy node scripts/build-vectors.mjs
//
// Then:  npx wrangler vectorize insert inci-ingredients --file data/vectors.ndjson
//
// Note: embedText MUST stay identical to how queries are composed on the client
// (src/ai/semantic.js) — same recipe on both sides = comparable vectors.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ACCOUNT = process.env.CF_ACCOUNT_ID
const TOKEN = process.env.CF_API_TOKEN
if (!ACCOUNT || !TOKEN) {
  console.error('Set CF_ACCOUNT_ID and CF_API_TOKEN (token needs "Workers AI: Read").')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const items = JSON.parse(
  readFileSync(resolve(root, 'src/data/ingredients.json'), 'utf-8'),
).ingredients

// The official CosIng `function` (99% coverage) is the strong clustering signal.
function embedText(i) {
  const parts = [i.common || i.inci]
  if (i.function) parts.push(i.function)
  if (i.concern?.length) parts.push(i.concern.join(', '))
  return parts.join('. ')
}

const MODEL = '@cf/baai/bge-small-en-v1.5'
const ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`
const BATCH = 100

const lines = []
const t0 = Date.now()
for (let start = 0; start < items.length; start += BATCH) {
  const slice = items.slice(start, start + BATCH)
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: slice.map(embedText) }),
  })
  if (!res.ok) {
    console.error(`\nEmbed failed at ${start} (HTTP ${res.status}):`, await res.text())
    process.exit(1)
  }
  const j = await res.json()
  const vecs = j.result?.data
  if (!Array.isArray(vecs)) {
    console.error('\nUnexpected embed response:', JSON.stringify(j).slice(0, 300))
    process.exit(1)
  }
  slice.forEach((it, k) => {
    lines.push(
      JSON.stringify({
        id: String(start + k),
        values: vecs[k].map((v) => Math.round(v * 1e6) / 1e6),
        metadata: { inci: it.inci, fn: it.function || '', safety: it.safety, annex: it.annex },
      }),
    )
  })
  if (start % (BATCH * 10) === 0) {
    const rate = (start / ((Date.now() - t0) / 1000 || 1)).toFixed(0)
    process.stdout.write(`\r[vectors] ${start}/${items.length}  (${rate}/s)   `)
  }
}

const outPath = resolve(root, 'data/vectors.ndjson')
writeFileSync(outPath, lines.join('\n') + '\n')
console.log(`\r[vectors] wrote ${lines.length} vectors -> data/vectors.ndjson        `)
