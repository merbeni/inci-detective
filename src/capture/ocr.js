// OCR fallback via Tesseract.js (WASM, offline) for when a product is not in
// Open Beauty Facts. Includes the Canvas API pre-processing recommended in the
// critical-points analysis (1.3): grayscale + contrast threshold to improve
// accuracy on cosmetic labels.

import Tesseract from 'tesseract.js'

// Otsu's method: pick the grayscale threshold that best separates ink from
// paper for THIS image, instead of a fixed cutoff that fails under the uneven
// lighting of a curved bottle/jar.
function otsuThreshold(gray) {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let wB = 0
  let max = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > max) {
      max = between
      threshold = t
    }
  }
  return threshold
}

// Upscale (OCR reads larger glyphs far better), grayscale, then binarize with an
// image-adaptive Otsu threshold.
export function preprocessImage(source) {
  const sw = source.naturalWidth || source.videoWidth || source.width
  const sh = source.naturalHeight || source.videoHeight || source.height
  // Aim for ~1800px on the long side: big enough for small label print, capped
  // so we don't blow up memory on already-large phone photos.
  const long = Math.max(sw, sh)
  const scale = Math.min(3, Math.max(1, 1800 / long))
  const w = Math.round(sw * scale)
  const h = Math.round(sh * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)

  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const gray = new Uint8Array(d.length / 4)
  for (let i = 0, g = 0; i < d.length; i += 4, g++) {
    gray[g] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0
  }
  const t = otsuThreshold(gray)
  for (let i = 0, g = 0; i < d.length; i += 4, g++) {
    const v = gray[g] > t ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

export async function runOcr(source, onProgress) {
  const canvas = preprocessImage(source)
  const { data } = await Tesseract.recognize(canvas, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress)
      }
    },
  })
  return data.text || ''
}
