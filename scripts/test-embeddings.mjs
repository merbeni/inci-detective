// Quality probe for the semantic-search (Fase 2 / RAG) feature — NOT part of the
// build. Embeds the whole ingredient catalogue in memory with the same model
// Cloudflare Workers AI runs (bge-small-en-v1.5) and prints nearest neighbours
// for a few sample ingredients, so we can eyeball whether "alternatives to X"
// is any good BEFORE committing to Vectorize + Worker infra.
//
// Run:  node scripts/test-embeddings.mjs
// (First run downloads the model weights ~30MB, then caches them.)

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from '@xenova/transformers'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const data = JSON.parse(readFileSync(resolve(root, 'src/data/ingredients.json'), 'utf-8'))
const items = data.ingredients

// The text we embed per ingredient. The official CosIng `function` is the strong
// signal (99% coverage) that clusters alternatives together; the common name and
// safety add a bit of consumer-facing context.
function embedText(i) {
  const parts = [i.common || i.inci]
  if (i.function) parts.push(i.function)
  if (i.concern?.length) parts.push(i.concern.join(', '))
  return parts.join('. ')
}

const DIM = 384
const N = items.length

// Embedding is slow (~15 min for the full catalogue on CPU), so cache the raw
// vectors to disk and reuse them — that lets us iterate the RANKING logic below
// instantly without re-embedding. Cache is keyed on N; delete it if embedText or
// the dataset changes.
const CACHE = resolve(root, 'data/embeddings-cache.bin')
let store
if (existsSync(CACHE)) {
  const buf = readFileSync(CACHE)
  if (buf.length === N * DIM * 4) {
    store = new Float32Array(buf.buffer, buf.byteOffset, N * DIM)
    console.log(`[probe] loaded cached embeddings for ${N} ingredients`)
  }
}
if (!store) {
  console.log(`[probe] embedding ${N} ingredients with bge-small-en-v1.5…`)
  const extractor = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5')
  store = new Float32Array(N * DIM)
  const BATCH = 64
  const t0 = Date.now()
  for (let start = 0; start < N; start += BATCH) {
    const slice = items.slice(start, start + BATCH)
    const out = await extractor(
      slice.map(embedText),
      { pooling: 'mean', normalize: true },
    )
    // out.data is a flat Float32Array of shape [slice.length, DIM].
    store.set(out.data, start * DIM)
    if (start % (BATCH * 40) === 0) {
      const pct = ((start / N) * 100).toFixed(0)
      const rate = (start / ((Date.now() - t0) / 1000)).toFixed(0)
      process.stdout.write(`\r[probe] ${pct}%  (${rate}/s)   `)
    }
  }
  console.log(`\r[probe] embedded ${N} in ${((Date.now() - t0) / 1000).toFixed(0)}s        `)
  writeFileSync(CACHE, Buffer.from(store.buffer, store.byteOffset, store.byteLength))
  console.log(`[probe] cached vectors -> ${CACHE}`)
}

// The distinctive stem of an ingredient = the first chars of its longest word.
// "sodium hyaluronate"->"hyalur", "glycerin"->"glycer", "retinol"->"retino".
// Used to drop chemical cousins (variants of the same molecule) that the raw
// cosine ranking over-surfaces — a user wants a functional ALTERNATIVE, not
// "glycerin's derivatives".
function stemOf(norm) {
  const longest = norm.split(' ').reduce((a, b) => (b.length > a.length ? b : a), '')
  return longest.slice(0, 6)
}

// Cosine similarity == dot product (vectors are already L2-normalized). We over-
// fetch, then drop candidates sharing the query's stem and de-dup by stem so the
// list is variety of real alternatives, not near-duplicates.
function neighbors(idx, k = 8) {
  const base = idx * DIM
  const scores = new Array(N)
  for (let j = 0; j < N; j++) {
    let dot = 0
    const off = j * DIM
    for (let d = 0; d < DIM; d++) dot += store[base + d] * store[off + d]
    scores[j] = [j, dot]
  }
  scores.sort((a, b) => b[1] - a[1])

  const queryStem = stemOf(items[idx].norm)
  const seenStems = new Set([queryStem])
  const out = []
  for (const [j, score] of scores) {
    if (j === idx) continue
    const norm = items[j].norm
    // Drop chemical cousins: the candidate embeds the query's stem (e.g. query
    // "glycerin"/stem "glycer" -> "hexylglycerin", "polyglycerin"), or vice versa.
    if (norm.includes(queryStem)) continue
    const stem = stemOf(norm)
    if (queryStem.includes(stem) && stem.length >= 4) continue
    if (seenStems.has(stem)) continue // same family already represented
    seenStems.add(stem)
    out.push([j, score])
    if (out.length >= k) break
  }
  return out
}

function findByInci(name) {
  const n = name.toLowerCase()
  return items.findIndex((i) => i.inci.toLowerCase() === n)
}

const QUERIES = [
  'Glycerin',
  'Salicylic Acid',
  'Retinol',
  'Sodium Hyaluronate',
  'Niacinamide',
  'Tocopherol',
]

for (const q of QUERIES) {
  const idx = findByInci(q)
  if (idx < 0) {
    console.log(`\n### ${q}: not found in dataset`)
    continue
  }
  const src = items[idx]
  console.log(`\n### Alternatives to "${q}"  (function: ${src.function || '—'}, ${src.safety})`)
  for (const [j, score] of neighbors(idx)) {
    const it = items[j]
    console.log(
      `   ${score.toFixed(3)}  ${it.inci}  —  ${it.function || '—'} [${it.safety}]`,
    )
  }
}
