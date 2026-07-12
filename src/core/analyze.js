// High-level analysis pipeline tying capture -> parse -> classify together.
// Used by the Scan and Manual-entry flows. Mirrors the state machine in 1.2:
// barcode lookup -> (found ? classify : OCR / manual fallback) -> classify.

import { lookupBarcode } from '../capture/openBeautyFacts.js'
import { parseInciList } from './inciParse.js'
import { classifyList, ensureDataset } from './classifier.js'
import { watchlistNormSet, getLocalProduct } from '../db/db.js'
import { lookupCommunityProduct } from '../lib/sync.js'

export async function analyzeIngredientsText(text, meta = {}) {
  await ensureDataset()
  const tokens = parseInciList(text)
  const watch = await watchlistNormSet()
  const { items, summary, overall, watchlistHits, score } = classifyList(tokens, watch)
  return {
    barcode: meta.barcode || null,
    // Empty when unknown: the preview screen requires the user to name the
    // product before saving, so history never fills up with generic entries.
    productName: meta.productName || '',
    brand: meta.brand || '',
    imageUrl: meta.imageUrl || '',
    source: meta.source || 'manual',
    rawText: text,
    items,
    summary,
    overall,
    score,
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

  // 2. This device already knows the product — the user entered/OCR'd its
  //    ingredients before. Instant, offline, no account needed.
  const local = await getLocalProduct(barcode).catch(() => null)
  if (local?.ingredientsText) {
    const analysis = await analyzeIngredientsText(local.ingredientsText, {
      barcode,
      productName: local.productName || lookup.productName || '',
      brand: local.brand || lookup.brand || '',
      imageUrl: lookup.imageUrl || '',
      source: 'local',
    })
    return { status: 'ok', analysis }
  }

  // 3. Fall back to our own crowd-sourced catalogue — ingredients other users
  //    contributed (OCR/manual) for this barcode. Works signed-out (public
  //    read) and no-ops when offline or the product hasn't been contributed.
  const community = await lookupCommunityProduct(barcode).catch(() => null)
  if (community?.ingredientsText) {
    const analysis = await analyzeIngredientsText(community.ingredientsText, {
      barcode,
      productName: community.productName || lookup.productName || '',
      brand: community.brand || lookup.brand || '',
      imageUrl: lookup.imageUrl || '',
      source: 'community',
    })
    return { status: 'ok', analysis }
  }

  // 4. No ingredients anywhere — route the UI to the OCR / manual fallback.
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
