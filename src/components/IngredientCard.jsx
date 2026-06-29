import { Eye, EyeOff } from 'lucide-react'
import RiskBadge from './RiskBadge.jsx'
import './IngredientCard.css'

export default function IngredientCard({ item, onToggleWatch }) {
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
        {item.onWatchlist && (
          <div className="ingcard__watch">On your watchlist</div>
        )}
        {item.unknown ? (
          <div className="ingcard__note faint">Not in local dataset — shown as Caution by default.</div>
        ) : (
          <div className="ingcard__note faint">
            {item.annexLabel}
            {item.confidence < 1 && item.confidence > 0 && (
              <> · fuzzy match {Math.round(item.confidence * 100)}%</>
            )}
          </div>
        )}
        {item.note && <div className="ingcard__note">{item.note}</div>}
      </div>
      {onToggleWatch && (
        <button
          className="ingcard__eye"
          onClick={() => onToggleWatch(item)}
          aria-label={item.onWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
          title={item.onWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {item.onWatchlist ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
    </div>
  )
}
