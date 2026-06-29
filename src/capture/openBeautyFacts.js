// Open Beauty Facts client — looks up a product's INCI list by barcode.
// Coverage in Latin America is lower than in Europe (critical point 3, 1.3), so
// callers must treat "not found" as a first-class fallback path, not an error.

const BASE = 'https://world.openbeautyfacts.org/api/v2/product'

export async function lookupBarcode(barcode) {
  const url = `${BASE}/${encodeURIComponent(barcode)}.json?fields=product_name,brands,ingredients_text,ingredients_text_en,image_front_small_url,code`
  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    return { found: false, offline: true }
  }
  if (!res.ok) return { found: false }

  const data = await res.json()
  if (data.status !== 1 || !data.product) return { found: false }

  const p = data.product
  const ingredientsText = p.ingredients_text_en || p.ingredients_text || ''
  return {
    found: true,
    barcode: p.code || barcode,
    productName: p.product_name || 'Unknown product',
    brand: p.brands || '',
    imageUrl: p.image_front_small_url || '',
    ingredientsText,
    hasIngredients: Boolean(ingredientsText.trim()),
  }
}
