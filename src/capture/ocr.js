// OCR fallback via Tesseract.js (WASM, offline) for when a product is not in
// Open Beauty Facts. Includes the Canvas API pre-processing recommended in the
// critical-points analysis (1.3): grayscale + contrast threshold to improve
// accuracy on cosmetic labels.

import Tesseract from 'tesseract.js'

// Grayscale + simple luminance threshold to boost text contrast before OCR.
export function preprocessImage(source) {
  const canvas = document.createElement('canvas')
  const w = source.naturalWidth || source.videoWidth || source.width
  const h = source.naturalHeight || source.videoHeight || source.height
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, w, h)

  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    // Soft threshold: push mid-tones toward black/white, keep some gradient.
    const v = lum > 150 ? 255 : lum < 90 ? 0 : lum
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
