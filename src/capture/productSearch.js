// Product/brand name search — lets a user type "cerave limpiadora" instead of
// scanning a barcode. Merges two sources: the app's own crowd-sourced
// catalogue (fast, works signed-out) and Open Beauty Facts (broad coverage,
// but LatAm products are thin — see capture/openBeautyFacts.js for context).

import { supabase, isCloudEnabled } from '../lib/supabase.js'

const MAX_RESULTS = 20
const COMMUNITY_LIMIT = 10
const OBF_SEARCH_URL = 'https://world.openbeautyfacts.org/cgi/search.pl'
const OBF_FIELDS = 'code,product_name,brands,image_front_small_url,ingredients_text'

// PostgREST's .or() filter splits on `,()` and uses `%` as the ilike wildcard,
// so a query containing those (or a stray backslash) would break the filter
// syntax or let the user smuggle in their own wildcard pattern. Strip them.
function sanitizeForOr(query) {
  return query.replace(/[,()%\\]/g, '').trim()
}

// Best-effort: any failure (offline, RLS, bad query) just yields no community
// hits rather than surfacing an error to the user.
async function searchCommunity(query) {
  if (!isCloudEnabled) return []
  const term = sanitizeForOr(query)
  if (term.length < 2) return []
  try {
    const { data, error } = await supabase
      .from('products')
      .select('barcode, product_name, brand, ingredients_text')
      .or(`product_name.ilike.%${term}%,brand.ilike.%${term}%`)
      .limit(COMMUNITY_LIMIT)
    if (error || !data) return []
    return data.map((row) => ({
      barcode: row.barcode,
      productName: row.product_name || '',
      brand: row.brand || '',
      imageUrl: '',
      ingredientsText: row.ingredients_text || '',
      fromCommunity: true,
    }))
  } catch {
    return []
  }
}

// Left unwrapped (no try/catch) so a genuine network failure rejects and
// Promise.allSettled below can tell "offline" apart from "no matches".
async function searchOpenBeautyFacts(query) {
  const url =
    `${OBF_SEARCH_URL}?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=${MAX_RESULTS}&fields=${OBF_FIELDS}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data.products)) return []
  return data.products.map((p) => ({
    barcode: p.code || '',
    productName: p.product_name || '',
    brand: p.brands || '',
    imageUrl: p.image_front_small_url || '',
    ingredientsText: p.ingredients_text || '',
    fromCommunity: false,
  }))
}

// Search both sources in parallel, merge (community first) and dedupe by
// barcode, capped at MAX_RESULTS.
export async function searchProducts(query) {
  const [communityResult, obfResult] = await Promise.allSettled([
    searchCommunity(query),
    searchOpenBeautyFacts(query),
  ])

  const community = communityResult.status === 'fulfilled' ? communityResult.value : []
  const obf = obfResult.status === 'fulfilled' ? obfResult.value : []

  const seen = new Set(community.map((r) => r.barcode).filter(Boolean))
  const merged = [...community]
  for (const row of obf) {
    if (row.barcode && seen.has(row.barcode)) continue
    if (row.barcode) seen.add(row.barcode)
    merged.push(row)
  }

  // Simple heuristic: nothing came back and the OBF fetch actually threw
  // (rather than just returning zero matches) — treat as offline when the
  // browser agrees, rather than showing a plain "no results" message.
  const networkFailed = obfResult.status === 'rejected'
  const offline = merged.length === 0 && networkFailed && !navigator.onLine

  return { results: merged.slice(0, MAX_RESULTS), offline }
}
