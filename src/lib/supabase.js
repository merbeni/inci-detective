// Supabase client. If the env vars are absent the app stays fully offline/local
// and every cloud call becomes a no-op (isCloudEnabled === false).

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isCloudEnabled = Boolean(url && anonKey)

export const supabase = isCloudEnabled
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

// Authorization header for the Worker endpoints (/api/ai, /api/search): a
// signed-in user's JWT gets them the full per-user rate limit instead of the
// shared anonymous quota. Empty when signed out — auth there is optional.
export async function authHeaders() {
  if (!isCloudEnabled) return {}
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}
