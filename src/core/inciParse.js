// Parse a raw INCI list (from Open Beauty Facts or OCR) into normalized tokens.
// INCI lists are comma- or semicolon-separated; OCR often introduces newlines,
// stray bullets and the "Ingredients:" prefix.

export function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// On a full-label photo the OCR text is mostly NOT ingredients — it's
// directions, warnings and manufacturer info. The real list is introduced by an
// "Ingredients:" label (in several languages) and ends where the maker/distributor
// boilerplate begins. Slice out just that section so we don't classify noise.
// Keyed on the "dient" core followed by a separator — the part of the
// "Ingredients:" label that best survives OCR mangling (seen as "sgredients:",
// "<dients:", etc.). Also covers es/fr/it ("…dientes/dienti") and de labels.
const ING_LABEL =
  /(?:\w*dient\w*|inhaltsstoffe|composici[oó]n|composition)\s*[:;.-]\s*/gi
const END_MARKER =
  /\b(?:manufactured|distributed|made\s+in|imported|marketed\s+by|produced\s+by|www\.|https?:\/\/|directions?\s*:|warnings?\s*:|caution\s*:|for\s+external\s+use)\b/i

export function extractIngredientSection(raw) {
  let text = String(raw)
  // Take everything after the LAST "Ingredients:" label (handles OTC drug
  // labels with an earlier "Active Ingredient:" block). If no label was read
  // (e.g. a tight close-up of just the list), keep the whole text.
  let lastEnd = -1
  for (const m of text.matchAll(ING_LABEL)) lastEnd = m.index + m[0].length
  if (lastEnd >= 0) text = text.slice(lastEnd)
  // Cut trailing manufacturer / distributor / web boilerplate.
  const end = text.match(END_MARKER)
  if (end) text = text.slice(0, end.index)
  return text.trim()
}

export function parseInciList(raw) {
  if (!raw) return []
  const text = extractIngredientSection(raw)

  // Treat newlines, bullets and semicolons as separators alongside commas.
  const parts = text
    .split(/[,;•·\n\r]+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const seen = new Set()
  const result = []
  parts.forEach((display, index) => {
    // Strip parenthetical/bracketed notes (concentrations, batch codes) and %.
    const clean = display
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]?/g, '') // closed or unclosed (OCR'd batch codes)
      .replace(/\d+(\.\d+)?\s*%/g, '')
      .trim()
    const norm = normalizeName(clean)
    if (!norm || norm.length < 2) return
    // Drop leftover prose: real INCI names are short (≤5 words). Longer tokens
    // are OCR-captured sentences (warnings, "Manufactured in the USA…") that
    // slipped past the section slice.
    if (norm.split(' ').length > 5) return
    if (seen.has(norm)) return
    seen.add(norm)
    // Combined synonyms like "Aqua/Water/Eau" — keep each variant as an
    // alternative key so any of them can resolve to a dataset entry.
    const alts = clean
      .split('/')
      .map((p) => normalizeName(p))
      .filter((p) => p && p.length >= 2)
    result.push({ display: clean || display, norm, alts, position: index + 1 })
  })
  return result
}
