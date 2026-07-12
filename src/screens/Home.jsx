import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, Keyboard, Search, Leaf, ChevronRight } from 'lucide-react'
import { listScans } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import RiskBadge from '../components/RiskBadge.jsx'
import { relativeDate } from '../core/format.js'
import { t, tn } from '../i18n/index.js'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()
  const { profile } = useApp()
  const [recent, setRecent] = useState([])

  useEffect(() => {
    listScans().then((s) => setRecent(s.slice(0, 3)))
  }, [])

  return (
    <div className="screen home">
      <header className="home__header">
        <div className="home__brand">
          <span className="home__logo">
            <Leaf size={20} strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="home__title">INCI Detective</h1>
            <p className="home__tagline">{t('home.tagline')}</p>
          </div>
        </div>
      </header>

      {profile.name && (
        <p className="home__greet">{t('home.greet', { name: profile.name })}</p>
      )}

      <button className="home__cta" onClick={() => navigate('/scan')}>
        <span className="home__cta-ring">
          <ScanLine size={40} strokeWidth={2.2} />
        </span>
        <span className="home__cta-label">{t('home.cta')}</span>
        <span className="home__cta-sub">{t('home.ctaSub')}</span>
      </button>

      <button className="btn btn--outline btn--block" onClick={() => navigate('/manual')}>
        <Keyboard size={18} /> {t('home.manual')}
      </button>

      <button
        className="btn btn--outline btn--block home__search-btn"
        onClick={() => navigate('/search')}
      >
        <Search size={18} /> {t('home.search')}
      </button>

      <section className="home__recent">
        <div className="home__recent-head">
          <span className="eyebrow">{t('home.recent')}</span>
          {recent.length > 0 && (
            <button className="home__seeall" onClick={() => navigate('/history')}>
              {t('home.seeAll')}
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="card center muted home__empty">{t('home.empty')}</div>
        ) : (
          <div className="home__recent-list">
            {recent.map((s) => (
              <button
                key={s.id}
                className="home__recent-item"
                onClick={() => navigate(`/analysis/${s.id}`)}
              >
                <div className="home__recent-info">
                  <span className="home__recent-name">{s.productName}</span>
                  <span className="home__recent-meta">
                    {tn('home.ingredients', s.summary.total)} · {relativeDate(s.createdAt)}
                  </span>
                </div>
                <RiskBadge level={s.overall} />
                <ChevronRight size={18} className="faint" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
