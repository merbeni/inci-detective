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

// Makeup labels list their pigments in a "may contain" block: "[+/- CI 77891,
// CI 77491]" (or "MAY CONTAIN:", "PUEDE CONTENER:"). Those ARE ingredients —
// unwrap the block into the list instead of discarding it. Brackets that don't
// look like an ingredient run (no comma/slash/CI code) stay for the per-token
// batch-code strip below.
const MAY_CONTAIN =
  /\b(?:may contain|puede contener|peut contenir|pu[oò] contenere|kann enthalten)\b\s*:?/gi
const INGREDIENT_BRACKET = /\bci\s*\d{5}\b|[,/]/i

export function parseInciList(raw) {
  if (!raw) return []
  let text = extractIngredientSection(raw)

  // Chemical numbering uses commas/dots that are NOT separators
  // ("1,2-Hexanediol", "0.5%") — swap them for sentinels before splitting,
  // restore after.
  text = text
    .replace(/(\d)\s*,\s*(\d)/g, '$1@@$2')
    .replace(/(\d)\.(\d)/g, '$1##$2')
    .replace(/\+\/-|±/g, ' ')
    .replace(MAY_CONTAIN, ',')
    .replace(/\[([^\]]*)\]/g, (m, inner) =>
      INGREDIENT_BRACKET.test(inner) ? `,${inner},` : m,
    )

  // Newlines, bullets, semicolons and full stops are separators alongside
  // commas — minimalist labels write "Avene Aqua. Nitrogen." with periods.
  const parts = text
    .split(/[,;.•·\n\r]+/)
    .map((p) => p.replace(/@@/g, ',').replace(/##/g, '.'))
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
