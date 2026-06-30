// High-level analysis pipeline tying capture -> parse -> classify together.
// Used by the Scan and Manual-entry flows. Mirrors the state machine in 1.2:
// barcode lookup -> (found ? classify : OCR / manual fallback) -> classify.

import { lookupBarcode } from '../capture/openBeautyFacts.js'
import { parseInciList } from './inciParse.js'
import { classifyList } from './classifier.js'
import { watchlistNormSet } from '../db/db.js'
import { lookupCommunityProduct } from '../lib/sync.js'

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

  // 1. Open Beauty Facts has the full ingredient list — the richest source.
  if (lookup.found && lookup.hasIngredients) {
    const analysis = await analyzeIngredientsText(lookup.ingredientsText, {
      barcode: lookup.barcode,
      productName: lookup.productName,
      brand: lookup.brand,
      imageUrl: lookup.imageUrl,
      source: 'barcode',
    })
    return { status: 'ok', analysis }
  }

  // 2. Fall back to our own crowd-sourced catalogue — ingredients other users
  //    contributed (OCR/manual) for this barcode. Works signed-out (public
  //    read) and no-ops when offline or the product hasn't been contributed.
  const community = await lookupCommunityProduct(barcode).catch(() => null)
  if (community?.ingredientsText) {
    const analysis = await analyzeIngredientsText(community.ingredientsText, {
      barcode,
      productName: community.productName || lookup.productName || 'Unknown product',
      brand: community.brand || lookup.brand || '',
      imageUrl: lookup.imageUrl || '',
      source: 'community',
    })
    return { status: 'ok', analysis }
  }

  // 3. No ingredients anywhere — route the UI to the OCR / manual fallback.
  if (!lookup.found) {
    return { status: lookup.offline ? 'offline' : 'not_found', barcode }
  }
  return {
    status: 'no_ingredients',
    barcode,
    productName: lookup.productName,
    brand: lookup.brand,
    imageUrl: lookup.imageUrl,
  }
}
