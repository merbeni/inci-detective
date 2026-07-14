import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { currentUserId, onAuthChange, updatePassword } from '../lib/sync.js'
import { useApp } from '../context/AppContext.jsx'
import { t } from '../i18n/index.js'
import './Auth.css'

// Landing page of the password-recovery email link. Supabase JS consumes the
// token from the URL on load and opens a recovery session; without one (link
// expired, opened by hand) the screen degrades to a "request a new link" CTA.
export default function ResetPassword() {
  const navigate = useNavigate()
  const { showToast } = useApp()
  const [state, setState] = useState('checking') // checking | ready | invalid
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    // The URL token exchange is async — accept the session whenever it lands,
    // but give up after a grace period so a dead link doesn't spin forever.
    currentUserId().then((id) => alive && id && setState('ready'))
    const off = onAuthChange((user) => alive && user && setState('ready'))
    const timer = setTimeout(() => {
      if (alive) setState((s) => (s === 'checking' ? 'invalid' : s))
    }, 4000)
    return () => {
      alive = false
      off()
      clearTimeout(timer)
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (password !== confirm) {
      showToast(t('reset.mismatch'))
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      showToast(t('reset.done'))
      navigate('/profile', { replace: true })
    } catch (err) {
      showToast(err?.message || t('auth.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen auth">
      <div className="auth__body">
        <div className="auth__brand">
          <span className="auth__logo">
            <KeyRound size={26} strokeWidth={2.4} />
          </span>
          <h1>{t('reset.title')}</h1>
          <p className="muted">
            {state === 'invalid' ? t('reset.invalid') : t('reset.sub')}
          </p>
        </div>

        {state === 'invalid' ? (
          <button
            className="btn btn--primary btn--block btn--lg"
            onClick={() => navigate('/auth', { replace: true })}
          >
            {t('reset.back')}
          </button>
        ) : (
          <form className="auth__form" onSubmit={submit}>
            <input
              className="input"
              type="password"
              placeholder={t('reset.password')}
              aria-label={t('reset.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <input
              className="input"
              type="password"
              placeholder={t('reset.confirm')}
              aria-label={t('reset.confirm')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <button
              className="btn btn--primary btn--block btn--lg"
              disabled={busy || state !== 'ready'}
            >
              {busy ? <span className="spinner" /> : <KeyRound size={18} />}
              {t('reset.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
