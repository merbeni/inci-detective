// Build-time dataset pipeline.
//
// Mirrors the architecture decision from section 1.3/1.4 of the design doc:
// the CosIng catalogue has no public REST API, so it is parsed at build time
// and the restriction annexes are mapped to the three risk levels via a
// separate, versionable config (risk-mapping.json). The output is a compact
// JSON bundled into the app and pre-cached by the service worker.
//
// In production this script would parse the official ECHA CosIng CSV. Here it
// reads a curated source (data/cosing-source.json) of common ingredients so the
// app is genuinely functional offline without shipping the full 27k catalogue.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const source = JSON.parse(
  readFileSync(resolve(root, 'data/cosing-source.json'), 'utf-8'),
)
const mapping = JSON.parse(
  readFileSync(resolve(root, 'data/risk-mapping.json'), 'utf-8'),
)

// Normalize an INCI name into a stable matching key.
function normalize(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SAFETY_RANK = { safe: 0, caution: 1, alert: 2 }

function deriveSafety(record) {
  const annex = record.annex || 'none'
  let level = mapping.annexMap[annex] ?? mapping.unknownLevel

  // Curated override: a "sensitivity" concern means at least Caution even if the
  // ingredient carries no regulatory restriction (e.g. fragrance, SLS, essential
  // oils). Acne/dryness flags are informational and do not raise the base level.
  const concern = record.concern || []
  if (concern.includes('sensitivity') && SAFETY_RANK[level] < SAFETY_RANK.caution) {
    level = 'caution'
  }
  return level
}

const seen = new Map()
for (const record of source) {
  const norm = normalize(record.inci)
  if (!norm) continue
  const safety = deriveSafety(record)
  const entry = {
    id: norm.replace(/ /g, '-'),
    inci: record.inci,
    norm,
    common: record.common || '',
    function: record.function || '',
    annex: record.annex || 'none',
    annexLabel: mapping.annexLabels[record.annex || 'none'],
    safety,
    concern: record.concern || [],
    note: record.note || '',
  }
  // De-dup by normalized key, keeping the higher-risk classification.
  const existing = seen.get(norm)
  if (!existing || SAFETY_RANK[entry.safety] > SAFETY_RANK[existing.safety]) {
    seen.set(norm, entry)
  }
}

const ingredients = [...seen.values()].sort((a, b) => a.norm.localeCompare(b.norm))

const output = {
  cosing_version: mapping.version,
  generatedAt: new Date().toISOString().slice(0, 10),
  count: ingredients.length,
  unknownLevel: mapping.unknownLevel,
  annexLabels: mapping.annexLabels,
  ingredients,
}

const outDir = resolve(root, 'src/data')
mkdirSync(outDir, { recursive: true })
writeFileSync(
  resolve(outDir, 'ingredients.json'),
  JSON.stringify(output),
  'utf-8',
)

const counts = ingredients.reduce((acc, i) => {
  acc[i.safety] = (acc[i.safety] || 0) + 1
  return acc
}, {})
console.log(
  `[build-dataset] wrote ${ingredients.length} ingredients (v${mapping.version}) ->`,
  counts,
)
