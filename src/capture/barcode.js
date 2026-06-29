// Barcode scanning — 100% client-side, no network.
//
// Two engines, in priority order:
//  1. The native BarcodeDetector API (Shape Detection) — fast and accurate,
//     available on Chromium / Android. Preferred when present.
//  2. ZXing (WASM) as a cross-browser fallback (Safari/iOS, Firefox).
//
// Both request the rear ("environment") camera at a higher resolution, since a
// low-res frame is the main reason an EAN-13 fails to decode.

import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'

const VIDEO_CONSTRAINTS = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
}

const WANTED_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']

const hints = new Map()
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.QR_CODE,
])
hints.set(DecodeHintType.TRY_HARDER, true)

export async function startBarcodeScan(videoEl, onResult, onError) {
  if ('BarcodeDetector' in window) {
    try {
      return await scanWithNative(videoEl, onResult, onError)
    } catch (err) {
      // Native path failed (e.g. unsupported formats) -> fall back to ZXing.
      console.warn('BarcodeDetector failed, falling back to ZXing', err)
    }
  }
  return scanWithZxing(videoEl, onResult, onError)
}

// --- Native BarcodeDetector ---------------------------------------------

async function scanWithNative(videoEl, onResult, onError) {
  const supported = await window.BarcodeDetector.getSupportedFormats()
  const formats = WANTED_FORMATS.filter((f) => supported.includes(f))
  const detector = new window.BarcodeDetector(
    formats.length ? { formats } : undefined,
  )

  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: VIDEO_CONSTRAINTS,
      audio: false,
    })
  } catch (err) {
    onError?.(err)
    return { stop() {} }
  }

  videoEl.srcObject = stream
  videoEl.setAttribute('playsinline', 'true')
  await videoEl.play().catch(() => {})

  let stopped = false
  let timer = null
  const stop = () => {
    stopped = true
    if (timer) clearTimeout(timer)
    stream.getTracks().forEach((t) => t.stop())
  }

  const tick = async () => {
    if (stopped) return
    try {
      const codes = await detector.detect(videoEl)
      if (codes.length) {
        const value = codes[0].rawValue
        if (value) {
          stop()
          onResult(value)
          return
        }
      }
    } catch {
      // transient detect errors (e.g. video not ready) -> keep polling
    }
    timer = setTimeout(tick, 150) // ~6-7 scans/sec, easy on the battery
  }
  tick()

  return { stop }
}

// --- ZXing fallback ------------------------------------------------------

// ZXing throws these on almost every frame while hunting for a code: no symbol
// found, or a partial read that fails its checksum/format check. They are normal
// scanning noise, NOT a camera failure — swallow them and keep polling.
const TRANSIENT_DECODE_ERRORS = new Set([
  'NotFoundException',
  'ChecksumException',
  'FormatException',
])

async function scanWithZxing(videoEl, onResult, onError) {
  const reader = new BrowserMultiFormatReader(hints)
  let stopped = false
  let controls

  const onDecode = (result, err) => {
    if (stopped) return
    if (result) {
      stopped = true
      onResult(result.getText())
      controls?.stop()
    } else if (err && !TRANSIENT_DECODE_ERRORS.has(err.name) && onError) {
      onError(err)
    }
  }

  try {
    controls = await reader.decodeFromConstraints(
      { video: VIDEO_CONSTRAINTS },
      videoEl,
      onDecode,
    )
  } catch (err) {
    onError?.(err)
    return { stop() {} }
  }

  return {
    stop() {
      stopped = true
      controls?.stop()
    },
  }
}
