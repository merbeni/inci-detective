// Risk classification core.
//
// Strategy (from the LLM recommendation, section 1.3):
//  - exact match against the normalized CosIng key first
//  - exact-only for very short names (< 5 chars) to avoid false fuzzy matches
//  - otherwise Levenshtein fuzzy matching with a ~0.85 similarity threshold
//  - an ingredient not found in the dataset is classified as Caution, never
//    Alert — the deliberate "don't alarm without evidence" decision (1.4).

import bundledMeta from '../data/dataset-meta.json'
import { similarity } from './levenshtein.js'
import { scoreIngredient, scoreProduct } from './score.js'
import { detectCategory, applyContext } from './category.js'

const FUZZY_THRESHOLD = 0.85
const MIN_FUZZY_LEN = 5

// The full ~28k catalogue is multi-MB, so it is NOT bundled: it ships as a
// versioned static JSON (public/dataset/, written by scripts/build-dataset.mjs)
// fetched the first time an analysis needs it and then persisted in IndexedDB —
// after that first fetch the catalogue works fully offline and the app shell
// precache stays small. Only the tiny metadata sidecar is imported eagerly.
let active = {
  ingredients: [],
  unknownLevel: bundledMeta.unknownLevel,
  annexLabels: bundledMeta.annexLabels,
}
let loaded = false
let loadingPromise = null

const DATASET_URL = `/dataset/ingredients-v${bundledMeta.cosing_version}.json`

async function loadCatalogue() {
  // 1. IndexedDB copy — either this same version (stored on a previous visit)
  //    or a newer one pulled from Supabase by syncDataset().
  try {
    const { getCachedDataset } = await import('../db/db.js')
    const cached = await getCachedDataset()
    if (
      cached?.ingredients?.length &&
      cached.meta?.cosing_version >= bundledMeta.cosing_version
    ) {
      setDataset(cached.ingredients, cached.meta)
      return
    }
  } catch {
    /* IndexedDB unavailable (private mode) — fall through to the network */
  }

  // 2. The static versioned JSON served next to the app shell.
  const res = await fetch(DATASET_URL)
  if (!res.ok) throw new Error(`dataset fetch failed: HTTP ${res.status}`)
  const ds = await res.json()
  const { ingredients, ...meta } = ds
  setDataset(ingredients, meta)

  // Persist for offline use — best-effort, the in-memory dataset already works.
  try {
    const { setCachedDataset } = await import('../db/db.js')
    await setCachedDataset(meta, ingredients)
  } catch {
    /* ignore */
  }
}

export function ensureDataset() {
  if (loaded) return Promise.resolve()
  if (!loadingPromise) {
    loadingPromise = loadCatalogue().catch((err) => {
      // A failed fetch (flaky first visit) must not poison the cache — clear it
      // so the next analysis retries.
      loadingPromise = null
      throw err
    })
  }
  return loadingPromise
}

let byNorm = new Map()
// Fuzzy candidates are bucketed by normalized-name length so a near-match scan
// only compares against entries of a similar length — keeps it fast over ~28k.
let byLen = new Map()
function rebuildIndex() {
  byNorm = new Map()
  byLen = new Map()
  for (const ing of active.ingredients) {
    byNorm.set(ing.norm, ing)
    const L = ing.norm.length
    let bucket = byLen.get(L)
    if (!bucket) byLen.set(L, (bucket = []))
    bucket.push(ing)
  }
  // Aliases (label variants, Spanish common names, trade names like
  // "Oxybenzone" -> Benzophenone-3) resolve exact-only, and never shadow a
  // real INCI norm.
  for (const ing of active.ingredients) {
    for (const alias of ing.alias || []) {
      if (!byNorm.has(alias)) byNorm.set(alias, ing)
    }
  }
}
rebuildIndex()

// Resolve an annex code to its human label from the active dataset's map.
function annexLabelFor(annex) {
  return (active.annexLabels && active.annexLabels[annex]) || ''
}

export const datasetMeta = {
  version: bundledMeta.cosing_version,
  generatedAt: bundledMeta.generatedAt,
  count: bundledMeta.count,
  unknownLevel: bundledMeta.unknownLevel,
}

// Replace the active dataset (e.g. the lazy-loaded bundle, or a newer CosIng
// version from Supabase). `meta` = { cosing_version, generatedAt, unknownLevel,
// annexLabels }.
export function setDataset(ingredients, meta = {}) {
  active = {
    ingredients,
    unknownLevel: meta.unknownLevel || bundledMeta.unknownLevel,
    annexLabels: meta.annexLabels || bundledMeta.annexLabels,
  }
  rebuildIndex()
  datasetMeta.version = meta.cosing_version || datasetMeta.version
  datasetMeta.generatedAt = meta.generatedAt || datasetMeta.generatedAt
  datasetMeta.count = ingredients.length
  // The catalogue is now populated (bundle or a newer remote one), so the lazy
  // loader must not later overwrite it with the bundled file.
  loaded = true
}

