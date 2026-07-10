import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Barcode, ListPlus, Camera } from 'lucide-react'
import { analyzeBarcode, analyzeIngredientsText } from '../core/analyze.js'
import { looksLikeIngredientList } from '../core/classifier.js'
import { runOcr } from '../capture/ocr.js'
import { cleanOcrTextWithAI, ocrImageWithAI, describeAiError } from '../ai/gemini.js'
import { useApp } from '../context/AppContext.jsx'
import { t } from '../i18n/index.js'
import './ManualEntry.css'

const REASON_KEYS = {
  not_found: 'manual.reason.not_found',
  no_ingredients: 'manual.reason.no_ingredients',
  offline: 'manual.reason.offline',
}

const reasonText = (status) => t(REASON_KEYS[status] || 'manual.reason.default')

export default function ManualEntry() {
  const navigate = useNavigate()
  const { showToast, profile } = useApp()
  const [params] = useSearchParams()
  const prefillBarcode = params.get('barcode') || ''
  const prefillName = params.get('productName') || ''
  const reason = params.get('reason')

  const [tab, setTab] = useState(reason ? 'ingredients' : 'barcode')
  const [notice, setNotice] = useState(reason ? reasonText(reason) : '')
  const [barcode, setBarcode] = useState(prefillBarcode)
  const [productName, setProductName] = useState(prefillName)
  const [text, setText] = useState('')
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState('')
  const fileRef = useRef(null)

  async function submitBarcode() {
    if (!/^\d{8,13}$/.test(barcode.trim())) {
      showToast(t('manual.invalidBarcode'))
      return
    }
    setWorking(true)
    try {
      const result = await analyzeBarcode(barcode.trim())
      if (result.status === 'ok') {
        navigate('/analysis/new', { replace: true, state: { analysis: result.analysis } })
      } else {
        setTab('ingredients')
        if (result.productName) setProductName(result.productName)
        const msg = reasonText(result.status)
        setNotice(msg)
        showToast(msg)
        setWorking(false)
      }
    } catch {
      showToast(t('manual.lookupFailed'))
      setTab('ingredients')
      setWorking(false)
    }
  }

  async function submitIngredients() {
    if (text.trim().length < 3) {
      showToast(t('manual.pasteFirst'))
      return
    }
    setWorking(true)
    try {
      const analysis = await analyzeIngredientsText(text, {
        barcode: barcode.trim() || null,
        productName: productName.trim(),
        source: 'manual',
      })
      if (analysis.summary.total === 0) {
        showToast(t('manual.noParse'))
        return
      }
      // Typed/reviewed text gets a softer gate than OCR: any real INCI name
      // resolves against the catalogue, so zero matches means the text isn't
      // an ingredient list (or is beyond salvage) — don't save an all-unknown
      // "analysis" that tells the user nothing.
      if (analysis.summary.total === analysis.summary.unknown) {
        showToast(t('manual.noneRecognized'))
        return
      }
      navigate('/analysis/new', { replace: true, state: { analysis } })
    } catch {
      showToast(t('manual.analysisFailed'))
    } finally {
      setWorking(false)
    }
  }

  async function handleImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setWorking(true)
    try {
      let result = ''
      const useAI = profile?.aiEnabled && navigator.onLine
      const onRetry = ({ attempt, retries }) =>
        setProgress(t('manual.aiRetry', { attempt, retries }))

      // Preferred path: hand the photo straight to Gemini's vision model. It
      // reads the label far more reliably than on-device OCR on curved bottles
      // and small print — and there's no lossy Tesseract step to repair after.
      if (useAI) {
        setProgress(t('manual.aiReading'))
        try {
          result = (await ocrImageWithAI(file, profile, { onRetry })).trim()
        } catch (err) {
          // Tell the user why AI didn't run, then fall back to on-device OCR.
          showToast(describeAiError(err))
          result = ''
        }
      }

      // Fallback: on-device Tesseract (offline, or if the AI path failed). When
      // AI is available we still let it clean up the noisy OCR text.
      if (!result) {
        setProgress(t('manual.reading'))
        const img = await loadImage(file)
        result = (
          await runOcr(img, (p) =>
            setProgress(t('manual.readingPct', { pct: Math.round(p * 100) })),
          )
        ).trim()
        if (result && useAI) {
          setProgress(t('manual.aiCleaning'))
          try {
            const cleaned = await cleanOcrTextWithAI(result, profile, { onRetry })
            if (cleaned) result = cleaned
          } catch {
            /* keep the raw OCR text */
          }
        }
      }

      if (!result) {
        showToast(t('manual.cantRead'))
        return
      }
      // Reject photos of something that isn't an ingredient list (a pet, the
      // directions side of the box) instead of filling the field with noise.
      const probe = await analyzeIngredientsText(result)
      if (!looksLikeIngredientList(probe.summary)) {
        showToast(t('manual.notALabel'))
        return
      }
      setText((prev) => (prev ? prev + '\n' : '') + result)
      setTab('ingredients')
      showToast(t('manual.extracted'))
    } catch {
      showToast(t('manual.cantRead'))
    } finally {
      setWorking(false)
      setProgress('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="screen manual">
      <header className="manual__head">
        <button
          className="manual__back"
          onClick={() => navigate(-1)}
          aria-label={t('manual.back')}
        >
          <ArrowLeft size={22} />
        </button>
        <h1>{t('manual.title')}</h1>
      </header>

      {notice && <div className="manual__notice">{notice}</div>}

      <div className="manual__tabs">
        <button
          className={`manual__tab ${tab === 'barcode' ? 'is-active' : ''}`}
          onClick={() => setTab('barcode')}
        >
          <Barcode size={16} /> {t('manual.tab.barcode')}
        </button>
        <button
          className={`manual__tab ${tab === 'ingredients' ? 'is-active' : ''}`}
          onClick={() => setTab('ingredients')}
        >
          <ListPlus size={16} /> {t('manual.tab.ingredients')}
        </button>
      </div>

      {tab === 'barcode' ? (
        <div className="manual__panel">
          <label className="manual__label">{t('manual.barcodeLabel')}</label>
          <input
            className="input"
            inputMode="numeric"
            placeholder="e.g. 3600542525473"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
            maxLength={13}
          />
          <p className="faint manual__hint">{t('manual.barcodeHint')}</p>
          <button
            className="btn btn--primary btn--block btn--lg"
            onClick={submitBarcode}
            disabled={working}
          >
            {working ? <span className="spinner" /> : t('manual.lookup')}
          </button>
        </div>
      ) : (
        <div className="manual__panel">
          <label className="manual__label">{t('manual.nameLabel')}</label>
          <input
            className="input"
            placeholder={t('manual.namePlaceholder')}
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
          <label className="manual__label">{t('manual.listLabel')}</label>
          <div className="manual__textwrap">
            <textarea
              className="input manual__textarea"
              placeholder="Aqua, Glycerin, Niacinamide, Phenoxyethanol, Parfum…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
            />
            {/* Camera/OCR tucked into the corner of the field. It's the fast path
                when the label is in hand — and gets out of the way (hidden) the
                moment the user starts typing the list manually. */}
            {!text && (
              <button
                type="button"
                className="manual__ocr-btn"
                onClick={() => fileRef.current?.click()}
                disabled={working}
                data-tooltip={
                  working ? progress || t('manual.ocrBusy') : t('manual.ocrTooltip')
                }
                aria-label={t('manual.ocrAria')}
              >
                {working ? <span className="spinner spinner--sm" /> : <Camera size={18} />}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleImage}
            />
          </div>
          <p className="faint manual__hint">{progress || t('manual.hint')}</p>
          <button
            className="btn btn--primary btn--block btn--lg"
            onClick={submitIngredients}
            disabled={working}
          >
            {working ? <span className="spinner" /> : t('manual.analyze')}
          </button>
        </div>
      )}
    </div>
  )
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
