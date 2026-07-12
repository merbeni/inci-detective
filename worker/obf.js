// POST /api/obf — contributes a product (barcode + name + brand + ingredient
// list) to Open Beauty Facts via its write API.
//
// The OBF account credentials (OBF_USER_ID / OBF_PASSWORD) live only in the
// Worker's encrypted secrets, never in the client bundle — this route is the
// only thing allowed to use them.

import { json } from './util.js'

const UA = 'INCIDetective/1.0 (https://inci-detective.vercel.app)'
const CODE_RE = /^\d{8,14}$/
const LANGS = new Set(['es', 'en', 'pt'])

export async function handleObf(request, env, cors) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400, cors)
  }

  const code = String(body.code || '')
  const ingredientsText = String(body.ingredientsText || '')
  const productName = String(body.productName ?? '')
  const brand = String(body.brand ?? '')
  const lang = LANGS.has(body.lang) ? body.lang : 'en'

  if (!CODE_RE.test(code)) return json({ error: 'bad_request' }, 400, cors)
  if (!ingredientsText || ingredientsText.length > 6000) {
    return json({ error: 'bad_request' }, 400, cors)
  }
  if (productName.length > 200 || brand.length > 200) {
    return json({ error: 'bad_request' }, 400, cors)
  }

  // Feature deploys dark until the account secrets are configured.
  if (!env.OBF_USER_ID || !env.OBF_PASSWORD) {
    return json({ error: 'not_configured' }, 503, cors)
  }

  // Anti-clobber guard: don't overwrite a product that already has ingredients.
  // A failed/non-ok GET is treated as "unknown" rather than blocking the write —
  // OBF merges fields server-side, so a stale or missing read is safe to proceed on.
  let existing = null
  try {
    const getUrl =
      `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(code)}.json` +
      '?fields=code,product_name,brands,ingredients_text'
    const getRes = await fetch(getUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (getRes.ok) {
      const data = await getRes.json()
      if (data?.status === 1 && data.product) existing = data.product
    }
  } catch {
    existing = null // network failure — treat as unknown, proceed with the write
  }

  if (existing && existing.ingredients_text && existing.ingredients_text.trim()) {
    return json({ ok: true, status: 'already_complete' }, 200, cors)
  }

  const form = new URLSearchParams({
    code,
    user_id: env.OBF_USER_ID,
    password: env.OBF_PASSWORD,
    ingredients_text: ingredientsText,
    comment: 'Contributed via INCI Detective',
  })
  // Never overwrite existing OBF name/brand — only fill them in when missing.
  if (!existing || !existing.product_name) form.set('product_name', productName)
  if (!existing || !existing.brands) form.set('brands', brand)
  // Only meaningful for a brand-new product; an existing one keeps its own lang.
  if (!existing) form.set('lang', lang)

  try {
    const writeRes = await fetch('https://world.openbeautyfacts.org/cgi/product_jqm2.pl', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    const result = await writeRes.json()
    if (result?.status === 1) return json({ ok: true, status: 'saved' }, 200, cors)
    return json({ error: 'obf_rejected', detail: result?.status_verbose }, 502, cors)
  } catch {
    return json({ error: 'obf_unreachable' }, 502, cors)
  }
}
