// Client for the semantic-search endpoint (Fase 2). Online-only, opt-in — the
// offline classifier is untouched. Talks to the Worker's /api/search, which
// embeds the query with the same bge model the Vectorize corpus was built with.

import { GeminiError } from './gemini.js'

const SEARCH_URL = '/api/search'

// MUST match embedText() in scripts/build-vectors.mjs so a query lands near the
// right neighbours. For "alternatives to X" we embed X's own descriptor.
export function ingredientQueryText(item) {
  const parts = [item.common || item.inci]
  if (item.function) parts.push(item.function)
  if (item.concern?.length) parts.push(item.concern.join(', '))
  return parts.join('. ')
}

// The distinctive stem of an ingredient name — used to drop chemical cousins
// (variants of the same molecule) that add no value as "alternatives".
function stemOf(norm) {
  const longest = (norm || '')
    .split(' ')
    .reduce((a, b) => (b.length > a.length ? b : a), '')
  return longest.slice(0, 6)
}

async function postSearch(payload) {
  if (!navigator.onLine) throw new GeminiError('offline', 'offline')
  let res
  try {
    res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new GeminiError('network', 'Could not reach the search service')
  }
  if (!res.ok) {
    // Search failures are mostly infra (embedding/index) rather than Gemini
    // quota; surface a simple retryable message via the existing kinds.
    const kind = res.status >= 500 ? 'overloaded' : 'bad_request'
    throw new GeminiError(kind, `search error ${res.status}`, { status: res.status })
  }
  return res.json()
}

// Find functional alternatives to an ingredient. `item` is a record from the
// local dataset. Returns cleaned matches (self + same-family variants removed).
export async function findAlternatives(item, { topK = 20, limit = 8 } = {}) {
  const data = await postSearch({ query: ingredientQueryText(item), topK })
  const queryStem = stemOf(item.norm)
  const seen = new Set([queryStem, (item.inci || '').toLowerCase()])
  const out = []
  for (const m of data.matches || []) {
    const inciLc = (m.inci || '').toLowerCase()
    const norm = inciLc.replace(/[^a-z0-9]+/g, ' ').trim()
    if (norm.includes(queryStem)) continue // chemical cousin of the query
    const stem = stemOf(norm)
    if (seen.has(stem) || seen.has(inciLc)) continue
    seen.add(stem)
    out.push(m)
    if (out.length >= limit) break
  }
  return out
}

// Free-text semantic Q&A grounded in retrieved ingredients (RAG). `context` is
// optional user profile context (skin type / concerns).
export async function askIngredients(query, { context, topK = 12 } = {}) {
  const data = await postSearch({ query, topK, mode: 'rag', context })
  return { answer: data.answer || '', matches: data.matches || [] }
}
