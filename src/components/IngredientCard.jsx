import { Eye, EyeOff, Sparkle } from 'lucide-react'
import RiskBadge from './RiskBadge.jsx'
import { t, translateFunction, translateNote } from '../i18n/index.js'
import { isPersonallyRelevant, isHighConcentration } from '../core/personal.js'
import { scoreIngredient, scoreBand } from '../core/score.js'
import './IngredientCard.css'

// Annexes with a translated label; anything else falls back to the label the
// dataset shipped (English), so an unexpected code still shows something.
const KNOWN_ANNEXES = new Set(['II', 'III', 'IV', 'V', 'VI', 'none'])

export default function IngredientCard({ item, onToggleWatch, personalFlags }) {
  const personal = isPersonallyRelevant(item, personalFlags)
  // Concentration hint only where it changes the reading: a flagged (or
  // personally relevant) ingredient near the top of the INCI list.
  const highConc = isHighConcentration(item) && (item.safety !== 'safe' || personal)
  const watchLabel = item.onWatchlist ? t('ingcard.removeWatch') : t('ingcard.addWatch')
  const annexLabel = KNOWN_ANNEXES.has(item.annex) ? t(`annex.${item.annex}`) : item.annexLabel
  const fn = translateFunction(item.function)
  // Scans saved before the scoring feature carry no per-item score — derive it.
  const score = item.score ?? scoreIngredient(item)

  return (
    <div className={`ingcard ingcard--${item.safety}`}>
      <span className={`ingcard__bar dot--${item.safety}`} />
      <div className="ingcard__body">
        <div className="ingcard__top">
          <span className="ingcard__name">{item.matchedInci || item.display}</span>
          <span className="ingcard__badges">
            <span
              className={`ingcard__score ingcard__score--${scoreBand(score)}`}
              title={t('ingcard.scoreHint')}
            >
              {score}
            </span>
            <RiskBadge level={item.safety} />
          </span>
        </div>
        {(item.common || fn) && (
          <div className="ingcard__meta">
            {item.common && <span>{item.common}</span>}
            {item.common && fn && <span className="ingcard__sep">·</span>}
            {fn && <span>{fn}</span>}
          </div>
        )}
        {item.context && (
          <div
            className={`ingcard__context${
              item.context === 'uvExpected' || item.context === 'colorantExpected'
                ? ' ingcard__context--expected'
                : ''
            }`}
          >
            {t('context.' + item.context)}
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
            {annexLabel}
            {item.confidence < 1 && item.confidence > 0 && (
              <> · {t('ingcard.fuzzy', { pct: Math.round(item.confidence * 100) })}</>
            )}
          </div>
        )}
        {item.note && <div className="ingcard__note">{translateNote(item.note)}</div>}
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
