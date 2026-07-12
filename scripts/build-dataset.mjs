// Build-time dataset pipeline.
//
// Mirrors the architecture decision from section 1.3/1.4 of the design doc:
// the CosIng catalogue has no public REST API, so it is parsed at build time
// and the restriction annexes are mapped to the three risk levels via a
// separate, versionable config (risk-mapping.json). The output is a compact
// JSON bundled into the app and pre-cached by the service worker.
//
// The full ECHA CosIng catalogue (data/cosing-full.json, produced by
// scripts/import-cosing.mjs) is the base layer for coverage. A small hand-curated
// source (data/cosing-source.json) is overlaid on top: it carries the friendly
// `common` names and the `concern` flags (sensitivity, acne…) that the raw CosIng
// export doesn't have, and wins on conflicts.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const fullPath = resolve(root, 'data/cosing-full.json')
const cosingFull = existsSync(fullPath)
  ? JSON.parse(readFileSync(fullPath, 'utf-8'))
  : []
const curated = JSON.parse(
  readFileSync(resolve(root, 'data/cosing-source.json'), 'utf-8'),
)
// Base layer first (full catalogue), curated overrides last so they win.
const source = [...cosingFull, ...curated]
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
  // Compact entry: empty fields are omitted to keep the bundled JSON small (the
  // app falls back to '' / [] at runtime). `annexLabel` is resolved at runtime
  // from the annex code via the shipped annexLabels map, not stored per row.
  const entry = { inci: record.inci, norm, annex: record.annex || 'none', safety }
  if (record.common) entry.common = record.common
  if (record.function) entry.function = record.function
  if (record.concern?.length) entry.concern = record.concern
  if (record.note) entry.note = record.note
  // Curated aliases (label variants, Spanish common names, trade names) are
  // normalized here so the runtime can index them for exact matching directly.
  if (record.aliases?.length) {
    const alias = [...new Set(record.aliases.map(normalize).filter((a) => a && a !== norm))]
    if (alias.length) entry.alias = alias
  }
  // Merge on the normalized key. Later sources (curated) win on descriptive
  // fields; the safety level is always the higher-risk of the two so a curated
  // entry can never silently downgrade a restricted CosIng ingredient.
  const existing = seen.get(norm)
  if (!existing) {
    seen.set(norm, entry)
  } else {
    // Curated (processed last) wins on present fields; omitted fields fall back
    // to the CosIng values. Safety stays at the higher-risk of the two.
    const merged = { ...existing, ...entry }
    if (SAFETY_RANK[existing.safety] >= SAFETY_RANK[entry.safety]) {
      merged.safety = existing.safety
      merged.annex = existing.annex
    }
    if (existing.alias || entry.alias) {
      merged.alias = [...new Set([...(existing.alias || []), ...(entry.alias || [])])]
    }
    seen.set(norm, merged)
  }
}

const ingredients = [...seen.values()].sort((a, b) => a.norm.localeCompare(b.norm))

const meta = {
  cosing_version: mapping.version,
  generatedAt: new Date().toISOString().slice(0, 10),
  count: ingredients.length,
  unknownLevel: mapping.unknownLevel,
  annexLabels: mapping.annexLabels,
}
const output = { ...meta, ingredients }

const outDir = resolve(root, 'src/data')
mkdirSync(outDir, { recursive: true })
// The full catalogue (multi-MB) is lazy-loaded only when an analysis runs.
writeFileSync(resolve(outDir, 'ingredients.json'), JSON.stringify(output), 'utf-8')
// A tiny sidecar with just the metadata + annex labels, imported eagerly so the
// Profile screen and the remote-dataset version check don't pull in the big file.
writeFileSync(resolve(outDir, 'dataset-meta.json'), JSON.stringify(meta), 'utf-8')

const counts = ingredients.reduce((acc, i) => {
  acc[i.safety] = (acc[i.safety] || 0) + 1
  return acc
}, {})
console.log(
  `[build-dataset] wrote ${ingredients.length} ingredients (v${mapping.version}) ->`,
  counts,
)
