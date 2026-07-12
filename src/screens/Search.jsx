import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search as SearchIcon, ChevronRight } from 'lucide-react'
import { searchProducts } from '../capture/productSearch.js'
import { analyzeIngredientsText } from '../core/analyze.js'
import { useApp } from '../context/AppContext.jsx'
import { t } from '../i18n/index.js'
import './Search.css'

const MIN_CHARS = 3
const DEBOUNCE_MS = 400

export default function Search() {
  const navigate = useNavigate()
  const { showToast } = useApp()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const [searched, setSearched] = useState(false)
  // Which row (barcode, or name+brand for barcode-less rows) is mid-analysis —
  // disables the whole list so a second tap can't fire a second analysis.
  const [workingId, setWorkingId] = useState(null)
  // Out-of-order guard: bump on every effect run, only the latest may commit.
  const requestId = useRef(0)

  useEffect(() => {
    const term = query.trim()
    const id = ++requestId.current
    const below = term.length < MIN_CHARS

    // Every state update here runs inside a scheduled callback (never
    // synchronously in the effect body) so a fast typist's stale timers just
    // get cleaned up instead of triggering cascading renders.
    const startTimer = setTimeout(() => {
      if (requestId.current !== id) return
      setLoading(!below)
      if (below) {
        setSearched(false)
        setOffline(false)
      }
    }, 0)

    if (below) {
      return () => clearTimeout(startTimer)
    }

    const searchTimer = setTimeout(async () => {
      const { results: hits, offline: isOffline } = await searchProducts(term)
      if (requestId.current !== id) return // superseded by a newer keystroke
      setResults(hits)
      setOffline(isOffline)
      setSearched(true)
      setLoading(false)
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(startTimer)
      clearTimeout(searchTimer)
    }
  }, [query])

  async function handlePick(row) {
    const id = row.barcode || `${row.productName}-${row.brand}`
    if (row.ingredientsText) {
      setWorkingId(id)
      try {
        const analysis = await analyzeIngredientsText(row.ingredientsText, {
          barcode: row.barcode,
          productName: row.productName,
          brand: row.brand,
          imageUrl: row.imageUrl || '',
          source: row.fromCommunity ? 'community' : 'barcode',
        })
        navigate('/analysis/new', { state: { analysis } })
      } catch {
        showToast(t('search.failed'))
        setWorkingId(null)
      }
      return
    }
    const params = new URLSearchParams()
    if (row.barcode) params.set('barcode', row.barcode)
    params.set('productName', row.productName)
    params.set('brand', row.brand)
    params.set('reason', 'no_ingredients')
    navigate('/manual?' + params.toString())
  }

  const showHint = query.trim().length < MIN_CHARS
  const showOffline = !showHint && !loading && offline
  const showEmpty = !showHint && !showOffline && searched && !loading && results.length === 0

  return (
    <div className="screen search">
      <header className="search__head">
        <button
          className="search__back"
          onClick={() => navigate(-1)}
          aria-label={t('manual.back')}
        >
          <ArrowLeft size={22} />
        </button>
        <h1>{t('search.title')}</h1>
      </header>

      <div className="search__box">
        <SearchIcon size={18} className="faint" />
        <input
          className="search__input"
          autoFocus
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <span className="spinner spinner--sm" />}
      </div>

      {showHint ? (
        <div className="card center muted search__empty">{t('search.hint')}</div>
      ) : showOffline ? (
        <div className="card center muted search__empty">{t('search.offline')}</div>
      ) : showEmpty ? (
        <div className="card center muted search__empty">{t('search.empty')}</div>
      ) : (
        <div className="search__list">
          {results.map((row) => {
            const id = row.barcode || `${row.productName}-${row.brand}`
            return (
              <button
                key={id}
                className="search__item"
                onClick={() => handlePick(row)}
                disabled={workingId !== null}
              >
                {row.imageUrl ? (
                  <img className="search__thumb" src={row.imageUrl} alt="" />
                ) : (
                  <span className="search__thumb search__thumb--placeholder" />
                )}
                <div className="search__info">
                  <span className="search__name">
                    {row.productName || t('manual.defaultProduct')}
                  </span>
                  {row.brand && <span className="search__brand">{row.brand}</span>}
                  <span className="search__tags">
                    {row.ingredientsText ? (
                      <span className="search__tag search__tag--has">
                        {t('search.hasIngredients')}
                      </span>
                    ) : (
                      <span className="search__tag search__tag--none">
                        {t('search.noIngredients')}
                      </span>
                    )}
                    {row.fromCommunity && (
                      <span className="search__tag search__tag--community">
                        {t('search.community')}
                      </span>
                    )}
                  </span>
                </div>
                {workingId === id ? (
                  <span className="spinner spinner--sm" />
                ) : (
                  <ChevronRight size={18} className="faint" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
