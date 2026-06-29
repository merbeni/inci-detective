import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Barcode, ListPlus, ImageUp } from 'lucide-react'
import { analyzeBarcode, analyzeIngredientsText } from '../core/analyze.js'
import { runOcr } from '../capture/ocr.js'
import { saveScan } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import './ManualEntry.css'

const REASONS = {
  not_found: 'Product not in Open Beauty Facts. Enter its ingredients below or try the barcode again.',
  no_ingredients: 'Found the product but it has no ingredient list. Paste or scan the ingredients.',
  offline: "You're offline and the product isn't cached. Enter ingredients to classify locally.",
}

export default function ManualEntry() {
  const navigate = useNavigate()
  const { showToast } = useApp()
  const [params] = useSearchParams()
  const prefillBarcode = params.get('barcode') || ''
  const prefillName = params.get('productName') || ''
  const reason = params.get('reason')

  const [tab, setTab] = useState(reason ? 'ingredients' : 'barcode')
  const [notice, setNotice] = useState(reason ? REASONS[reason] : '')
  const [barcode, setBarcode] = useState(prefillBarcode)
  const [productName, setProductName] = useState(prefillName)
  const [text, setText] = useState('')
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState('')
  const fileRef = useRef(null)

  async function submitBarcode() {
    if (!/^\d{8,13}$/.test(barcode.trim())) {
      showToast('Enter a valid 8–13 digit barcode')
      return
    }
    setWorking(true)
    try {
      const result = await analyzeBarcode(barcode.trim())
      if (result.status === 'ok') {
        const saved = await saveScan(result.analysis)
        navigate(`/analysis/${saved.id}`, { replace: true })
      } else {
        setTab('ingredients')
        if (result.productName) setProductName(result.productName)
        const msg = REASONS[result.status] || 'Not found — enter ingredients'
        setNotice(msg)
        showToast(msg)
        setWorking(false)
      }
    } catch {
      showToast('Lookup failed — enter ingredients')
      setTab('ingredients')
      setWorking(false)
    }
  }

  async function submitIngredients() {
    if (text.trim().length < 3) {
      showToast('Paste the ingredient list first')
      return
    }
    setWorking(true)
    const analysis = await analyzeIngredientsText(text, {
      barcode: barcode.trim() || null,
      productName: productName.trim() || 'Manual entry',
      source: 'manual',
    })
    if (analysis.summary.total === 0) {
      showToast('Could not parse any ingredients')
      setWorking(false)
      return
    }
    const saved = await saveScan(analysis)
    navigate(`/analysis/${saved.id}`, { replace: true })
  }

  async function handleImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setWorking(true)
    setProgress('Reading image…')
    try {
      const img = await loadImage(file)
      const ocrText = await runOcr(img, (p) => setProgress(`Reading… ${Math.round(p * 100)}%`))
      setText((t) => (t ? t + '\n' : '') + ocrText.trim())
      setTab('ingredients')
      showToast('Text extracted — review and analyze')
    } catch {
      showToast('Could not read that image')
    } finally {
      setWorking(false)
      setProgress('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="screen manual">
      <header className="manual__head">
        <button className="manual__back" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>Manual entry</h1>
      </header>

      {notice && <div className="manual__notice">{notice}</div>}

      <div className="manual__tabs">
        <button
          className={`manual__tab ${tab === 'barcode' ? 'is-active' : ''}`}
          onClick={() => setTab('barcode')}
        >
          <Barcode size={16} /> Barcode
        </button>
        <button
          className={`manual__tab ${tab === 'ingredients' ? 'is-active' : ''}`}
          onClick={() => setTab('ingredients')}
        >
          <ListPlus size={16} /> Ingredients
        </button>
      </div>

      {tab === 'barcode' ? (
        <div className="manual__panel">
          <label className="manual__label">EAN / UPC code</label>
          <input
            className="input"
            inputMode="numeric"
            placeholder="e.g. 3600542525473"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
            maxLength={13}
          />
          <p className="faint manual__hint">
            We'll look it up in Open Beauty Facts and classify the ingredients locally.
          </p>
          <button
            className="btn btn--primary btn--block btn--lg"
            onClick={submitBarcode}
            disabled={working}
          >
            {working ? <span className="spinner" /> : 'Look up & analyze'}
          </button>
        </div>
      ) : (
        <div className="manual__panel">
          <label className="manual__label">Product name (optional)</label>
          <input
            className="input"
            placeholder="e.g. Hydrating Serum"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
          />
          <label className="manual__label">Ingredient list (INCI)</label>
          <textarea
            className="input manual__textarea"
            placeholder="Aqua, Glycerin, Niacinamide, Phenoxyethanol, Parfum…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
          />
          <button
            className="btn btn--outline btn--block"
            onClick={() => fileRef.current?.click()}
            disabled={working}
          >
            <ImageUp size={18} /> {progress || 'Scan label from photo (OCR)'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={handleImage}
          />
          <button
            className="btn btn--primary btn--block btn--lg"
            onClick={submitIngredients}
            disabled={working}
          >
            {working ? <span className="spinner" /> : 'Analyze ingredients'}
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
