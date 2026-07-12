import { describe, it, expect } from 'vitest'
import { scoreIngredient, scoreProduct, scoreBand } from './score.js'

const item = (over = {}) => ({
  safety: 'safe',
  annex: 'none',
  concern: [],
  unknown: false,
  position: 1,
  ...over,
})

describe('scoreIngredient', () => {
  it('scores by safety level: safe > caution > alert', () => {
    const safe = scoreIngredient(item())
    const caution = scoreIngredient(item({ safety: 'caution' }))
    const alert = scoreIngredient(item({ safety: 'alert' }))
    expect(safe).toBeGreaterThan(caution)
    expect(caution).toBeGreaterThan(alert)
    expect(safe).toBeLessThanOrEqual(100)
    expect(alert).toBeGreaterThanOrEqual(1)
  })

  it('floors Annex II (prohibited) ingredients', () => {
    expect(scoreIngredient(item({ safety: 'alert', annex: 'II' }))).toBeLessThan(10)
  })

  it('penalizes concern flags', () => {
    const clean = scoreIngredient(item({ safety: 'caution' }))
    const flagged = scoreIngredient(item({ safety: 'caution', concern: ['sensitivity'] }))
    expect(flagged).toBeLessThan(clean)
  })

  it('gives unknowns a neutral mid score', () => {
    const s = scoreIngredient(item({ unknown: true, safety: 'caution' }))
    expect(s).toBeGreaterThan(scoreIngredient(item({ safety: 'caution' })))
    expect(s).toBeLessThan(scoreIngredient(item()))
  })
})

describe('scoreProduct', () => {
  it('returns null for empty lists', () => {
    expect(scoreProduct([])).toBeNull()
    expect(scoreProduct(null)).toBeNull()
  })

  it('weights early (high-concentration) ingredients more', () => {
    const cautionFirst = scoreProduct([
      item({ safety: 'caution', position: 1 }),
      item({ position: 2 }),
      item({ position: 3 }),
    ])
    const cautionLast = scoreProduct([
      item({ position: 1 }),
      item({ position: 2 }),
      item({ safety: 'caution', position: 3 }),
    ])
    expect(cautionLast).toBeGreaterThan(cautionFirst)
  })

  it('caps the score when an alert ingredient is present', () => {
    const items = Array.from({ length: 20 }, (_, i) => item({ position: i + 1 }))
    items.push(item({ safety: 'alert', position: 21 }))
    expect(scoreProduct(items)).toBeLessThanOrEqual(49)
  })

  it('caps harder when the alert is in the top 5', () => {
    const items = [item({ safety: 'alert', position: 1 })]
    for (let i = 2; i <= 20; i++) items.push(item({ position: i }))
    expect(scoreProduct(items)).toBeLessThanOrEqual(39)
  })

  it('an all-safe product scores high', () => {
    const s = scoreProduct([item(), item({ position: 2 })])
    expect(s).toBeGreaterThanOrEqual(85)
  })
})

describe('scoreBand', () => {
  it('maps scores to the risk color language', () => {
    expect(scoreBand(90)).toBe('safe')
    expect(scoreBand(60)).toBe('caution')
    expect(scoreBand(30)).toBe('alert')
    expect(scoreBand(null)).toBe('caution')
  })
})
