import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Leaf } from 'lucide-react'
import { fetchSharedScan } from '../lib/sync.js'
import { isCloudEnabled } from '../lib/supabase.js'
import { t, tn } from '../i18n/index.js'
import RiskBanner from '../components/RiskBanner.jsx'
import IngredientCard from '../components/IngredientCard.jsx'
import './Analysis.css'

// Public, read-only view of a shared analysis. No auth, no onboarding gate.
export default function Shared() {
  const { shareId } = useParams()
  const navigate = useNavigate()
  const [scan, setScan] = useState(null)
  // loading | ok | missing — starts at missing when there's no cloud to ask.
  const [state, setState] = useState(isCloudEnabled ? 'loading' : 'missing')

  useEffect(() => {
    if (!isCloudEnabled) return
    fetchSharedScan(shareId).then((s) => {
      if (s) {
        setScan(s)
        setState('ok')
      } else {
        setState('missing')
      }
    })
  }, [shareId])

  if (state === 'loading') {
    return (
      <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>
        <span className="spinner" />
      </div>
    )
  }

  if (state === 'missing') {
    return (
      <div className="screen center">
        <p className="muted">{t('shared.unavailable')}</p>
        <button className="btn btn--primary" onClick={() => navigate('/')}>
          {t('shared.open')}
        </button>
      </div>
    )
  }

  return (
    <div className="screen analysis">
      <header className="analysis__head">
        <span className="auth__logo" style={{ width: 40, height: 40 }}>
          <Leaf size={20} strokeWidth={2.4} />
        </span>
        <div className="analysis__titles">
          <h1>{scan.productName}</h1>
          {scan.brand && <span className="muted">{scan.brand}</span>}
        </div>
      </header>

      <div className="card center muted" style={{ marginBottom: 16, fontSize: 13 }}>
        {t('shared.readonly')}
      </div>

      <RiskBanner
        overall={scan.overall}
        summary={scan.summary}
        watchlistHits={0}
      />

      <div className="analysis__list">
        <span className="eyebrow">{tn('analysis.count', scan.summary.total)}</span>
        {scan.items.map((item) => (
          <IngredientCard key={`${item.norm}-${item.position}`} item={{ ...item, onWatchlist: false }} />
        ))}
      </div>

      <button
        className="btn btn--primary btn--block btn--lg"
        style={{ marginTop: 20 }}
        onClick={() => navigate('/')}
      >
        {t('shared.cta')}
      </button>
    </div>
  )
}
