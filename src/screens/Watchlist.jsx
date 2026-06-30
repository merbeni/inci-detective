import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, X } from 'lucide-react'
import {
  listWatchlist,
  addWatchlistItem,
  removeWatchlistItem,
} from '../db/db.js'
import { allIngredients, ensureDataset } from '../core/classifier.js'
import { normalizeName } from '../core/inciParse.js'
import { useApp } from '../context/AppContext.jsx'
import './Watchlist.css'

export default function Watchlist() {
  const { showToast } = useApp()
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  // The ingredient catalogue is lazy-loaded; flip this once it's ready so the
  // autocomplete suggestions recompute.
  const [datasetReady, setDatasetReady] = useState(false)

  const refresh = () => listWatchlist().then(setItems)
  useEffect(() => {
    refresh()
    ensureDataset().then(() => setDatasetReady(true))
  }, [])

  const watchedNorms = useMemo(() => new Set(items.map((i) => i.norm)), [items])

  const suggestions = useMemo(() => {
    const term = normalizeName(q)
    if (term.length < 2 || !datasetReady) return []
    return allIngredients()
      .filter((i) => !watchedNorms.has(i.norm) && i.norm.includes(term))
      .slice(0, 6)
  }, [q, watchedNorms, datasetReady])

  async function add(norm, display) {
    await addWatchlistItem(norm, display)
    setQ('')
    await refresh()
    showToast('Added to watchlist')
  }

  async function addCustom() {
    const norm = normalizeName(q)
    if (norm.length < 2) return
    await add(norm, q.trim())
  }

  async function remove(id) {
    await removeWatchlistItem(id)
    await refresh()
  }

  return (
    <div className="screen watchlist">
      <h1 className="watchlist__title">Watchlist</h1>
      <p className="muted watchlist__intro">
        Ingredients you want to avoid. We'll flag them in every scan.
      </p>

      <div className="watchlist__search">
        <Search size={18} className="faint" />
        <input
          className="watchlist__input"
          placeholder="Search ingredients to avoid"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button className="watchlist__add" onClick={addCustom} aria-label="Add custom">
            <Plus size={18} />
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="watchlist__suggest">
          {suggestions.map((s) => (
            <button key={s.id} className="watchlist__sugg" onClick={() => add(s.norm, s.inci)}>
              <span>
                <strong>{s.inci}</strong>
                {s.common && <span className="faint"> · {s.common}</span>}
              </span>
              <Plus size={16} className="faint" />
            </button>
          ))}
        </div>
      )}

      <div className="watchlist__list">
        {items.length === 0 ? (
          <div className="card center muted watchlist__empty">
            Your watchlist is empty.
          </div>
        ) : (
          items.map((i) => (
            <div key={i.id} className="watchlist__chip">
              <span>{i.display}</span>
              <button onClick={() => remove(i.id)} aria-label="Remove">
                <X size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
