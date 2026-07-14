// Minimal real-user error monitoring. Unhandled errors and promise rejections
// are reported (fire-and-forget) to the Worker's /api/log, which prints them
// into Cloudflare Workers Logs — no third-party service, no PII, nothing
// blocks the UI. Production builds only: local dev already has the console.

const MAX_REPORTS = 5 // per page load — a render loop must not flood the intake
const seen = new Set()
let sent = 0

function report(message, stack) {
  if (!import.meta.env.PROD || sent >= MAX_REPORTS) return
  const key = String(message).slice(0, 120)
  if (seen.has(key)) return
  seen.add(key)
  sent += 1
  try {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(message).slice(0, 600),
        stack: String(stack || '').slice(0, 600),
        url: location.pathname,
        release: import.meta.env.VITE_APP_VERSION || '',
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* never let the reporter itself throw */
  }
}

export function initMonitor() {
  window.addEventListener('error', (e) => {
    report(e.message || 'window.onerror', e.error?.stack)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    report(r?.message || String(r ?? 'unhandledrejection'), r?.stack)
  })
}

// React render errors don't reach window.onerror (the boundary catches them
// first) — ErrorBoundary calls this explicitly.
export function reportError(error) {
  report(error?.message || String(error), error?.stack)
}
