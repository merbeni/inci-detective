import { describe, it, expect } from 'vitest'
import { levenshtein, similarity } from './levenshtein.js'

describe('levenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(levenshtein('glycerin', 'glycerin')).toBe(0)
  })

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
    expect(levenshtein('', '')).toBe(0)
  })

  it('counts single edits', () => {
    expect(levenshtein('glycerin', 'glycerine')).toBe(1) // insertion
    expect(levenshtein('glycerin', 'glycerim')).toBe(1) // substitution
    expect(levenshtein('glycerin', 'glyceri')).toBe(1) // deletion
  })

  it('is symmetric (inputs are swapped internally for memory)', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('sitting', 'kitten')).toBe(3)
  })
})

describe('similarity', () => {
  it('is 1 for identical strings and for two empty strings', () => {
    expect(similarity('aqua', 'aqua')).toBe(1)
    expect(similarity('', '')).toBe(1)
  })

  it('is 0 for completely different same-length strings', () => {
    expect(similarity('abc', 'xyz')).toBe(0)
  })

  it('matches the classifier threshold expectations', () => {
    // One typo in a medium-length name stays above the 0.85 fuzzy threshold…
    expect(similarity('glycerin', 'glycerine')).toBeGreaterThanOrEqual(0.85)
    // …but a short name with one edit falls below it (why MIN_FUZZY_LEN exists).
    expect(similarity('sls', 'als')).toBeLessThan(0.85)
  })
})