export const SAFETY_ORDER = { safe: 0, caution: 1, alert: 2 }

export function allIngredients() {
  return active.ingredients
}

// Resolve a single normalized name to a dataset entry (or null).
export function matchIngredient(norm) {
  const exact = byNorm.get(norm)
  if (exact) return { entry: exact, confidence: 1 }

  if (norm.length < MIN_FUZZY_LEN) return null

  // Only scan entries whose length is within the window that could still clear
  // the similarity threshold — at 0.85, lengths differing by >15% can't qualify.
  const window = Math.max(1, Math.floor(norm.length * 0.15))
  let best = null
  let bestScore = 0
  for (let L = norm.length - window; L <= norm.length + window; L++) {
    const bucket = byLen.get(L)
    if (!bucket) continue
    for (const ing of bucket) {
      const score = similarity(norm, ing.norm)
      if (score > bestScore) {
        bestScore = score
        best = ing
      }
    }
  }
  if (best && bestScore >= FUZZY_THRESHOLD) {
    return { entry: best, confidence: Number(bestScore.toFixed(3)) }
  }
  return null
}

// Try the primary normalized name, then any slash-separated synonym variants.
function matchToken(token) {
  let match = matchIngredient(token.norm)
  if (match) return match
  for (const alt of token.alts || []) {
    if (alt === token.norm) continue
    match = matchIngredient(alt)
    if (match) return match
  }
  return null
}

// Classify one parsed token { display, norm, alts, position }.
export function classifyToken(token, watchlistNorms = new Set()) {
  const match = matchToken(token)
  const onWatchlist =
    watchlistNorms.has(token.norm) ||
    (token.alts || []).some((a) => watchlistNorms.has(a))

  if (!match) {
    return {
      display: token.display,
      norm: token.norm,
      position: token.position,
      matchedInci: null,
      common: '',
      function: '',
      annex: 'none',
      annexLabel: '',
      safety: active.unknownLevel,
      confidence: 0,
      unknown: true,
      note: 'Not found in the local CosIng dataset.',
      onWatchlist,
    }
  }

  const e = match.entry
  return {
    display: token.display,
    norm: token.norm,
    position: token.position,
    matchedInci: e.inci,
    common: e.common || '',
    function: e.function || '',
    annex: e.annex,
    annexLabel: annexLabelFor(e.annex),
    safety: e.safety,
    confidence: match.confidence,
    concern: e.concern || [],
    unknown: false,
    note: e.note || '',
    onWatchlist,
  }
}

// Sanity gate for OCR'd / pasted text: a real INCI list parses into tokens
// that mostly resolve against the ~28.7k-entry catalogue. A photo of something
// else (a pet, a directions paragraph) yields tokens that are almost all
// unknown — callers should reject it instead of saving a garbage analysis.
// Very short lists are real (a thermal-water spray is just "Avene Aqua,
// Nitrogen"), so 1-2 tokens pass as long as at least one is a known
// ingredient — random noise that short essentially never resolves.
export function looksLikeIngredientList(summary) {
  if (!summary || !summary.total) return false
  const known = summary.total - summary.unknown
  if (summary.total < 3) return known >= 1
  return known / summary.total >= 0.4
}

// Classify a full parsed list and produce summary counts. `meta.productName`
// (when available) drives category detection — falls back to the ingredient
// signals themselves (see category.js) when the name gives no clue.
export function classifyList(tokens, watchlistNorms = new Set(), meta = {}) {
  let items = tokens.map((t) => {
    const item = classifyToken(t, watchlistNorms)
    item.score = scoreIngredient(item)
    return item
  })

  const category = detectCategory({ productName: meta.productName || '', items })
  // Applied before the summary/score pass below, so a promoted ingredient
  // (e.g. an expected UV filter) counts toward "safe" and the product score.
  items = applyContext(items, category)

  const summary = { safe: 0, caution: 0, alert: 0, unknown: 0, total: items.length }
  let watchlistHits = 0
  for (const item of items) {
    summary[item.safety] += 1
    if (item.unknown) summary.unknown += 1
    if (item.onWatchlist) watchlistHits += 1
  }
  // Overall product rating = worst ingredient level present.
  let overall = 'safe'
  if (summary.alert > 0) overall = 'alert'
  else if (summary.caution > 0) overall = 'caution'

  return { items, summary, overall, watchlistHits, score: scoreProduct(items), category }
}
