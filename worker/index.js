// Cloudflare Worker entry — routes the app's server-side AI endpoints:
//   POST /api/ai      Gemini proxy (analysis, OCR cleanup, vision OCR)
//   POST /api/search  semantic ingredient search + optional RAG answer
//
// CORS is restricted to the app's origins (env.ALLOWED_ORIGIN, comma-separated).
// Deploy with `wrangler deploy`; bindings (AI, VECTORIZE) live in wrangler.toml
// and the GEMINI_API_KEY is a secret.

import { json } from './util.js'
import { handleAi } from './ai.js'
import { handleSearch } from './search.js'

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

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors })
    }

    const { pathname } = new URL(request.url)
    try {
      if (pathname === '/api/ai') return await handleAi(request, env, cors)
      if (pathname === '/api/search') return await handleSearch(request, env, cors)
      return json({ error: 'not found' }, 404, cors)
    } catch (e) {
      return json({ error: 'worker error', message: String(e?.message || e) }, 500, cors)
    }
  },
}
