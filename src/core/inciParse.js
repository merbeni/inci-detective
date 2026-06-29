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

export function parseInciList(raw) {
  if (!raw) return []
  let text = String(raw)

  // Drop a leading "Ingredients:" / "Ingredientes:" label.
  text = text.replace(/^\s*ingredient(e)?s?\s*[:\-]/i, '')

  // Treat newlines, bullets and semicolons as separators alongside commas.
  const parts = text
    .split(/[,;•·\n\r]+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const seen = new Set()
  const result = []
  parts.forEach((display, index) => {
    // Strip trailing percentage / parenthetical concentration notes.
    const clean = display.replace(/\([^)]*\)/g, '').replace(/\d+(\.\d+)?\s*%/g, '').trim()
    const norm = normalizeName(clean)
    if (!norm || norm.length < 2) return
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
