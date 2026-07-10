// Opt-in AI enrichment via Gemini 2.0 Flash (section 1.3/1.4).
//
// Two paths, in priority order:
//  1. A Cloudflare Worker reverse proxy at /api/ai — keeps the API key off the
//     client (the recommended production setup).
//  2. A user-supplied key calling Google AI Studio directly — the "each user
//     brings their own key" scaling decision from section 1.4. Used as a
//     fallback / for local development.
//
// Either way this only runs when the user explicitly enables it and there is
// connectivity. The core classification never depends on it.

import { t, getLang } from '../i18n/index.js'

// 2.5-flash: the 2.0 family no longer has a free tier (limit: 0 on free keys).
const MODEL = 'gemini-2.5-flash'
const PROXY_URL = '/api/ai'

// A classified AI error so callers can react (and retry) by KIND rather than
// parsing HTTP codes. `retryAfterMs` is set when the server tells us how long to
// wait (Gemini's RetryInfo / Retry-After header).
export class GeminiError extends Error {
  constructor(kind, message, { status, retryAfterMs } = {}) {
    super(message || kind)
    this.name = 'GeminiError'
    this.kind = kind // offline | rate_limit | quota | overloaded | internal | auth | bad_request | network | unknown
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

// Only transient conditions are worth retrying; auth/quota/bad_request are not.
const RETRYABLE = new Set(['rate_limit', 'overloaded', 'internal'])
// Don't block the UI on very long server-requested waits — surface those to the
// user instead ("try again in Ns").
const MAX_AUTO_WAIT_MS = 10_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseRetryDelay(details, res) {
  if (Array.isArray(details)) {
    for (const d of details) {
      const m = typeof d?.retryDelay === 'string' && d.retryDelay.match(/([\d.]+)s/)
      if (m) return Math.round(parseFloat(m[1]) * 1000)
    }
  }
  const h = res?.headers?.get?.('Retry-After')
  if (h && Number.isFinite(Number(h))) return Number(h) * 1000
  return null
}

// Turn a non-ok fetch Response (from Google directly or via our proxy, which
// forwards the upstream status + body) into a classified GeminiError.
async function errorFromResponse(res) {
  let body = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON error body */
  }
  const err = body?.error || {}
  const gstatus = err.status || ''
  const msg = (err.message || '').toLowerCase()
  const retryAfterMs = parseRetryDelay(err.details, res)
  const code = res.status

  if (code === 429 || gstatus === 'RESOURCE_EXHAUSTED') {
    // Per-day quota vs a short per-minute rate limit: only the latter is worth
    // auto-retrying. Heuristic: a daily message, or no short retry hint => quota.
    const daily = /per day|perday|daily/.test(msg)
    if (daily || !retryAfterMs) {
      return new GeminiError('quota', err.message, { status: code, retryAfterMs })
    }
    return new GeminiError('rate_limit', err.message, { status: code, retryAfterMs })
  }
  if (code === 503 || gstatus === 'UNAVAILABLE' || msg.includes('overloaded')) {
    return new GeminiError('overloaded', err.message, { status: code, retryAfterMs })
  }
  if (code === 500 || gstatus === 'INTERNAL') {
    return new GeminiError('internal', err.message, { status: code })
  }
  if (code === 403 || gstatus === 'PERMISSION_DENIED' || /api[_ ]?key/.test(msg)) {
    return new GeminiError('auth', err.message, { status: code })
  }
  if (code === 400) {
    return new GeminiError('bad_request', err.message, { status: code })
  }
  return new GeminiError('unknown', err.message || `HTTP ${code}`, { status: code })
}

// Retry transient failures with exponential backoff, honoring a server-supplied
// delay when present. `onRetry({ attempt, retries, waitMs, kind })` lets the UI
// show "retrying…". Non-retryable errors (and exhausted retries) re-throw.
async function withRetry(fn, { retries = 3, onRetry } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const kind = err?.kind
      const canRetry = RETRYABLE.has(kind) && attempt <= retries
      // A long server-requested wait: don't stall the UI — tell the user instead.
      if (canRetry && err.retryAfterMs && err.retryAfterMs > MAX_AUTO_WAIT_MS) throw err
      if (!canRetry) throw err
      const backoff = Math.min(MAX_AUTO_WAIT_MS, 500 * 2 ** (attempt - 1) + Math.random() * 300)
      const waitMs = err.retryAfterMs || backoff
      onRetry?.({ attempt, retries, waitMs, kind })
      await sleep(waitMs)
    }
  }
}

