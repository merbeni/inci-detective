// Cloudflare Worker — reverse proxy for the Gemini API.
//
// Implements the "protect the API key without a server" decision (1.3/1.4):
// the Google AI Studio key lives only in the Worker's encrypted environment
// variables (set via `wrangler secret put GEMINI_API_KEY`), never in the client
// bundle. CORS is restricted to the Pages domain.
//
// Deploy: route this Worker at /api/ai on the same zone as the Pages site, or
// bind it as a Pages Function. Free tier covers the project's expected load.

const MODEL = 'gemini-2.0-flash'

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim())
    const corsOrigin = allowed.includes(origin) ? origin : allowed[0] || '*'

    const cors = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'invalid body' }, 400, cors)
    }
    const prompt = (body.prompt || '').toString().slice(0, 8000)
    if (!prompt) return json({ error: 'missing prompt' }, 400, cors)

    // Honor a caller-supplied generationConfig, clamped to safe bounds (the OCR
    // cleanup task needs more output tokens and a lower temperature than chat).
    const reqCfg = body.generationConfig || {}
    const generationConfig = {
      temperature: clamp(Number(reqCfg.temperature ?? 0.4), 0, 1),
      maxOutputTokens: clamp(Math.round(Number(reqCfg.maxOutputTokens ?? 512)), 1, 2048),
    }

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig,
        }),
      },
    )

    if (!upstream.ok) {
      return json({ error: 'upstream error', status: upstream.status }, 502, cors)
    }
    const data = await upstream.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return json({ text, model: MODEL }, 200, cors)
  },
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}
