// Cloudflare Worker entry — routes the app's server-side AI endpoints:
//   POST /api/ai      Gemini proxy (analysis, OCR cleanup, vision OCR)
//   POST /api/search  semantic ingredient search + optional RAG answer
//   POST /api/obf     Open Beauty Facts product contribution
//
// CORS is restricted to the app's origins (env.ALLOWED_ORIGIN, comma-separated).
// Deploy with `wrangler deploy`; bindings (AI, VECTORIZE) live in wrangler.toml
// and the GEMINI_API_KEY / OBF_USER_ID / OBF_PASSWORD are secrets.

import { json } from './util.js'
import { handleAi } from './ai.js'
import { handleSearch } from './search.js'
import { handleShare } from './share.js'
import { handleObf } from './obf.js'

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)

    // Server-rendered OG previews for shared analyses (GET, no CORS needed —
    // Vercel rewrites /share/* here so link scrapers get real meta tags).
    if (request.method === 'GET' && pathname.startsWith('/share/')) {
      return handleShare(request, env)
    }

    const origin = request.headers.get('Origin') || ''
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim())
    const corsOrigin = allowed.includes(origin) ? origin : allowed[0] || '*'
    const cors = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors })
    }

    // Per-IP rate limit (binding in wrangler.toml). These endpoints spend real
    // Gemini / Workers AI quota and CORS doesn't stop non-browser clients, so
    // cap abuse at the edge. Skipped gracefully if the binding isn't configured.
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const { success } = await env.RATE_LIMITER.limit({ key: ip })
      if (!success) {
        return json({ error: 'rate limited', message: 'Too many requests — slow down.' }, 429, cors)
      }
    }

    try {
      if (pathname === '/api/ai') return await handleAi(request, env, cors)
      if (pathname === '/api/search') return await handleSearch(request, env, cors)
      if (pathname === '/api/obf') return await handleObf(request, env, cors)
      return json({ error: 'not found' }, 404, cors)
    } catch (e) {
      return json({ error: 'worker error', message: String(e?.message || e) }, 500, cors)
    }
  },
}
