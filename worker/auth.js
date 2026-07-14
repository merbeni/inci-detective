// Supabase JWT verification for the paid endpoints (/api/ai, /api/search).
//
// The token is validated against Supabase Auth itself (GET /auth/v1/user) —
// this works regardless of how the project signs its JWTs (legacy HS256 secret
// or the newer asymmetric keys) and needs no key material in the Worker.
// Verified tokens are cached in isolate memory for a few minutes so bursts
// (retry loops, RAG follow-ups) don't pay the round-trip every time.
//
// Auth is OPTIONAL by design: anonymous callers still get a small quota (see
// index.js). Requiring it outright would brick older clients that don't send
// the Authorization header yet.

const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX = 500

const cache = new Map() // token -> { userId, until }

// Returns the Supabase user id for a valid bearer token, or null.
export async function verifySupabaseToken(request, env) {
  const header = request.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null

  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) return hit.userId

  let userId = null
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const user = await res.json()
      userId = user?.id || null
    }
  } catch {
    userId = null // Supabase unreachable — treat the caller as anonymous
  }

  if (userId) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
    cache.set(token, { userId, until: Date.now() + CACHE_TTL_MS })
  }
  return userId
}
