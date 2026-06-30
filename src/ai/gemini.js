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

const MODEL = 'gemini-2.0-flash'
const PROXY_URL = '/api/ai'

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
Keep it under 200 words.`
}

async function callDirect(prompt, apiKey, generationConfig) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: generationConfig || { temperature: 0.4, maxOutputTokens: 512 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini error ${res.status}`)
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callProxy(prompt, generationConfig) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: MODEL, generationConfig }),
  })
  if (!res.ok) throw new Error(`AI proxy error ${res.status}`)
  const data = await res.json()
  return data.text || ''
}

// Route a prompt to whichever Gemini path is configured (own key first, else the
// shared proxy). Low temperature for the deterministic tasks below.
function runGemini(prompt, profile, generationConfig) {
  return profile?.geminiKey
    ? callDirect(prompt, profile.geminiKey, generationConfig)
    : callProxy(prompt, generationConfig)
}

export async function analyzeWithAI(analysis, profile) {
  if (!navigator.onLine) {
    throw new Error('offline')
  }
  const prompt = buildPrompt(analysis, profile)
  const text = await runGemini(prompt, profile)
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

export async function cleanOcrTextWithAI(rawText, profile) {
  if (!navigator.onLine) throw new Error('offline')
  if (!rawText || !rawText.trim()) return ''
  const prompt = `${OCR_CLEAN_PROMPT}${rawText.trim()}\n"""`
  const text = await runGemini(prompt, profile, {
    temperature: 0.1,
    maxOutputTokens: 1024,
  })
  // Strip any stray quoting/markdown the model might add; keep a single line.
  return text
    .replace(/^```[a-z]*\n?|```$/gim, '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s*\n\s*/g, ', ')
    .trim()
}
