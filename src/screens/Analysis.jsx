import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Sparkles, Trash2, Share2, Save } from 'lucide-react'
import {
  getScan,
  saveScan,
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
import { t, tn } from '../i18n/index.js'
import { personalFlagSet, countPersonalHits } from '../core/personal.js'
import { scoreProduct } from '../core/score.js'
import RiskBanner from '../components/RiskBanner.jsx'
import IngredientCard from '../components/IngredientCard.jsx'
import AiText from '../components/AiText.jsx'
import './Analysis.css'

export default function Analysis() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, showToast, cloudEnabled, user } = useApp()

  // Preview mode (/analysis/new): a just-computed, NOT yet persisted analysis
  // handed over via router state. The user reviews it, names the product
  // (required) and explicitly saves — nothing lands in history on its own.
  const isPreview = id === 'new'
  const previewAnalysis = isPreview ? location.state?.analysis : null

  // In preview the analysis is already in hand — no async load needed.
  const [scan, setScan] = useState(() => (isPreview ? previewAnalysis || null : null))
  const [notFound, setNotFound] = useState(() => isPreview && !previewAnalysis)
  const [ai, setAi] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [name, setName] = useState(previewAnalysis?.productName || '')
  const [saving, setSaving] = useState(false)

  // Personal relevance: dataset concern flags the user's skin profile cares about.
  const personalFlags = useMemo(() => personalFlagSet(profile), [profile])

  useEffect(() => {
    // Preview state is initialized synchronously above; navigating from
    // /analysis/new to the saved /analysis/:id re-runs this and loads from db.
    if (isPreview) return
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      showToast(t('analysis.nameRequired'))
      return
    }
    setSaving(true)
    try {
      const saved = await saveScan({ ...scan, productName: trimmed })
      // An AI explanation requested while still in preview had no scan id to
      // attach to — link it now that the scan exists.
      if (ai) {
        await saveAiQuery({ scanId: saved.id, model: ai.model, response: ai.text }).catch(
          () => {},
        )
      }
      showToast(t('analysis.saved'))
      navigate(`/analysis/${saved.id}`, { replace: true })
    } catch {
      showToast(t('analysis.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

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
      setAi({ text: result.text, model: result.model })
      // In preview there is no scan id yet — handleSave links the query later.
      if (scan.id) {
        await saveAiQuery({ scanId: scan.id, model: result.model, response: result.text })
      }
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
          <h1>{isPreview ? name.trim() || t('analysis.unsaved') : scan.productName}</h1>
          {scan.brand && <span className="muted">{scan.brand}</span>}
        </div>
        {!isPreview && (
          <button className="analysis__del" onClick={handleDelete} aria-label={t('analysis.delete')}>
            <Trash2 size={18} />
          </button>
        )}
      </header>

      <RiskBanner
        overall={scan.overall}
        summary={scan.summary}
        watchlistHits={scan.watchlistHits}
        personalHits={countPersonalHits(scan.items, personalFlags)}
        score={scan.score ?? scoreProduct(scan.items)}
      />

      {isPreview && (
        <div className="analysis__save card">
          <label className="manual__label">{t('analysis.nameLabel')}</label>
          <div className="analysis__save-row">
            <input
              className="input"
              placeholder={t('manual.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!name}
            />
            <button
              className="btn btn--primary"
              onClick={handleSave}
              disabled={saving || !name.trim()}
            >
              {saving ? <span className="spinner" /> : <Save size={18} />}
              {t('analysis.save')}
            </button>
          </div>
          <p className="faint analysis__save-hint">{t('analysis.saveHint')}</p>
        </div>
      )}

      {/* AI works on the in-memory analysis, so it's available in preview too —
          no need to save first. Sharing does need a persisted scan. */}
      <div className="analysis__actions">
        <button className="btn btn--outline" onClick={runAi} disabled={aiLoading}>
          {aiLoading ? <span className="spinner" /> : <Sparkles size={18} />}
          {aiLoading ? t('analysis.aiAnalyzing') : t('analysis.aiButton')}
        </button>
        {!isPreview && cloudEnabled && (
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
          <AiText text={ai.text} />
          <span className="faint analysis__ai-note">{t('analysis.aiNote')}</span>
        </div>
      )}

      <div className="analysis__list">
        <span className="eyebrow">{tn('analysis.count', scan.summary.total)}</span>
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
