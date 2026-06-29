import { ShieldCheck, AlertTriangle, OctagonAlert } from 'lucide-react'
import './RiskBanner.css'

const OVERALL = {
  safe: { Icon: ShieldCheck, title: 'Looks gentle', sub: 'No flagged ingredients found' },
  caution: { Icon: AlertTriangle, title: 'Use with caution', sub: 'Some ingredients to be aware of' },
  alert: { Icon: OctagonAlert, title: 'Contains alerts', sub: 'One or more high-risk ingredients' },
}

// Risk Banner leads the analysis so the user gets the diagnosis before the
// detail (progressive disclosure, section 4.4).
export default function RiskBanner({ overall, summary, watchlistHits }) {
  const meta = OVERALL[overall] || OVERALL.caution
  const { Icon } = meta
  return (
    <div className={`riskbanner riskbanner--${overall}`}>
      <div className="riskbanner__head">
        <Icon size={30} strokeWidth={2.4} />
        <div>
          <div className="riskbanner__title">{meta.title}</div>
          <div className="riskbanner__sub">{meta.sub}</div>
        </div>
      </div>
      <div className="riskbanner__counts">
        <Count n={summary.safe} label="Safe" cls="safe" />
        <Count n={summary.caution} label="Caution" cls="caution" />
        <Count n={summary.alert} label="Alert" cls="alert" />
        <Count n={summary.unknown} label="Unknown" cls="unknown" />
      </div>
      {watchlistHits > 0 && (
        <div className="riskbanner__watch">
          ⚠ {watchlistHits} ingredient{watchlistHits > 1 ? 's' : ''} on your watchlist
        </div>
      )}
    </div>
  )
}

function Count({ n, label, cls }) {
  return (
    <div className="riskbanner__count">
      <span className={`dot dot--${cls}`} />
      <strong>{n}</strong>
      <span>{label}</span>
    </div>
  )
}
