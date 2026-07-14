// POST /api/log — client-side error intake.
//
// The PWA reports unhandled errors here (src/lib/monitor.js); console.error in
// a Worker lands in Workers Logs ([observability] in wrangler.toml), which
// gives real-user error visibility without adding a third-party service. No
// response body, no storage — logs are the product.

import { json } from './util.js'

const MAX_FIELD = 600

const clip = (v) => String(v ?? '').slice(0, MAX_FIELD)

export async function handleLog(request, env, cors) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400, cors)
  }

  // Structured line so Workers Logs can filter on `event`.
  console.error(
    JSON.stringify({
      event: 'client_error',
      message: clip(body.message),
      stack: clip(body.stack),
      url: clip(body.url),
      release: clip(body.release),
      ua: clip(request.headers.get('User-Agent')),
      country: request.cf?.country || '',
    }),
  )
  return new Response(null, { status: 204, headers: cors })
}
