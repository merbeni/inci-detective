// POST /api/ai — reverse proxy for the Gemini API.
//
// The Google AI Studio key lives only in the Worker's encrypted secret
// (GEMINI_API_KEY), never in the client bundle. Accepts either a `parts` array
// (text + optional inline image for vision OCR) or a legacy `prompt` string, and
// forwards Gemini's real status + body on error so the client can classify it.

import { json, clamp } from './util.js'

const MODEL = 'gemini-2.0-flash'

export async function handleAi(request, env, cors) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid body' }, 400, cors)
  }

  let parts
  if (Array.isArray(body.parts) && body.parts.length) {
    parts = body.parts
      .map((p) => {
        if (p?.text != null) return { text: String(p.text).slice(0, 8000) }
        if (p?.inlineData?.data) {
          return {
            inlineData: {
              mimeType: String(p.inlineData.mimeType || 'image/jpeg'),
              data: String(p.inlineData.data),
            },
          }
        }
        return null
      })
      .filter(Boolean)
  } else {
    const prompt = (body.prompt || '').toString().slice(0, 8000)
    if (prompt) parts = [{ text: prompt }]
  }
  if (!parts || !parts.length) return json({ error: 'missing prompt' }, 400, cors)

  const reqCfg = body.generationConfig || {}
  const generationConfig = {
    temperature: clamp(Number(reqCfg.temperature ?? 0.4), 0, 1),
    maxOutputTokens: clamp(Math.round(Number(reqCfg.maxOutputTokens ?? 512)), 1, 2048),
  }

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
    },
  )

  if (!upstream.ok) {
    // Forward the real status + error body so the client can classify (rate
    // limit vs quota vs overloaded) and decide whether to retry.
    const errBody = await upstream.text()
    return new Response(errBody, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }
  const data = await upstream.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return json({ text, model: MODEL }, 200, cors)
}
