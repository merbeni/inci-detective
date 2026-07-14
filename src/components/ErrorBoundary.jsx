import { Component } from 'react'
import { t } from '../i18n/index.js'
import { reportError } from '../lib/monitor.js'

// vite-plugin-pwa runs in 'autoUpdate' mode, so a tab left open across a
// deploy is still running the old app shell while the server now only serves
// the new build's chunks. The next lazy route the user navigates to (see
// App.jsx's React.lazy routes) tries to dynamic-import a chunk URL that no
// longer exists, the import rejects, and with no boundary React would
// unmount the whole tree, leaving a blank screen until a manual refresh.
// This boundary detects that failure mode and reloads automatically once
// (guarded so a genuinely broken chunk can't loop forever), and otherwise
// shows a simple retry fallback.
const CHUNK_ERROR_RE =
  /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch/i
const RELOAD_KEY = 'errorBoundary.lastReload'
const RELOAD_COOLDOWN_MS = 60 * 1000

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    const isChunkError = CHUNK_ERROR_RE.test(error?.message || '')
    // Stale-deploy chunk errors are expected noise; report everything else.
    if (!isChunkError) reportError(error)
    if (isChunkError) {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
      if (Date.now() - last > RELOAD_COOLDOWN_MS) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
        window.location.reload()
      }
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen center" style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
          <p className="muted">{t('error.loadFailed')}</p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>
            {t('error.reload')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
