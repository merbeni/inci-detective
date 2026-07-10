// GET /share/:shareId — server-side Open Graph preview for shared analyses.
//
// The app is a SPA, so WhatsApp/Telegram/Facebook link scrapers (which don't
// run JS) would otherwise see a blank page and render a bare URL. Vercel
// rewrites /share/* to this Worker:
//   - link-preview bots get a tiny HTML page with OG tags built from the
//     shared scan (public read via Supabase REST + anon key, RLS-guarded);
//   - real browsers get the SPA shell proxied from APP_ORIGIN, so the React
//     app takes over at the same URL.

const BOT_UA =
  /bot|crawler|spider|whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|pinterest|vkshare|skypeuripreview|preview/i

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

// Spanish by default — the app's target market; the scraper never tells us the
// reader's language anyway.
const OVERALL_LABEL = { safe: 'Seguro', caution: 'Precaución', alert: 'Alerta' }

async function fetchSharedScan(env, shareId) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null
  const url =
    `${env.SUPABASE_URL}/rest/v1/scans` +
    `?share_id=eq.${encodeURIComponent(shareId)}&is_public=eq.true` +
    '&select=product_name,brand,overall,summary&limit=1'
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows?.[0] || null
}

function ogHtml({ title, description, pageUrl, appOrigin }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="INCI Detective">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(appOrigin)}/icon.svg">
<meta name="twitter:card" content="summary">
<meta name="description" content="${esc(description)}">
</head>
<body>
<p>${esc(title)} — ${esc(description)}</p>
<a href="${esc(pageUrl)}">Abrir en INCI Detective</a>
</body>
</html>`
}

export async function handleShare(request, env) {
  const url = new URL(request.url)
  const shareId = url.pathname.split('/').filter(Boolean)[1] || ''
  const appOrigin = env.APP_ORIGIN || url.origin
  const pageUrl = `${appOrigin}/share/${shareId}`
  const isBot = BOT_UA.test(request.headers.get('User-Agent') || '')

  // Humans get the SPA shell at the same URL; React Router renders the scan.
  if (!isBot) {
    const shell = await fetch(`${appOrigin}/index.html`)
    return new Response(shell.body, {
      status: shell.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const scan = shareId ? await fetchSharedScan(env, shareId).catch(() => null) : null

  let title = 'INCI Detective'
  let description = 'Escaneá productos cosméticos y conocé el riesgo de cada ingrediente.'
  if (scan) {
    const name = scan.product_name || 'Producto'
    title = `${name}${scan.brand ? ` · ${scan.brand}` : ''} — INCI Detective`
    const s = scan.summary || {}
    const counts = [
      s.safe != null ? `${s.safe} seguros` : '',
      s.caution ? `${s.caution} precaución` : '',
      s.alert ? `${s.alert} alerta` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    description = `Análisis: ${OVERALL_LABEL[scan.overall] || 'Precaución'}${counts ? ` — ${counts}` : ''}`
  }

  return new Response(ogHtml({ title, description, pageUrl, appOrigin }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Let the edge cache bot fetches for a bit; the scan summary rarely changes.
      'Cache-Control': 'public, max-age=300',
    },
  })
}
