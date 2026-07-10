import { describe, it, expect } from 'vitest'
import { normalizeName, extractIngredientSection, parseInciList } from './inciParse.js'

describe('normalizeName', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeName('  Sodium   Laureth-Sulfate ')).toBe('sodium laureth sulfate')
  })

  it('strips diacritics', () => {
    expect(normalizeName('Açaí Extráct')).toBe('acai extract')
  })

  it('turns slashes and symbols into spaces', () => {
    expect(normalizeName('Aqua/Water/Eau')).toBe('aqua water eau')
  })
})

describe('extractIngredientSection', () => {
  it('takes the text after the "Ingredients:" label', () => {
    const raw = 'Directions: apply daily. Ingredients: Aqua, Glycerin'
    expect(extractIngredientSection(raw)).toBe('Aqua, Glycerin')
  })

  it('uses the LAST label (skips "Active ingredient" blocks on OTC labels)', () => {
    const raw = 'Active ingredient: Zinc Oxide 20%. Inactive ingredients: Aqua, Glycerin'
    expect(extractIngredientSection(raw)).toBe('Aqua, Glycerin')
  })

  it('survives OCR-mangled labels like "sgredients:"', () => {
    const raw = 'blah blah sgredients: Aqua, Glycerin'
    expect(extractIngredientSection(raw)).toBe('Aqua, Glycerin')
  })

  it('recognises Spanish/German labels', () => {
    expect(extractIngredientSection('Composición: Aqua, Glycerin')).toBe('Aqua, Glycerin')
    expect(extractIngredientSection('Inhaltsstoffe: Aqua, Glycerin')).toBe('Aqua, Glycerin')
  })

  it('cuts trailing manufacturer / web boilerplate', () => {
    const raw = 'Ingredients: Aqua, Glycerin Manufactured in France www.brand.com'
    expect(extractIngredientSection(raw)).toBe('Aqua, Glycerin')
  })

  it('keeps the whole text when no label was read (tight close-up)', () => {
    expect(extractIngredientSection('Aqua, Glycerin, Parfum')).toBe('Aqua, Glycerin, Parfum')
  })
})

describe('parseInciList', () => {
  it('returns [] for empty input', () => {
    expect(parseInciList('')).toEqual([])
    expect(parseInciList(null)).toEqual([])
  })

  it('splits on commas, semicolons, newlines and bullets', () => {
    const tokens = parseInciList('Aqua, Glycerin; Niacinamide\nParfum • Limonene')
    expect(tokens.map((t) => t.norm)).toEqual([
      'aqua',
      'glycerin',
      'niacinamide',
      'parfum',
      'limonene',
    ])
  })

  it('strips parenthetical notes and percentages', () => {
    const tokens = parseInciList('Niacinamide (4%), Salicylic Acid 2%')
    expect(tokens.map((t) => t.norm)).toEqual(['niacinamide', 'salicylic acid'])
  })

  it('deduplicates repeated ingredients', () => {
    const tokens = parseInciList('Aqua, Glycerin, Aqua')
    expect(tokens).toHaveLength(2)
  })

  it('drops leftover prose (tokens longer than 5 words)', () => {
    const tokens = parseInciList('Aqua, this product was tested under dermatological control')
    expect(tokens.map((t) => t.norm)).toEqual(['aqua'])
  })

  it('keeps slash-separated synonyms as alternative keys', () => {
    const [token] = parseInciList('Aqua/Water/Eau')
    expect(token.norm).toBe('aqua water eau')
    expect(token.alts).toEqual(['aqua', 'water', 'eau'])
  })

  it('assigns 1-based positions', () => {
    const tokens = parseInciList('Aqua, Glycerin')
    expect(tokens[0].position).toBe(1)
    expect(tokens[1].position).toBe(2)
  })
})
