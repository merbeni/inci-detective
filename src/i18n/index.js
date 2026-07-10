// Tiny i18n layer — no dependency, two dictionaries, string interpolation.
//
// The active language lives in module state. AppContext calls setLang() during
// render (before children), so every t() call in the tree resolves against the
// right dictionary; a language change updates the profile, which re-renders the
// whole tree through context.
//
// Keys missing from a dictionary fall back to English, then to the key itself,
// so a half-translated dictionary never breaks the UI.

import { en } from './en.js'
import { es } from './es.js'
import { FUNCTIONS_ES, NOTES_ES } from './functions-es.js'

const DICTS = { en, es }

export const LANGUAGES = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
]

let current = 'en'

// Best-guess default for first launch: device language, es → es, else en.
export function detectLang() {
  const nav = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase()
  return nav.startsWith('es') ? 'es' : 'en'
}

export function setLang(lang) {
  current = DICTS[lang] ? lang : 'en'
}

export function getLang() {
  return current
}

export function t(key, vars) {
  let s = DICTS[current][key] ?? DICTS.en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}

// Plural-aware t(): with n === 1 uses "<key>.one" when the dictionary defines
// it ("1 producto escaneado"), otherwise falls back to the plural template.
export function tn(key, n, vars) {
  const one = `${key}.one`
  const hasOne = DICTS[current][one] !== undefined || DICTS.en[one] !== undefined
  return t(n === 1 && hasOne ? one : key, { n, ...vars })
}

// Translate a dataset `function` string ("Humectant / solvent") segment by
// segment, preserving separators. Unknown terms pass through in English.
export function translateFunction(fn) {
  if (!fn || current !== 'es') return fn || ''
  return fn
    .split(/([,/])/)
    .map((part) => {
      if (part === ',' || part === '/') return part
      const term = part.trim().toLowerCase()
      const hit = FUNCTIONS_ES[term]
      if (!hit) return part
      // Re-pad like the original so "a / b" keeps its spacing.
      return part.replace(part.trim(), hit)
    })
    .join('')
}

// Translate a curated dataset note (fixed set of English sentences). Exact
// match; unknown notes pass through in English.
export function translateNote(note) {
  if (!note || current !== 'es') return note || ''
  return NOTES_ES[note] || note
}
