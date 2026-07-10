import { ShieldCheck, AlertTriangle, OctagonAlert } from 'lucide-react'
import { t, tn } from '../i18n/index.js'
import './RiskBanner.css'

const ICONS = {
  safe: ShieldCheck,
  caution: AlertTriangle,
  alert: OctagonAlert,
}

// Risk Banner leads the analysis so the user gets the diagnosis before the
// detail (progressive disclosure, section 4.4).
export default function RiskBanner({ overall, summary, watchlistHits, personalHits = 0 }) {
  const lvl = ICONS[overall] ? overall : 'caution'
  const Icon = ICONS[lvl]
  return (
    <div className={`riskbanner riskbanner--${lvl}`}>
      <div className="riskbanner__head">
        <Icon size={30} strokeWidth={2.4} />
        <div>
          <div className="riskbanner__title">{t(`banner.${lvl}.title`)}</div>
          <div className="riskbanner__sub">{t(`banner.${lvl}.sub`)}</div>
        </div>
      </div>
      <div className="riskbanner__counts">
        <Count n={summary.safe} label={t('badge.safe')} cls="safe" />
        <Count n={summary.caution} label={t('badge.caution')} cls="caution" />
        <Count n={summary.alert} label={t('badge.alert')} cls="alert" />
        <Count n={summary.unknown} label={t('badge.unknown')} cls="unknown" />
      </div>
      {watchlistHits > 0 && (
        <div className="riskbanner__watch">{tn('banner.watchlist', watchlistHits)}</div>
      )}
      {personalHits > 0 && (
        <div className="riskbanner__watch">{tn('banner.personal', personalHits)}</div>
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
