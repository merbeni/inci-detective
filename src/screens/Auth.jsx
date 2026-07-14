import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Leaf, Mail } from 'lucide-react'
import { signIn, signUp, signInWithGoogle } from '../lib/sync.js'
import { useApp } from '../context/AppContext.jsx'
import { t } from '../i18n/index.js'
import './Auth.css'

// Supabase auth errors arrive as raw English strings; map the common ones to
// translated messages so the toast matches the UI language.
function authErrorMessage(err, fallbackKey) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('invalid login credentials')) return t('auth.err.invalidCredentials')
  if (msg.includes('email not confirmed')) return t('auth.err.emailNotConfirmed')
  if (msg.includes('already registered')) return t('auth.err.alreadyRegistered')
  if (msg.includes('password should be')) return t('auth.err.weakPassword')
  if (msg.includes('rate limit') || err?.status === 429) return t('auth.err.rateLimit')
  return err?.message || t(fallbackKey)
}

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useApp()
  // Arriving from onboarding there's no screen to go "back" to (the history
  // entry was replaced) and no profile context yet — land on Home instead.
  const fromOnboarding = location.state?.from === 'onboarding'
  const dest = fromOnboarding ? '/' : '/profile'
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password)
        // Account needs email confirmation before it's usable — stay here and
        // let the toast explain instead of bouncing to an unauthenticated profile.
        showToast(t('auth.created'))
        setMode('signin')
      } else {
        await signIn(email.trim(), password)
        showToast(t('auth.signedIn'))
        navigate(dest, { replace: true })
      }
    } catch (err) {
      showToast(authErrorMessage(err, 'auth.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    try {
      await signInWithGoogle()
    } catch (err) {
      showToast(authErrorMessage(err, 'auth.googleFailed'))
    }
  }

  return (
    <div className="screen auth">
      <button
        className="auth__back"
        onClick={() => (fromOnboarding ? navigate('/', { replace: true }) : navigate(-1))}
        aria-label={t('manual.back')}
      >
        <ArrowLeft size={22} />
      </button>

      <div className="auth__body">
        <div className="auth__brand">
          <span className="auth__logo">
            <Leaf size={26} strokeWidth={2.4} />
          </span>
          <h1>{mode === 'signup' ? t('auth.create') : t('auth.welcome')}</h1>
          <p className="muted">{t('auth.sub')}</p>
        </div>

        <form className="auth__form" onSubmit={submit}>
          <input
            className="input"
            type="email"
            placeholder={t('auth.email')}
            aria-label={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="input"
            type="password"
            placeholder={t('auth.password')}
            aria-label={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
          <button className="btn btn--primary btn--block btn--lg" disabled={busy}>
            {busy ? <span className="spinner" /> : <Mail size={18} />}
            {mode === 'signup' ? t('auth.signUp') : t('auth.signIn')}
          </button>
        </form>

        <button className="btn btn--outline btn--block auth__google" onClick={google}>
          {t('auth.google')}
        </button>

        <button
          className="btn btn--ghost btn--block"
          onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
        >
          {mode === 'signin' ? t('auth.toSignup') : t('auth.toSignin')}
        </button>
      </div>
    </div>
  )
}
