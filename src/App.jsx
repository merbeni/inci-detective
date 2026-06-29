import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useApp } from './context/AppContext.jsx'
import BottomNav from './components/BottomNav.jsx'
import Home from './screens/Home.jsx'

// Heavy capture-dependent routes (ZXing / Tesseract) are code-split so they
// only load when the user reaches them, keeping the initial app shell light.
const Scan = lazy(() => import('./screens/Scan.jsx'))
const ManualEntry = lazy(() => import('./screens/ManualEntry.jsx'))
const Analysis = lazy(() => import('./screens/Analysis.jsx'))
const History = lazy(() => import('./screens/History.jsx'))
const Watchlist = lazy(() => import('./screens/Watchlist.jsx'))
const Profile = lazy(() => import('./screens/Profile.jsx'))
const Onboarding = lazy(() => import('./screens/Onboarding.jsx'))
const Auth = lazy(() => import('./screens/Auth.jsx'))
const Shared = lazy(() => import('./screens/Shared.jsx'))

// Screens where the bottom navigation is hidden (camera + onboarding), per the
// design decisions in section 3.4.
const NO_NAV = ['/scan', '/onboarding', '/auth', '/share']
// Public routes that bypass the first-run onboarding gate.
const PUBLIC = ['/onboarding', '/share', '/auth']

export default function App() {
  const { profile, loading } = useApp()
  const location = useLocation()

  if (loading) {
    return (
      <div className="app" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  // First-run onboarding gate (public routes bypass it).
  const isPublic = PUBLIC.some((p) => location.pathname.startsWith(p))
  if (!profile.onboarded && !isPublic) {
    return <Navigate to="/onboarding" replace />
  }

  const showNav = !NO_NAV.some((p) => location.pathname.startsWith(p))

  return (
    <div className="app">
      <Suspense
        fallback={
          <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>
            <span className="spinner" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/manual" element={<ManualEntry />} />
          <Route path="/analysis/:id" element={<Analysis />} />
          <Route path="/history" element={<History />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/share/:shareId" element={<Shared />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {showNav && <BottomNav />}
    </div>
  )
}
