import { describe, it, expect, beforeAll } from 'vitest'
import { detectCategory, ingredientRole, applyContext } from './category.js'
import { setDataset, classifyList } from './classifier.js'
import { parseInciList } from './inciParse.js'

// Fixture for the classifyList integration test — separate from
// classifier.test.js's own fixture (each test file gets its own module
// instance, so setDataset here doesn't affect other files).
const FIXTURE = [
  { inci: 'Zinc Oxide', norm: 'zinc oxide', annex: 'VI', safety: 'caution', function: 'UV filter' },
  { inci: 'Aqua', norm: 'aqua', annex: 'none', safety: 'safe', common: 'Water' },
  { inci: 'Glycerin', norm: 'glycerin', annex: 'none', safety: 'safe', function: 'Humectant' },
]

const META = {
  cosing_version: 'test-1',
  generatedAt: '2026-01-01',
  unknownLevel: 'caution',
  annexLabels: {},
}

beforeAll(() => {
  setDataset(FIXTURE, META)
})

const item = (over = {}) => ({
  safety: 'caution',
  annex: 'none',
  concern: [],
  unknown: false,
  score: 55,
  position: 1,
  ...over,
})

describe('detectCategory — name-based', () => {
  it('detects sunscreen from FPS/SPF, with or without a digit run', () => {
    expect(detectCategory({ productName: 'Protector Solar FPS 50', items: [] })).toBe('sunscreen')
    expect(detectCategory({ productName: 'Anthelios SPF50', items: [] })).toBe('sunscreen')
  })

  it('detects makeup', () => {
    expect(detectCategory({ productName: 'Base de maquillaje', items: [] })).toBe('makeup')
  })

  it('detects rinse-off', () => {
    expect(detectCategory({ productName: 'Shampoo nutritivo', items: [] })).toBe('rinseoff')
  })

  it('does not mistake mascarilla (rinse-off) for mascara (makeup)', () => {
    expect(detectCategory({ productName: 'Mascarilla capilar', items: [] })).toBe('rinseoff')
  })

  it('returns null when the name gives no signal and there are no items', () => {
    expect(detectCategory({ productName: 'Crema hidratante', items: [] })).toBeNull()
  })
})

describe('detectCategory — ingredient-signal fallback', () => {
  it('detects sunscreen from a UV-filter role item near the top of the list', () => {
    const items = [
      item({ annex: 'none', position: 1 }),
      item({ annex: 'VI', function: 'UV filter', position: 2 }),
    ]
    expect(detectCategory({ productName: '', items })).toBe('sunscreen')
  })
})

describe('ingredientRole', () => {
  it('resolves uv/preservative/colorant/surfactant from annex or function', () => {
    expect(ingredientRole(item({ annex: 'VI' }))).toBe('uv')
    expect(ingredientRole(item({ annex: 'V' }))).toBe('preservative')
    expect(ingredientRole(item({ annex: 'IV' }))).toBe('colorant')
    expect(ingredientRole(item({ annex: 'none', function: 'Cleansing agent' }))).toBe('surfactant')
    expect(ingredientRole(item({ annex: 'none' }))).toBeNull()
  })
})

describe('applyContext', () => {
  it('promotes a plain (no curated concern) annex-VI caution item to safe in sunscreen', () => {
    const uv = item({ annex: 'VI', safety: 'caution' })
    const [out] = applyContext([uv], 'sunscreen')
    expect(out.safety).toBe('safe')
    expect(out.score).toBe(78)
    expect(out.context).toBe('uvExpected')
  })

  it('keeps a curated-concern annex-VI item at caution but still tags it', () => {
    const uv = item({ annex: 'VI', safety: 'caution', concern: ['sensitivity'] })
    const [out] = applyContext([uv], 'sunscreen')
    expect(out.safety).toBe('caution')
    expect(out.context).toBe('uvExpected')
  })

  it('tags an annex-V preservative in any category without changing safety', () => {
    const preservative = item({ annex: 'V', safety: 'caution' })
    const [out] = applyContext([preservative], null)
    expect(out.context).toBe('preservative')
    expect(out.safety).toBe('caution')
  })

  it('does not mutate the input array or its items', () => {
    const uv = item({ annex: 'VI', safety: 'caution' })
    const input = [uv]
    applyContext(input, 'sunscreen')
    expect(input[0]).toBe(uv)
    expect(uv.safety).toBe('caution')
    expect(uv.context).toBeUndefined()
  })
})

describe('classifyList integration', () => {
  it('promotes zinc oxide in a detected sunscreen and reflects it in the summary/category', () => {
    const tokens = parseInciList('Zinc Oxide, Aqua, Glycerin')
    const result = classifyList(tokens, new Set(), { productName: 'Protector solar FPS 30' })
    expect(result.category).toBe('sunscreen')
    const zinc = result.items.find((i) => i.norm === 'zinc oxide')
    expect(zinc.safety).toBe('safe')
    expect(zinc.context).toBe('uvExpected')
    expect(result.summary.caution).toBe(0)
  })
})
