// Product-category context layer.
//
// The classifier maps CosIng annexes to risk levels blindly — Annex VI (an
// allowed UV filter) always reads "caution", even when it's the expected
// active ingredient in a sunscreen. This module detects the product category
// (from its name, or failing that from the ingredient list itself) and lets
// the UI annotate — and in narrow, well-justified cases adjust — ingredients
// that are exactly what you'd expect to find there.

import { normalizeName } from './inciParse.js'

// Matched against the normalized product name (lowercased, diacritics
// stripped by normalizeName), so accented and plain forms both hit the same
// pattern. Checked in priority order: sunscreen > makeup > rinseoff.
const NAME_PATTERNS = {
  sunscreen:
    /\b(?:spf|fps)\s*\d*\b|\bsunscreen\b|\bsunblock\b|\bprotector solar\b|\bproteccion solar\b|\bfotoprotector\b|\bbloqueador\b/,
  makeup:
    /\bmakeup\b|\bmaquillaje\b|\bfoundation\b|\bbase de maquillaje\b|\blabial\b|\blipstick\b|\blip ?gloss\b|\bmascara\b|\brimel\b|\beyeliner\b|\bdelineador\b|\beyeshadow\b|\bsombra\b|\bblush\b|\brubor\b|\bbronzer\b|\bconcealer\b|\bcorrector\b|\bbb cream\b|\bcc cream\b|\besmalte\b|\bnail polish\b|\bpowder\b|\bpolvo compacto\b/,
  rinseoff:
    /\bshampoo\b|\bchampu\b|\bconditioner\b|\bacondicionador\b|\bjabon\b|\bsoap\b|\bbody wash\b|\bshower gel\b|\bgel de ducha\b|\bgel de bano\b|\bcleanser\b|\blimpiador\b|\bface wash\b|\bdesmaquillante\b|\bmakeup remover\b|\bexfoliante\b|\bscrub\b|\bmascarilla\b|\benjuague\b|\brinse ?off\b/,
}

// Note on the makeup "mascara" pattern: normalizeName already strips
// diacritics, so "máscara"/"mascara" both reduce to "mascara". The `\b`
// after it is what excludes "mascarilla" — "mascara" is a prefix of
// "mascarilla" but there's no word boundary between the "a" and the "i".

export function detectCategory({ productName, items } = {}) {
  const name = normalizeName(productName || '')
  if (name) {
    if (NAME_PATTERNS.sunscreen.test(name)) return 'sunscreen'
    if (NAME_PATTERNS.makeup.test(name)) return 'makeup'
    if (NAME_PATTERNS.rinseoff.test(name)) return 'rinseoff'
  }

  // No signal from the name (or no name at all) — fall back to what the
  // ingredient list itself suggests.
  const list = items || []
  const uvUpFront = list.filter((it) => ingredientRole(it) === 'uv' && it.position <= 6)
  if (uvUpFront.length >= 1) return 'sunscreen'
  const colorants = list.filter((it) => ingredientRole(it) === 'colorant')
  if (colorants.length >= 3) return 'makeup'
  const surfactantsUpFront = list.filter(
    (it) => ingredientRole(it) === 'surfactant' && it.position <= 4,
  )
  if (surfactantsUpFront.length >= 1) return 'rinseoff'

  return null
}

// Which functional role a classified item plays, independent of category —
// used both for the fallback detection above and for applyContext below.
export function ingredientRole(item) {
  if (item.annex === 'VI' || /uv (filter|absorber)/i.test(item.function || '')) return 'uv'
  if (item.annex === 'V' || /preservative/i.test(item.function || '')) return 'preservative'
  if (item.annex === 'IV' || /colorant/i.test(item.function || '')) return 'colorant'
  if (/cleansing/i.test(item.function || '')) return 'surfactant'
  return null
}

// Annotate (and, narrowly, re-score) items given the detected category.
// Returns a new array — items that gain a context are shallow-cloned, items
// that don't are passed through untouched, so callers never see a mutated
// input.
export function applyContext(items, category) {
  return items.map((item) => {
    // Alert-level items (e.g. Annex II, prohibited) must never carry a
    // reassuring context line — "allowed and expected" next to a red badge
    // contradicts itself.
    if (item.unknown || item.safety === 'alert') return item
    const role = ingredientRole(item)
    if (!role) return item

    if (role === 'uv' && (category === 'sunscreen' || category === 'makeup')) {
      const next = { ...item, context: 'uvExpected' }
      // Only promote the plain "allowed UV filter" case — a curated concern
      // flag (e.g. oxybenzone's) means someone already decided this one
      // deserves scrutiny beyond "it's Annex VI", so it stays caution.
      if (item.safety === 'caution' && item.annex === 'VI' && !(item.concern?.length)) {
        next.safety = 'safe'
        next.score = 78
      }
      return next
    }

    // Preservatives are context-worthy in any category (including no
    // detected category) — approved and expected wherever there's water.
    if (role === 'preservative') {
      return { ...item, context: 'preservative' }
    }

    if (role === 'colorant' && category === 'makeup') {
      return { ...item, context: 'colorantExpected' }
    }

    if (role === 'surfactant' && category === 'rinseoff' && item.concern?.includes('sensitivity')) {
      return { ...item, context: 'rinseoff', score: Math.min(100, (item.score ?? 0) + 12) }
    }

    return item
  })
}