// A user-facing message for an AI error, keyed on its kind.
export function describeAiError(err) {
  switch (err?.kind) {
    case 'offline':
      return t('aiError.offline')
    case 'rate_limit': {
      const s = err.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : null
      return s ? t('aiError.rateLimit', { s }) : t('aiError.rateLimitNoWait')
    }
    case 'quota':
      return t('aiError.quota')
    case 'overloaded':
      return t('aiError.overloaded')
    case 'internal':
      return t('aiError.internal')
    case 'auth':
      return t('aiError.auth')
    case 'bad_request':
      return t('aiError.badRequest')
    default:
      return t('aiError.default')
  }
}

function buildPrompt(analysis, profile) {
  const { productName, brand, overall, summary, items } = analysis
  const flagged = items
    .filter((i) => i.safety !== 'safe')
    .slice(0, 25)
    .map((i) => `- ${i.matchedInci || i.display} (${i.safety}${i.function ? ', ' + i.function : ''})`)
    .join('\n')

  const skin = profile?.skinType ? `Skin type: ${profile.skinType}.` : ''
  const concerns = profile?.concerns?.length
    ? `Concerns: ${profile.concerns.join(', ')}.`
    : ''

  return `You are a cosmetic-ingredient assistant for a consumer skincare app.
Explain in plain, friendly language (no medical claims, no diagnosis) what the
flagged ingredients in this product mean for the user.

Product: ${productName}${brand ? ' by ' + brand : ''}.
Overall local rating: ${overall}. Counts: ${summary.safe} safe, ${summary.caution} caution, ${summary.alert} alert, ${summary.unknown} unknown.
${skin} ${concerns}

Flagged ingredients:
${flagged || '(none flagged)'}

Respond with:
1. A 2-3 sentence overall take.
2. A short bullet list explaining the most relevant flagged ingredients.
3. One practical tip tailored to the user's skin profile if provided.
Keep it under 200 words.
Respond in ${getLang() === 'es' ? 'Spanish (rioplatense-neutral, informal "vos/tú" ok)' : 'English'}.`
}

async function callDirect(parts, apiKey, generationConfig) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      // Key in a header, not the query string, so it never lands in URL logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: generationConfig || { temperature: 0.4, maxOutputTokens: 512 },
      }),
    })
  } catch {
    throw new GeminiError('network', 'Could not reach Gemini')
  }
  if (!res.ok) throw await errorFromResponse(res)
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callProxy(parts, generationConfig) {
  let res
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts, model: MODEL, generationConfig }),
    })
  } catch {
    throw new GeminiError('network', 'Could not reach the AI service')
  }
  if (!res.ok) throw await errorFromResponse(res)
  const data = await res.json()
  return data.text || ''
}

// Route content to whichever Gemini path is configured (own key first, else the
// shared proxy). Accepts either a plain prompt string (text task) or a ready-made
// `parts` array (e.g. text + inline image for vision). Transient failures are
// retried with backoff; `options.onRetry` surfaces the wait to the UI.
function runGemini(input, profile, generationConfig, options = {}) {
  const parts = typeof input === 'string' ? [{ text: input }] : input
  const call = () =>
    profile?.geminiKey
      ? callDirect(parts, profile.geminiKey, generationConfig)
      : callProxy(parts, generationConfig)
  return withRetry(call, { onRetry: options.onRetry })
}

