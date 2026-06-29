import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getProfile, updateProfile as persistProfile } from '../db/db.js'
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

  const reloadProfile = useCallback(async () => {
    const p = await getProfile()
    setProfile(p)
    return p
  }, [])

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
  }, [user])

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

  // Apply dark mode to the document root.
  useEffect(() => {
    if (!profile) return
    document.documentElement.dataset.theme = profile.darkMode ? 'dark' : 'light'
  }, [profile?.darkMode])

  const updateProfile = useCallback(async (patch) => {
    const next = await persistProfile(patch)
    setProfile(next)
    return next
  }, [])

  const showToast = useCallback((message) => {
    setToast(message)
    setTimeout(() => setToast(null), 2200)
  }, [])

  const signOut = useCallback(async () => {
    await cloudSignOut()
    setUser(null)
    showToast('Signed out')
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
