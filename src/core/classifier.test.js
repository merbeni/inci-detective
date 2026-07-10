import { describe, it, expect, beforeAll } from 'vitest'
import {
  setDataset,
  matchIngredient,
  classifyToken,
  classifyList,
  looksLikeIngredientList,
  datasetMeta,
} from './classifier.js'
import { parseInciList } from './inciParse.js'

// Small fixture dataset — the classifier is exercised against this, not the
// bundled 28k catalogue, so tests stay fast and deterministic.
const FIXTURE = [
  { inci: 'Glycerin', norm: 'glycerin', annex: 'none', safety: 'safe', function: 'Humectant' },
  { inci: 'Phenoxyethanol', norm: 'phenoxyethanol', annex: 'V', safety: 'caution' },
  { inci: 'Formaldehyde', norm: 'formaldehyde', annex: 'II', safety: 'alert' },
  { inci: 'Aqua', norm: 'aqua', annex: 'none', safety: 'safe', common: 'Water' },
  { inci: 'SLS', norm: 'sls', annex: 'none', safety: 'caution' },
]

const META = {
  cosing_version: 'test-1',
  generatedAt: '2026-01-01',
  unknownLevel: 'caution',
  annexLabels: { II: 'Annex II — prohibited in cosmetics', none: 'Not regulated' },
}

beforeAll(() => {
  setDataset(FIXTURE, META)
})

describe('matchIngredient', () => {
  it('matches exactly with confidence 1', () => {
    const m = matchIngredient('glycerin')
    expect(m.entry.inci).toBe('Glycerin')
    expect(m.confidence).toBe(1)
  })

  it('fuzzy-matches a typo above the 0.85 threshold', () => {
    const m = matchIngredient('glycerine')
    expect(m.entry.inci).toBe('Glycerin')
    expect(m.confidence).toBeGreaterThanOrEqual(0.85)
    expect(m.confidence).toBeLessThan(1)
  })

  it('never fuzzy-matches names shorter than 5 chars (exact only)', () => {
    expect(matchIngredient('sls')).toMatchObject({ confidence: 1 })
    expect(matchIngredient('slz')).toBeNull() // 1 edit away, but too short
  })

  it('returns null when nothing clears the threshold', () => {
    expect(matchIngredient('completely unknown stuff')).toBeNull()
  })
})

describe('classifyToken', () => {
  it('classifies unknown ingredients as the unknownLevel (caution), never alert', () => {
    const [token] = parseInciList('Unknownium Extract')
    const item = classifyToken(token)
    expect(item.unknown).toBe(true)
    expect(item.safety).toBe('caution')
    expect(item.matchedInci).toBeNull()
  })

  it('resolves slash-separated synonyms through the alts keys', () => {
    // "Aqua/Water/Eau" normalizes to "aqua water eau" (no exact entry) but the
    // "aqua" alternative resolves against the dataset.
    const [token] = parseInciList('Aqua/Water/Eau')
    const item = classifyToken(token)
    expect(item.matchedInci).toBe('Aqua')
    expect(item.safety).toBe('safe')
  })

  it('resolves the annex label from the dataset map', () => {
    const [token] = parseInciList('Formaldehyde')
    const item = classifyToken(token)
    expect(item.annex).toBe('II')
    expect(item.annexLabel).toMatch(/prohibited/)
  })

  it('flags watchlisted ingredients', () => {
    const [token] = parseInciList('Phenoxyethanol')
    const item = classifyToken(token, new Set(['phenoxyethanol']))
    expect(item.onWatchlist).toBe(true)
  })
})

describe('classifyList', () => {
  it('produces summary counts and the worst-level overall rating', () => {
    const tokens = parseInciList('Aqua, Glycerin, Phenoxyethanol, Formaldehyde, Unknownium')
    const { summary, overall } = classifyList(tokens)
    expect(summary).toMatchObject({ safe: 2, caution: 2, alert: 1, unknown: 1, total: 5 })
    expect(overall).toBe('alert')
  })

  it('rates caution when there is no alert', () => {
    const tokens = parseInciList('Aqua, Phenoxyethanol')
    expect(classifyList(tokens).overall).toBe('caution')
  })

  it('rates safe when everything is safe', () => {
    const tokens = parseInciList('Aqua, Glycerin')
    expect(classifyList(tokens).overall).toBe('safe')
  })

  it('counts watchlist hits', () => {
    const tokens = parseInciList('Aqua, Glycerin, Phenoxyethanol')
    const { watchlistHits } = classifyList(tokens, new Set(['glycerin', 'phenoxyethanol']))
    expect(watchlistHits).toBe(2)
  })
})

describe('looksLikeIngredientList', () => {
  it('accepts a real parsed label (mostly known ingredients)', () => {
    const { summary } = classifyList(parseInciList('Aqua, Glycerin, Phenoxyethanol, Unknownium'))
    expect(looksLikeIngredientList(summary)).toBe(true)
  })

  it('rejects OCR noise from a photo of something else (all unknown)', () => {
    const { summary } = classifyList(parseInciList('wrn kzt, peo xd, blorp fx, qee ss'))
    expect(looksLikeIngredientList(summary)).toBe(false)
  })

  it('rejects too-short parses and empty/missing summaries', () => {
    const { summary } = classifyList(parseInciList('Aqua, Glycerin'))
    expect(looksLikeIngredientList(summary)).toBe(false) // < 3 tokens
    expect(looksLikeIngredientList(null)).toBe(false)
    expect(looksLikeIngredientList({ total: 0, unknown: 0 })).toBe(false)
  })
})

describe('setDataset', () => {
  it('updates the exported datasetMeta', () => {
    expect(datasetMeta.version).toBe('test-1')
    expect(datasetMeta.count).toBe(FIXTURE.length)
  })
})
