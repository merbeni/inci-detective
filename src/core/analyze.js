// High-level analysis pipeline tying capture -> parse -> classify together.
// Used by the Scan and Manual-entry flows. Mirrors the state machine in 1.2:
// barcode lookup -> (found ? classify : OCR / manual fallback) -> classify.

import { lookupBarcode } from '../capture/openBeautyFacts.js'
import { parseInciList } from './inciParse.js'
import { classifyList } from './classifier.js'
import { watchlistNormSet } from '../db/db.js'

export async function analyzeIngredientsText(text, meta = {}) {
  const tokens = parseInciList(text)
  const watch = await watchlistNormSet()
  const { items, summary, overall, watchlistHits } = classifyList(tokens, watch)
  return {
    barcode: meta.barcode || null,
    productName: meta.productName || 'Manual entry',
    brand: meta.brand || '',
    imageUrl: meta.imageUrl || '',
    source: meta.source || 'manual',
    rawText: text,
    items,
    summary,
    overall,
    watchlistHits,
  }
}

// Look up a barcode in Open Beauty Facts. Returns either an analysis (when the
// product and its INCI list are found) or a structured fallback signal so the
// UI can route to OCR / manual ingredient entry.
export async function analyzeBarcode(barcode) {
  const lookup = await lookupBarcode(barcode)

  if (!lookup.found) {
    return { status: lookup.offline ? 'offline' : 'not_found', barcode }
  }
  if (!lookup.hasIngredients) {
    return {
      status: 'no_ingredients',
      barcode,
      productName: lookup.productName,
      brand: lookup.brand,
      imageUrl: lookup.imageUrl,
    }
  }

  const analysis = await analyzeIngredientsText(lookup.ingredientsText, {
    barcode: lookup.barcode,
    productName: lookup.productName,
    brand: lookup.brand,
    imageUrl: lookup.imageUrl,
    source: 'barcode',
  })
  return { status: 'ok', analysis }
}
