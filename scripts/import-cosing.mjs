// Import the full official CosIng catalogue into a compact source file.
//
// Input:  data/cosing-raw/inventory.csv  — the EU "Ingredients & Fragrance
//         Inventory" export (COSING Ref No, INCI name, …, Restriction, Function).
//         Sourced from the European Commission CosIng database (archived copy).
// Output: data/cosing-full.json          — [{ inci, function, annex }] for every
//         ingredient, with the Restriction column parsed down to its Annex code
//         (II/III/IV/V/VI) so build-dataset.mjs can derive the risk level.
//
// The big IUPAC/description column is intentionally dropped — the app never shows
// it and it would quadruple the bundle. Run once after refreshing the CSV:
//   node scripts/import-cosing.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CSV = resolve(root, 'data/cosing-raw/inventory.csv')
const OUT = resolve(root, 'data/cosing-full.json')

// --- minimal streaming CSV parser (quoted fields may contain commas/newlines) --
function parseCsv(text) {
  const records = []
  let field = ''
  let row = []
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else q = false
      } else field += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      if (row.length > 1) records.push(row)
      row = []
      field = ''
    } else if (c !== '\r') field += c
  }
  if (field.length || row.length) {
    row.push(field)
    if (row.length > 1) records.push(row)
  }
  return records
}

// Parse the Restriction column down to a single Annex code, picking the most
// restrictive when several are referenced (e.g. "II/665" beats "III/12").
const ANNEX_RANK = { II: 5, III: 4, V: 3, VI: 2, IV: 1 }
function annexFromRestriction(restriction) {
  if (!restriction || !restriction.trim()) return 'none'
  const codes = [...restriction.matchAll(/\b(VI|IV|III|II|V)\s*\//g)].map((m) => m[1])
  if (!codes.length) {
    // Non-empty restriction we couldn't map to an annex (free-text CMR notes,
    // Directive references, …). It IS restricted, so don't call it unregulated.
    return 'III'
  }
  return codes.sort((a, b) => (ANNEX_RANK[b] || 0) - (ANNEX_RANK[a] || 0))[0]
}

// Tidy whitespace.
function cleanWs(s) {
  return s.replace(/\s+/g, ' ').trim()
}

// CosIng prints INCI names in ALL CAPS. Title-case them for display, preserving
// the cosmetic acronyms and anything with a digit (PEG-100, CI 77491, locants).
const ACRONYMS = new Set([
  'CI', 'PEG', 'PPG', 'PVP', 'PVM', 'VP', 'VA', 'EDTA', 'HEDTA', 'EDDS', 'SLS',
  'SLES', 'TEA', 'MEA', 'DEA', 'MIPA', 'AMP', 'PCA', 'BHT', 'BHA', 'DMDM',
  'PTFE', 'TBHQ', 'AHA', 'UV', 'SD', 'PG', 'TBH', 'MEK',
])
function titleInci(name) {
  return cleanWs(name)
    .split(' ')
    .map((w) => {
      if (/\d/.test(w) || ACRONYMS.has(w.toUpperCase())) return w
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

const text = readFileSync(CSV, 'utf-8')
const rows = parseCsv(text)
const headerIdx = rows.findIndex((r) => r[0] === 'COSING Ref No' && r[1] === 'INCI name')
if (headerIdx < 0) throw new Error('Could not find the CSV header row')

const col = { inci: 1, restriction: 7, function: 8 }
const out = []
const seen = new Set()
const stats = { total: 0, restricted: 0, byAnnex: {} }

for (const r of rows.slice(headerIdx + 1)) {
  const inci = titleInci(r[col.inci] || '')
  if (!inci) continue
  const key = inci.toLowerCase()
  if (seen.has(key)) continue
  seen.add(key)

  const annex = annexFromRestriction(r[col.restriction] || '')
  out.push({ inci, function: toTitle(cleanWs(r[col.function] || '')), annex })

  stats.total++
  if (annex !== 'none') {
    stats.restricted++
    stats.byAnnex[annex] = (stats.byAnnex[annex] || 0) + 1
  }
}

// CosIng functions are ALL CAPS ("SKIN CONDITIONING"); make them presentable.
function toTitle(s) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\s*,\s*/g, ', ')
}

writeFileSync(OUT, JSON.stringify(out), 'utf-8')
console.log(
  `[import-cosing] wrote ${out.length} ingredients -> data/cosing-full.json`,
)
console.log(`  restricted: ${stats.restricted}`, stats.byAnnex)
