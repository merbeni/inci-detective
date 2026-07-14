// Cloudflare Worker entry — routes the app's server-side AI endpoints:
//   POST /api/ai      Gemini proxy (analysis, OCR cleanup, vision OCR)
//   POST /api/search  semantic ingredient search + optional RAG answer
//   POST /api/obf     Open Beauty Facts product contribution
//   POST /api/log     client error intake -> Workers Logs
//
// CORS is restricted to the app's origins (env.ALLOWED_ORIGIN, comma-separated).
// Deploy with `wrangler deploy`; bindings (AI, VECTORIZE) live in wrangler.toml
// and the GEMINI_API_KEY / OBF_USER_ID / OBF_PASSWORD are secrets.

import { json } from './util.js'
import { handleAi } from './ai.js'
import { handleSearch } from './search.js'
import { handleShare } from './share.js'
import { handleObf } from './obf.js'
import { handleLog } from './log.js'
import { verifySupabaseToken } from './auth.js'

// /api/ai and /api/search spend paid Gemini / Workers AI quota, so signed-in
// users (verified Supabase JWT) get the full per-user rate limit while
// anonymous callers share a smaller per-IP one. Auth stays optional — the app
// works signed-out — but a scraper without an account now hits a low ceiling.
const PAID_PATHS = new Set(['/api/ai', '/api/search'])

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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors })
    }

    // Rate limiting (bindings in wrangler.toml). CORS doesn't stop non-browser
    // clients and these endpoints spend real quota, so cap abuse at the edge.
    // Skipped gracefully if a binding isn't configured.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    let limiter = env.RATE_LIMITER
    let key = ip
    if (PAID_PATHS.has(pathname)) {
      const userId = await verifySupabaseToken(request, env)
      if (userId) {
        key = `user:${userId}` // per-user, full quota
      } else if (env.RATE_LIMITER_ANON) {
        limiter = env.RATE_LIMITER_ANON // anonymous: smaller shared quota
      }
    }
    if (limiter) {
      const { success } = await limiter.limit({ key })
      if (!success) {
        return json({ error: 'rate limited', message: 'Too many requests — slow down.' }, 429, cors)
      }
    }

    try {
      if (pathname === '/api/ai') return await handleAi(request, env, cors)
      if (pathname === '/api/search') return await handleSearch(request, env, cors)
      if (pathname === '/api/obf') return await handleObf(request, env, cors)
      if (pathname === '/api/log') return await handleLog(request, env, cors)
      return json({ error: 'not found' }, 404, cors)
    } catch (e) {
      // Surfaces in Workers Logs with the failing route.
      console.error(JSON.stringify({ event: 'worker_error', path: pathname, message: String(e?.message || e) }))
      return json({ error: 'worker error', message: String(e?.message || e) }, 500, cors)
    }
  },
}
