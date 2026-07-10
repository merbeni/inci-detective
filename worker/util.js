// Shared helpers for the Cloudflare Worker routes.

export function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

export function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}
