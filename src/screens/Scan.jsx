import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Keyboard, ScanText } from 'lucide-react'
import { startBarcodeScan } from '../capture/barcode.js'
import { runOcr } from '../capture/ocr.js'
import { analyzeBarcode, analyzeIngredientsText } from '../core/analyze.js'
import { saveScan } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import './Scan.css'

export default function Scan() {
  const navigate = useNavigate()
  const { showToast } = useApp()
  const videoRef = useRef(null)
  const busyRef = useRef(false)
  const [status, setStatus] = useState('Point at a barcode')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    let controls = null
    // Defer the start one tick. In dev, React StrictMode mounts effects twice
    // (setup → cleanup → setup); starting synchronously fires two overlapping
    // getUserMedia() calls that fight over one webcam (the 2nd often fails with
    // NotReadableError). Deferring lets the throwaway first setup cancel before
    // it ever touches the camera, so we acquire it exactly once.
    const timer = setTimeout(() => {
      if (cancelled) return
      startBarcodeScan(
        videoRef.current,
        (code) => !cancelled && handleBarcode(code),
        (err) => {
          console.warn('camera error', err)
          setStatus('Camera unavailable — use manual entry')
        },
      ).then((c) => {
        controls = c
        // Unmounted before the camera finished starting -> stop it right away,
        // otherwise the MediaStream leaks and the webcam light stays on.
        if (cancelled) c.stop()
      })
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
      controls?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleBarcode(code) {
    if (busyRef.current) return
    busyRef.current = true
    setWorking(true)
    setStatus(`Found ${code} — looking up…`)
    try {
      const result = await analyzeBarcode(code)
      if (result.status === 'ok') {
        const saved = await saveScan(result.analysis)
        navigate(`/analysis/${saved.id}`, { replace: true })
        return
      }
      // Fallbacks routed to manual entry as first-class paths (section 1.2/1.4).
      const params = new URLSearchParams({ barcode: code, reason: result.status })
      if (result.productName) params.set('productName', result.productName)
      if (result.brand) params.set('brand', result.brand)
      navigate(`/manual?${params.toString()}`, { replace: true })
    } catch (e) {
      console.error(e)
      showToast('Something went wrong — try manual entry')
      busyRef.current = false
      setWorking(false)
    }
  }

  // OCR the current camera frame as a label-text fallback.
  async function handleOcr() {
    if (busyRef.current || !videoRef.current) return
    busyRef.current = true
    setWorking(true)
    setStatus('Reading label text…')
    try {
      const text = await runOcr(videoRef.current, (p) =>
        setStatus(`Reading label… ${Math.round(p * 100)}%`),
      )
      const analysis = await analyzeIngredientsText(text, {
        productName: 'Scanned label',
        source: 'ocr',
      })
      if (analysis.summary.total === 0) {
        showToast('No ingredients detected — try manual entry')
        navigate('/manual', { replace: true })
        return
      }
      const saved = await saveScan(analysis)
      navigate(`/analysis/${saved.id}`, { replace: true })
    } catch (e) {
      console.error(e)
      showToast('OCR failed — try manual entry')
      busyRef.current = false
      setWorking(false)
    }
  }

  return (
    <div className="scan">
      <video ref={videoRef} className="scan__video" muted playsInline />
      <div className="scan__overlay">
        <button className="scan__close" onClick={() => navigate('/')} aria-label="Close">
          <X size={24} />
        </button>

        <div className="scan__frame">
          <span className="scan__bracket scan__bracket--tl" />
          <span className="scan__bracket scan__bracket--tr" />
          <span className="scan__bracket scan__bracket--bl" />
          <span className="scan__bracket scan__bracket--br" />
          {!working && <span className="scan__line" />}
        </div>

        <div className="scan__status">
          {working && <span className="spinner" />}
          <span>{status}</span>
        </div>

        <div className="scan__actions">
          <button className="scan__action" onClick={handleOcr} disabled={working}>
            <ScanText size={20} /> Scan label text
          </button>
          <button
            className="scan__action"
            onClick={() => navigate('/manual')}
            disabled={working}
          >
            <Keyboard size={20} /> Enter manually
          </button>
        </div>
      </div>
    </div>
  )
}
