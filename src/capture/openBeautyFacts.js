// Open Beauty Facts client — looks up a product's INCI list by barcode.
// Coverage in Latin America is lower than in Europe (critical point 3, 1.3), so
// callers must treat "not found" as a first-class fallback path, not an error.
//
// To maximise the chance of returning an ingredient list automatically we:
//  - request the ingredient text in several languages (LatAm products are often
//    only filled in es/pt), plus the generic and structured `ingredients` field;
//  - fall back to the sibling Open*Facts databases (Beauty → Products → Food),
//    since a barcode is occasionally registered in a different flavour.

// Ingredient text comes in many per-language variants; we try them in order and
// take the first non-empty one. English/Latin INCI is the same across languages,
// so any populated variant is usable by the classifier.
const ING_FIELDS = [
  'ingredients_text_en',
  'ingredients_text',
  'ingredients_text_es',
  'ingredients_text_pt',
  'ingredients_text_fr',
  'ingredients_text_it',
  'ingredients_text_de',
]

const FIELDS = [
  'product_name',
  'brands',
  'image_front_small_url',
  'code',
  'ingredients', // structured array, used when the flat text is empty
  ...ING_FIELDS,
].join(',')

// Tried in order. Beauty first (cosmetics), then Products and Food as fallbacks.
const SOURCES = [
  'https://world.openbeautyfacts.org/api/v2/product',
  'https://world.openproductsfacts.org/api/v2/product',
  'https://world.openfoodfacts.org/api/v2/product',
]

// Pull an ingredient string out of a product record, trying the flat text
// variants first and then reconstructing it from the structured array.
function extractIngredients(p) {
  for (const f of ING_FIELDS) {
    if (p[f] && p[f].trim()) return p[f].trim()
  }
  if (Array.isArray(p.ingredients) && p.ingredients.length) {
    const joined = p.ingredients
      .map((i) => i.text || i.id || '')
      .filter(Boolean)
      .join(', ')
    if (joined.trim()) return joined.trim()
  }
  return ''
}

async function querySource(base, barcode) {
  const url = `${base}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== 1 || !data.product) return null
  return data.product
}

export async function lookupBarcode(barcode) {
  let product = null
  let networkError = false
  // Walk the sources, but stop early as soon as we find one that actually has
  // an ingredient list — a bare name-only hit shouldn't block a richer one.
  for (const base of SOURCES) {
    let p = null
    try {
      p = await querySource(base, barcode)
    } catch {
      networkError = true // fetch throws on network failure (offline)
      continue
    }
    if (!p) continue
    if (!product) product = p // remember the first hit (at least a name)
    if (extractIngredients(p)) {
      product = p
      break
    }
  }

  // Nothing found: distinguish "offline" (all requests failed) from a genuine
  // miss so the UI can show the right fallback message.
  if (!product) return { found: false, offline: networkError }

  const ingredientsText = extractIngredients(product)
  return {
    found: true,
    barcode: product.code || barcode,
    productName: product.product_name || 'Unknown product',
    brand: product.brands || '',
    imageUrl: product.image_front_small_url || '',
    ingredientsText,
    hasIngredients: Boolean(ingredientsText),
  }
}
