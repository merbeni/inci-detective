import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { getProfile, updateProfile as persistProfile } from '../db/db.js'
import { setLang, detectLang, t } from '../i18n/index.js'
import { isCloudEnabled } from '../lib/supabase.js'
import {
  onAuthChange,
  getCurrentUser,
  fullSync,
  syncDataset,
  loadCachedDataset,
  signOut as cloudSignOut,
} from '../lib/sync.js'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState(null)

  // Resolve the active language BEFORE children render, so every t() call in
  // this pass already reads the right dictionary. Idempotent module state, not
  // React state — a language change flows through the profile update below.
  if (profile) setLang(profile.language || detectLang())

  const reloadProfile = useCallback(async () => {
    const p = await getProfile()
    setProfile(p)
    return p
  }, [])

  const runSync = useCallback(async () => {
    setSyncing(true)
    try {
      await fullSync()
      await syncDataset().catch(() => {})
      await reloadProfile()
    } catch {
      /* offline or transient — stays queued */
    } finally {
      setSyncing(false)
    }
  }, [reloadProfile])

  // Initial load + remote dataset (cached) + auth wiring.
  useEffect(() => {
    let unsub = () => {}
    ;(async () => {
      await loadCachedDataset().catch(() => {})
      await reloadProfile()
      setLoading(false)

      if (isCloudEnabled) {
        const u = await getCurrentUser().catch(() => null)
        setUser(u)
        if (u) runSync()
        syncDataset().catch(() => {})

        unsub = onAuthChange((nextUser) => {
          setUser(nextUser)
          if (nextUser) runSync()
        })
      }
    })()
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-sync when connectivity returns.
  useEffect(() => {
    if (!isCloudEnabled) return
    const onOnline = () => user && runSync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [user, runSync])

  // Apply dark mode to the document root.
  useEffect(() => {
    if (!profile) return
    document.documentElement.dataset.theme = profile.darkMode ? 'dark' : 'light'
  }, [profile])

  const updateProfile = useCallback(async (patch) => {
    const next = await persistProfile(patch)
    setProfile(next)
    return next
  }, [])

  // Track the hide timer so back-to-back toasts don't get cut short by the
  // previous toast's timeout.
  const toastTimer = useRef(null)
  const showToast = useCallback((message) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  const signOut = useCallback(async () => {
    await cloudSignOut()
    setUser(null)
    showToast(t('profile.signedOut'))
  }, [showToast])

  return (
    <AppContext.Provider
      value={{
        profile,
        loading,
        updateProfile,
        showToast,
        // cloud
        cloudEnabled: isCloudEnabled,
        user,
        syncing,
        runSync,
        signOut,
      }}
    >
      {children}
      {toast && <div className="toast">{toast}</div>}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
