import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Leaf, Mail } from 'lucide-react'
import { signIn, signUp, signInWithGoogle } from '../lib/sync.js'
import { useApp } from '../context/AppContext.jsx'
import './Auth.css'

export default function Auth() {
  const navigate = useNavigate()
  const { showToast } = useApp()
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
        showToast('Account created — check your email to confirm')
      } else {
        await signIn(email.trim(), password)
        showToast('Signed in')
      }
      navigate('/profile', { replace: true })
    } catch (err) {
      showToast(err.message || 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    try {
      await signInWithGoogle()
    } catch (err) {
      showToast(err.message || 'Google sign-in failed')
    }
  }

  return (
    <div className="screen auth">
      <button className="manual__back" onClick={() => navigate(-1)} aria-label="Back">
        <ArrowLeft size={22} />
      </button>

      <div className="auth__brand">
        <span className="auth__logo">
          <Leaf size={26} strokeWidth={2.4} />
        </span>
        <h1>{mode === 'signup' ? 'Create account' : 'Welcome back'}</h1>
        <p className="muted">Sync your scans, watchlist and profile across devices.</p>
      </div>

      <form className="auth__form" onSubmit={submit}>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          minLength={6}
          required
        />
        <button className="btn btn--primary btn--block btn--lg" disabled={busy}>
          {busy ? <span className="spinner" /> : <Mail size={18} />}
          {mode === 'signup' ? 'Sign up' : 'Sign in'}
        </button>
      </form>

      <button className="btn btn--outline btn--block auth__google" onClick={google}>
        Continue with Google
      </button>

      <button
        className="btn btn--ghost btn--block"
        onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