export async function analyzeWithAI(analysis, profile, options = {}) {
  if (!navigator.onLine) throw new GeminiError('offline', 'offline')
  const prompt = buildPrompt(analysis, profile)
  const text = await runGemini(prompt, profile, undefined, options)
  return { text, model: MODEL, prompt }
}

// Reconstruct an INCI ingredient list from noisy OCR text. Cosmetic labels read
// from a photo come back mangled (speckle misread as "©/$4/oS", truncated words);
// the local classifier can't match those. Gemini corrects the obvious OCR errors
// and returns a clean comma-separated INCI list we can parse and classify.
const OCR_CLEAN_PROMPT = `You are an OCR post-processor for cosmetic ingredient labels.
Below is raw, noisy OCR text from a photo of a product label. It may contain
directions, warnings and manufacturer info mixed in with the ingredient list.

Task:
- Output ONLY the cosmetic ingredient list (INCI names), in order.
- Correct obvious OCR errors to the correct INCI name (e.g. "G'yeol"->"Glycol",
  "erasodium EDTA"->"Tetrasodium EDTA", "O'efera"->"Oleifera", "Sodium Hyde"->
  "Sodium Hyaluronate") ONLY when you are confident of the intended ingredient.
- Drop noise fragments, batch codes, percentages and non-ingredient text.
- Return a single line of comma-separated INCI names. No numbering, no commentary,
  no markdown. If you cannot find an ingredient list, return an empty string.

Raw OCR text:
"""
`

export async function cleanOcrTextWithAI(rawText, profile, options = {}) {
  if (!navigator.onLine) throw new GeminiError('offline', 'offline')
  if (!rawText || !rawText.trim()) return ''
  const prompt = `${OCR_CLEAN_PROMPT}${rawText.trim()}\n"""`
  const text = await runGemini(prompt, profile, { temperature: 0.1, maxOutputTokens: 1024 }, options)
  return cleanInciLine(text)
}

// Read the ingredient list straight from the photo. Gemini is multimodal, so
// letting it see the label beats running Tesseract first and then repairing the
// mangled text: there's no lossy OCR step in between. This is the preferred
// online path; on-device Tesseract stays the offline fallback.
const OCR_IMAGE_PROMPT = `You are reading a photo of a cosmetic product label.
Extract ONLY the cosmetic ingredient list (INCI names), in the order printed.
- Ignore directions, warnings, marketing copy, batch codes and manufacturer info.
- Fix distortions from the photo (glare, curved surface, small print) to the
  intended INCI name ONLY when you are confident of the ingredient.
- Return a single line of comma-separated INCI names. No numbering, no markdown,
  no commentary. If the image has no ingredient list, return an empty string.`

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Phone photos run 5-15 MB — past the proxy's upload cap, so sending them raw
// makes the AI path fail and silently fall back to noisy on-device OCR. Label
// text is still perfectly readable at ~1600px, so downscale + re-encode first;
// uploads get ~20x smaller and faster too.
const MAX_IMAGE_SIDE = 1600

async function imageToInlineData(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close?.()
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    const data = dataUrl.split(',')[1] || ''
    if (data) return { mimeType: 'image/jpeg', data }
  } catch {
    /* createImageBitmap (or its EXIF option) unsupported — fall through */
  }
  return { mimeType: file.type || 'image/jpeg', data: await fileToBase64(file) }
}

export async function ocrImageWithAI(file, profile, options = {}) {
  if (!navigator.onLine) throw new GeminiError('offline', 'offline')
  if (!file) return ''
  const inlineData = await imageToInlineData(file)
  const parts = [{ text: OCR_IMAGE_PROMPT }, { inlineData }]
  const text = await runGemini(parts, profile, { temperature: 0.1, maxOutputTokens: 1024 }, options)
  return cleanInciLine(text)
}

// Normalize a model reply down to one clean comma-separated INCI line.
function cleanInciLine(text) {
  return text
    .replace(/^```[a-z]*\n?|```$/gim, '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s*\n\s*/g, ', ')
    .trim()
}
