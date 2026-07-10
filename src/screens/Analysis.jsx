import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Trash2, Share2 } from 'lucide-react'
import {
  getScan,
  deleteScan,
  addWatchlistItem,
  removeWatchlistItem,
  watchlistNormSet,
  db,
  saveAiQuery,
} from '../db/db.js'
import { analyzeWithAI, describeAiError } from '../ai/gemini.js'
import { createShareLink } from '../lib/sync.js'
import { useApp } from '../context/AppContext.jsx'
import { t } from '../i18n/index.js'
import { personalFlagSet, countPersonalHits } from '../core/personal.js'
import RiskBanner from '../components/RiskBanner.jsx'
import IngredientCard from '../components/IngredientCard.jsx'
import './Analysis.css'

export default function Analysis() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, showToast, cloudEnabled, user } = useApp()
  const [scan, setScan] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [ai, setAi] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [sharing, setSharing] = useState(false)

  // Personal relevance: dataset concern flags the user's skin profile cares about.
  const personalFlags = useMemo(() => personalFlagSet(profile), [profile])

  useEffect(() => {
    let active = true
    Promise.all([getScan(id), watchlistNormSet()]).then(([s, watch]) => {
      if (!active) return
      if (!s) {
        setNotFound(true)
        return
      }
      // Re-sync the watchlist flags in case it changed since the scan.
      s.items = s.items.map((it) => ({ ...it, onWatchlist: watch.has(it.norm) }))
      s.watchlistHits = s.items.filter((it) => it.onWatchlist).length
      setScan(s)
    })
    return () => {
      active = false
    }
  }, [id])

  async function toggleWatch(item) {
    if (item.onWatchlist) {
      const all = await db.watchlist.where('norm').equals(item.norm).toArray()
      for (const w of all) await removeWatchlistItem(w.id)
      showToast(t('analysis.watchRemoved'))
    } else {
      await addWatchlistItem(item.norm, item.matchedInci || item.display)
      showToast(t('analysis.watchAdded'))
    }
    const watch = await watchlistNormSet()
    setScan((prev) => {
      const items = prev.items.map((it) => ({ ...it, onWatchlist: watch.has(it.norm) }))
      return { ...prev, items, watchlistHits: items.filter((i) => i.onWatchlist).length }
    })
  }

  async function runAi() {
    if (!profile.aiEnabled) {
      showToast(t('analysis.enableAiFirst'))
      navigate('/profile')
      return
    }
    setAiLoading(true)
    try {
      const result = await analyzeWithAI(scan, profile, {
        onRetry: ({ attempt, retries }) =>
          showToast(t('analysis.retrying', { attempt, retries })),
      })
      setAi(result.text)
      await saveAiQuery({ scanId: scan.id, model: result.model, response: result.text })
    } catch (e) {
      showToast(describeAiError(e))
    } finally {
      setAiLoading(false)
    }
  }

  async function handleShare() {
    if (!user) {
      showToast(t('analysis.signInToShare'))
      navigate('/auth')
      return
    }
    setSharing(true)
    try {
      const url = await createShareLink(scan.id)
      if (navigator.share) {
        await navigator.share({ title: scan.productName, url })
      } else {
        await navigator.clipboard.writeText(url)
        showToast(t('analysis.linkCopied'))
      }
    } catch (e) {
      if (e.name !== 'AbortError') showToast(t('analysis.shareFailed'))
    } finally {
      setSharing(false)
    }
  }

  async function handleDelete() {
    await deleteScan(scan.id)
    showToast(t('analysis.deleted'))
    navigate('/history', { replace: true })
  }

  if (notFound) {
    return (
      <div className="screen center">
        <p className="muted">{t('analysis.notFound')}</p>
        <button className="btn btn--outline" onClick={() => navigate('/')}>
          {t('analysis.goHome')}
        </button>
      </div>
    )
  }
  if (!scan) {
    return (
      <div className="screen center" style={{ display: 'grid', placeItems: 'center' }}>
        <span className="spinner" />
      </div>
    )
  }

  return (
    <div className="screen analysis">
      <header className="analysis__head">
        <button className="manual__back" onClick={() => navigate(-1)} aria-label={t('manual.back')}>
          <ArrowLeft size={22} />
        </button>
        <div className="analysis__titles">
          <h1>{scan.productName}</h1>
          {scan.brand && <span className="muted">{scan.brand}</span>}
        </div>
        <button className="analysis__del" onClick={handleDelete} aria-label={t('analysis.delete')}>
          <Trash2 size={18} />
        </button>
      </header>

      <RiskBanner
        overall={scan.overall}
        summary={scan.summary}
        watchlistHits={scan.watchlistHits}
        personalHits={countPersonalHits(scan.items, personalFlags)}
      />

      <div className="analysis__actions">
        <button className="btn btn--outline" onClick={runAi} disabled={aiLoading}>
          {aiLoading ? <span className="spinner" /> : <Sparkles size={18} />}
          {aiLoading ? t('analysis.aiAnalyzing') : t('analysis.aiButton')}
        </button>
        {cloudEnabled && (
          <button className="btn btn--outline" onClick={handleShare} disabled={sharing}>
            {sharing ? <span className="spinner" /> : <Share2 size={18} />}
            {t('analysis.share')}
          </button>
        )}
      </div>

      {ai && (
        <div className="analysis__ai">
          <div className="analysis__ai-head">
            <Sparkles size={16} /> {t('analysis.aiHead')}
          </div>
          <p>{ai}</p>
          <span className="faint analysis__ai-note">{t('analysis.aiNote')}</span>
        </div>
      )}

      <div className="analysis__list">
        <span className="eyebrow">{t('analysis.count', { n: scan.summary.total })}</span>
        {scan.items.map((item) => (
          <IngredientCard
            key={`${item.norm}-${item.position}`}
            item={item}
            onToggleWatch={toggleWatch}
            personalFlags={personalFlags}
          />
        ))}
      </div>
    </div>
  )
}
