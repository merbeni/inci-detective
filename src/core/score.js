// Numeric 1-100 scoring, derived from the same signals as the three risk
// levels but with more resolution: two "caution" products are rarely equal —
// one has a lone preservative at the tail, the other three allergens up top.
//
// Ingredient score: base by safety level, pulled down by curated concern
// flags. Product score: concentration-weighted average (INCI order ~ higher
// position = more of it) with a hard cap when an Alert ingredient is present,
// so a long tail of safe fillers can never dilute a prohibited substance into
// a good-looking number.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

// Base score per safety level. "unknown" (not in the catalogue) sits between
// safe and caution — absence of evidence, not evidence of risk.
const BASE = { safe: 92, caution: 55, alert: 20 }
const UNKNOWN_SCORE = 65
const ANNEX_II_SCORE = 8 // prohibited in cosmetics — floor it
const CONCERN_PENALTY = 6 // per curated concern flag (max 2 counted)

export function scoreIngredient(item) {
  if (item.unknown) return UNKNOWN_SCORE
  if (item.annex === 'II') return ANNEX_II_SCORE
  let s = BASE[item.safety] ?? UNKNOWN_SCORE
  s -= Math.min(2, item.concern?.length || 0) * CONCERN_PENALTY
  return clamp(Math.round(s), 1, 100)
}

// INCI order is concentration order: weight ingredient i by 1/sqrt(position)
// so the top of the list dominates without making the tail irrelevant.
export function scoreProduct(items) {
  if (!items?.length) return null
  let num = 0
  let den = 0
  let hasAlert = false
  let alertOnTop = false
  items.forEach((item, i) => {
    const position = item.position > 0 ? item.position : i + 1
    const w = 1 / Math.sqrt(position)
    num += (item.score ?? scoreIngredient(item)) * w
    den += w
    if (item.safety === 'alert') {
      hasAlert = true
      if (position <= 5) alertOnTop = true
    }
  })
  let s = Math.round(num / den)
  if (alertOnTop) s = Math.min(s, 39)
  else if (hasAlert) s = Math.min(s, 49)
  return clamp(s, 1, 100)
}

// Map a score to the app's existing color language (safe/caution/alert).
export function scoreBand(score) {
  if (score == null) return 'caution'
  if (score >= 75) return 'safe'
  if (score >= 50) return 'caution'
  return 'alert'
}
