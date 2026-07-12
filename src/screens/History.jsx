import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Trash2 } from 'lucide-react'
import { listScans, deleteScan } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import RiskBadge from '../components/RiskBadge.jsx'
import { relativeDate } from '../core/format.js'
import { t, tn } from '../i18n/index.js'
import './History.css'

export default function History() {
  const navigate = useNavigate()
  const { showToast } = useApp()
  const [scans, setScans] = useState([])
  const [q, setQ] = useState('')
  // Two-tap delete: first tap arms the button ("Delete?"), second tap deletes.
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    listScans().then(setScans)
  }, [])

  useEffect(() => {
    if (!confirmId) return
    const timer = setTimeout(() => setConfirmId(null), 3500)
    return () => clearTimeout(timer)
  }, [confirmId])

  async function handleDelete(id) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setConfirmId(null)
    await deleteScan(id)
    setScans((prev) => prev.filter((s) => s.id !== id))
    showToast(t('analysis.deleted'))
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return scans
    return scans.filter(
      (s) =>
        s.productName.toLowerCase().includes(term) ||
        (s.brand || '').toLowerCase().includes(term),
    )
  }, [scans, q])

  return (
    <div className="screen history">
      <h1 className="history__title">{t('history.title')}</h1>

      <div className="history__search">
        <Search size={18} className="faint" />
        <input
          className="history__input"
          placeholder={t('history.search')}
          aria-label={t('history.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card center muted history__empty">
          {scans.length === 0 ? t('history.empty') : t('history.noMatches')}
        </div>
      ) : (
        <div className="history__list">
          {filtered.map((s) => (
            <div key={s.id} className="history__item">
              <button
                className="history__main"
                onClick={() => navigate(`/analysis/${s.id}`)}
              >
                <div className="history__info">
                  <span className="history__name">{s.productName}</span>
                  {s.brand && <span className="history__brand">{s.brand}</span>}
                  <span className="history__meta">
                    {tn('home.ingredients', s.summary.total)} · {relativeDate(s.createdAt)}
                  </span>
                </div>
                <RiskBadge level={s.overall} />
                <ChevronRight size={18} className="faint" />
              </button>
              <button
                className={`history__del ${confirmId === s.id ? 'is-armed' : ''}`}
                onClick={() => handleDelete(s.id)}
                aria-label={t('analysis.delete')}
              >
                {confirmId === s.id ? t('history.confirm') : <Trash2 size={16} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
