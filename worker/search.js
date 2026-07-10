// POST /api/search — semantic ingredient search (Fase 2 / RAG).
//
// Flow: embed the query with the SAME model the corpus was built with
// (@cf/baai/bge-small-en-v1.5, via the AI binding) -> nearest neighbours from
// Vectorize -> optionally let Gemini turn the candidates into a friendly answer.
//
// Body: { query, topK?, mode?: 'raw'|'rag', context? }
//   query   : free text, or an ingredient's descriptor ("Glycerin. Humectant.")
//   mode    : 'rag' also returns a written recommendation (needs GEMINI_API_KEY)
//   context : optional user context (skin type / concerns) for the RAG answer

import { json } from './util.js'

const EMBED_MODEL = '@cf/baai/bge-small-en-v1.5'
const GEN_MODEL = 'gemini-2.5-flash'

export async function handleSearch(request, env, cors) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid body' }, 400, cors)
  }
  const query = (body.query || '').toString().slice(0, 500)
  if (!query) return json({ error: 'missing query' }, 400, cors)
  const topK = Math.min(25, Math.max(1, Number(body.topK) || 12))

  // 1. Embed the query. `data` is [[...384]] for a single input.
  const emb = await env.AI.run(EMBED_MODEL, { text: [query] })
  const vector = emb?.data?.[0]
  if (!vector) return json({ error: 'embedding failed' }, 502, cors)

  // 2. Nearest neighbours.
  const result = await env.VECTORIZE.query(vector, { topK, returnMetadata: 'all' })
  const matches = (result.matches || []).map((m) => ({
    inci: m.metadata?.inci || '',
    function: m.metadata?.fn || '',
    safety: m.metadata?.safety || '',
    score: m.score,
  }))

  // 3. Optional RAG answer.
  if (body.mode === 'rag' && env.GEMINI_API_KEY) {
    const answer = await ragAnswer(query, matches, body.context, env)
    return json({ matches, answer, model: GEN_MODEL }, 200, cors)
  }
  return json({ matches }, 200, cors)
}

async function ragAnswer(query, matches, context, env) {
  const list = matches
    .slice(0, 12)
    .map((m) => `- ${m.inci} (${m.function || 'n/a'}, ${m.safety})`)
    .join('\n')
  const prompt = `You are a friendly skincare ingredient assistant (no medical claims, no diagnosis).
The user asked: "${query}".
Below are candidate ingredients retrieved from an INCI database by similarity.
Recommend the most relevant ones, in plain language. Skip candidates that don't
make sense as a real alternative. ${context ? 'User context: ' + context + '.' : ''}

Candidates:
${list}

Answer in under 150 words: a one-line intro, then a bullet list of 3-6 picks,
each with a few words on why. Do not invent ingredients not in the list.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent`,
    {
      method: 'POST',
      // Key goes in a header, not the query string — URLs end up in logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 600,
          // Reasoning spends the same budget and truncates the answer.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  )
  if (!res.ok) return null
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null
}
