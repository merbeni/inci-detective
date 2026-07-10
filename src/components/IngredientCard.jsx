import { Eye, EyeOff, Sparkle } from 'lucide-react'
import RiskBadge from './RiskBadge.jsx'
import { t } from '../i18n/index.js'
import { isPersonallyRelevant, isHighConcentration } from '../core/personal.js'
import './IngredientCard.css'

export default function IngredientCard({ item, onToggleWatch, personalFlags }) {
  const personal = isPersonallyRelevant(item, personalFlags)
  // Concentration hint only where it changes the reading: a flagged (or
  // personally relevant) ingredient near the top of the INCI list.
  const highConc = isHighConcentration(item) && (item.safety !== 'safe' || personal)
  const watchLabel = item.onWatchlist ? t('ingcard.removeWatch') : t('ingcard.addWatch')

  return (
    <div className={`ingcard ingcard--${item.safety}`}>
      <span className={`ingcard__bar dot--${item.safety}`} />
      <div className="ingcard__body">
        <div className="ingcard__top">
          <span className="ingcard__name">{item.matchedInci || item.display}</span>
          <RiskBadge level={item.safety} />
        </div>
        {(item.common || item.function) && (
          <div className="ingcard__meta">
            {item.common && <span>{item.common}</span>}
            {item.common && item.function && <span className="ingcard__sep">·</span>}
            {item.function && <span>{item.function}</span>}
          </div>
        )}
        {personal && (
          <div className="ingcard__watch">
            <Sparkle size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
            {t('ingcard.personal')}
          </div>
        )}
        {highConc && <div className="ingcard__note">{t('ingcard.topConcentration')}</div>}
        {item.onWatchlist && <div className="ingcard__watch">{t('ingcard.onWatchlist')}</div>}
        {item.unknown ? (
          <div className="ingcard__note faint">{t('ingcard.unknownNote')}</div>
        ) : (
          <div className="ingcard__note faint">
            {item.annexLabel}
            {item.confidence < 1 && item.confidence > 0 && (
              <> · {t('ingcard.fuzzy', { pct: Math.round(item.confidence * 100) })}</>
            )}
          </div>
        )}
        {item.note && <div className="ingcard__note">{item.note}</div>}
      </div>
      {onToggleWatch && (
        <button
          className="ingcard__eye"
          onClick={() => onToggleWatch(item)}
          aria-label={watchLabel}
          title={watchLabel}
        >
          {item.onWatchlist ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
    </div>
  )
}
