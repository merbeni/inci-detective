// Risk classification core.
//
// Strategy (from the LLM recommendation, section 1.3):
//  - exact match against the normalized CosIng key first
//  - exact-only for very short names (< 5 chars) to avoid false fuzzy matches
//  - otherwise Levenshtein fuzzy matching with a ~0.85 similarity threshold
//  - an ingredient not found in the dataset is classified as Caution, never
//    Alert — the deliberate "don't alarm without evidence" decision (1.4).

import dataset from '../data/ingredients.json'
import { similarity } from './levenshtein.js'
import { normalizeName } from './inciParse.js'

const FUZZY_THRESHOLD = 0.85
const MIN_FUZZY_LEN = 5

// Mutable active dataset — starts as the bundled JSON (instant, offline) and can
// be swapped at runtime for a newer one fetched from the cloud (remote dataset).
let active = dataset
let byNorm = new Map()
function rebuildIndex() {
  byNorm = new Map()
  for (const ing of active.ingredients) byNorm.set(ing.norm, ing)
}
rebuildIndex()

export const datasetMeta = {
  version: dataset.cosing_version,
  generatedAt: dataset.generatedAt,
  count: dataset.count,
  unknownLevel: dataset.unknownLevel,
}

// Replace the active dataset (e.g. a newer CosIng version from Supabase).
// `meta` = { cosing_version, generatedAt, count, unknownLevel }.
export function setDataset(ingredients, meta = {}) {
  active = {
    ingredients,
    unknownLevel: meta.unknownLevel || dataset.unknownLevel,
  }
  rebuildIndex()
  datasetMeta.version = meta.cosing_version || datasetMeta.version
  datasetMeta.generatedAt = meta.generatedAt || datasetMeta.generatedAt
  datasetMeta.count = ingredients.length
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

  let best = null
  let bestScore = 0
  for (const ing of active.ingredients) {
    // Cheap length pre-filter before the expensive distance computation.
    if (Math.abs(ing.norm.length - norm.length) > norm.length * 0.4) continue
    const score = similarity(norm, ing.norm)
    if (score > bestScore) {
      bestScore = score
      best = ing
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
    common: e.common,
    function: e.function,
    annex: e.annex,
    annexLabel: e.annexLabel,
    safety: e.safety,
    confidence: match.confidence,
    concern: e.concern,
    unknown: false,
    note: e.note,
    onWatchlist,
  }
}

// Classify a full parsed list and produce summary counts.
export function classifyList(tokens, watchlistNorms = new Set()) {
  const items = tokens.map((t) => classifyToken(t, watchlistNorms))
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

  return { items, summary, overall, watchlistHits }
}
