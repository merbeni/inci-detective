import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Keyboard, ScanText } from 'lucide-react'
import { startBarcodeScan } from '../capture/barcode.js'
import { runOcr } from '../capture/ocr.js'
import { ocrImageWithAI, cleanOcrTextWithAI, describeAiError } from '../ai/gemini.js'
import { analyzeBarcode, analyzeIngredientsText } from '../core/analyze.js'
import { looksLikeIngredientList } from '../core/classifier.js'
import { saveScan } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import { t } from '../i18n/index.js'
import './Scan.css'

export default function Scan() {
  const navigate = useNavigate()
  const { showToast, profile } = useApp()
  const videoRef = useRef(null)
  const busyRef = useRef(false)
  const [status, setStatus] = useState(() => t('scan.point'))
  const [working, setWorking] = useState(false)

  async function handleBarcode(code) {
    if (busyRef.current) return
    busyRef.current = true
    setWorking(true)
    setStatus(t('scan.found', { code }))
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
      showToast(t('scan.error'))
      busyRef.current = false
      setWorking(false)
    }
  }

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
          setStatus(t('scan.cameraUnavailable'))
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

  // Read the ingredient label from the current camera frame. Same priority
  // chain as the photo flow in ManualEntry: Gemini vision when AI is enabled
  // and online (far better on curved bottles / small print), on-device
  // Tesseract as the offline fallback, AI cleanup of the noisy OCR text last.
  async function handleOcr() {
    if (busyRef.current || !videoRef.current) return
    busyRef.current = true
    setWorking(true)
    setStatus(t('scan.reading'))
    try {
      const video = videoRef.current
      const useAI = profile?.aiEnabled && navigator.onLine
      let text = ''

      if (useAI) {
        const frame = await frameToBlob(video)
        if (frame) {
          setStatus(t('manual.aiReading'))
          try {
            text = (await ocrImageWithAI(frame, profile)).trim()
          } catch (err) {
            showToast(describeAiError(err))
          }
        }
      }

      if (!text) {
        text = await runOcr(video, (p) =>
          setStatus(t('scan.readingPct', { pct: Math.round(p * 100) })),
        )
        if (text && useAI) {
          setStatus(t('manual.aiCleaning'))
          try {
            const cleaned = await cleanOcrTextWithAI(text, profile)
            if (cleaned) text = cleaned
          } catch {
            /* keep the raw OCR text */
          }
        }
      }

      const analysis = await analyzeIngredientsText(text, {
        productName: t('scan.scannedLabel'),
        source: 'ocr',
      })
      // Don't save garbage: a frame of something that isn't an ingredient
      // list (wrong part of the label, random object) parses into few tokens,
      // nearly all unknown. Tell the user and let them re-aim.
      if (!looksLikeIngredientList(analysis.summary)) {
        showToast(t('scan.notALabel'))
        setStatus(t('scan.point'))
        busyRef.current = false
        setWorking(false)
        return
      }
      const saved = await saveScan(analysis)
      navigate(`/analysis/${saved.id}`, { replace: true })
    } catch (e) {
      console.error(e)
      showToast(t('scan.ocrFailed'))
      busyRef.current = false
      setWorking(false)
    }
  }

  return (
    <div className="scan">
      <video ref={videoRef} className="scan__video" muted playsInline />
      <div className="scan__overlay">
        <button className="scan__close" onClick={() => navigate('/')} aria-label={t('scan.close')}>
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
            <ScanText size={20} /> {t('scan.scanLabel')}
          </button>
          <button
            className="scan__action"
            onClick={() => navigate('/manual')}
            disabled={working}
          >
            <Keyboard size={20} /> {t('scan.enterManually')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Grab the current video frame as a JPEG blob (full camera resolution; the AI
// path downscales it again before upload).
function frameToBlob(video) {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(video, 0, 0, w, h)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}
