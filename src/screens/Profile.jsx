import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Moon, Sparkles, Database, Check, Cloud, CloudOff, RefreshCw, LogOut } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { db } from '../db/db.js'
import { datasetMeta } from '../core/classifier.js'
import { SKIN_TYPES, CONCERNS } from '../core/constants.js'
import './Profile.css'

export default function Profile() {
  const navigate = useNavigate()
  const { profile, updateProfile, showToast, cloudEnabled, user, syncing, runSync, signOut } = useApp()
  const [editing, setEditing] = useState(false)
  const [scanCount, setScanCount] = useState(0)
  const [keyInput, setKeyInput] = useState(profile.geminiKey || '')

  useEffect(() => {
    db.scans.count().then(setScanCount)
  }, [])

  const skinLabel = SKIN_TYPES.find((s) => s.id === profile.skinType)?.label
  const initial = (profile.name || '?').trim().charAt(0).toUpperCase()

  function toggleConcern(id) {
    const next = profile.concerns.includes(id)
      ? profile.concerns.filter((c) => c !== id)
      : [...profile.concerns, id]
    updateProfile({ concerns: next })
  }

  return (
    <div className="screen profile">
      <header className="profile__head">
        <div className="profile__avatar">{initial}</div>
        <div>
          <h1 className="profile__name">{profile.name || 'Your profile'}</h1>
          <span className="muted">{scanCount} products scanned</span>
        </div>
      </header>

      {cloudEnabled && (
        <section className="card profile__section profile__account">
          {user ? (
            <>
              <div className="profile__account-info">
                <Cloud size={18} className="profile__rowicon" />
                <div className="profile__rowtext">
                  <span>{user.email || 'Signed in'}</span>
                  <span className="faint">
                    {syncing ? 'Syncing…' : 'Synced across your devices'}
                  </span>
                </div>
              </div>
              <div className="profile__account-actions">
                <button className="btn btn--outline" onClick={runSync} disabled={syncing}>
                  <RefreshCw size={16} /> Sync now
                </button>
                <button className="btn btn--ghost" onClick={signOut}>
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </>
          ) : (
            <div className="profile__account-info">
              <CloudOff size={18} className="faint" />
              <div className="profile__rowtext">
                <span>Not signed in</span>
                <span className="faint">Sign in to sync and share your scans</span>
              </div>
              <button className="btn btn--primary" onClick={() => navigate('/auth')}>
                Sign in
              </button>
            </div>
          )}
        </section>
      )}

      <section className="card profile__section">
        <div className="profile__section-head">
          <h2>Skin profile</h2>
          <button className="profile__edit" onClick={() => setEditing((e) => !e)}>
            <Pencil size={15} /> {editing ? 'Done' : 'Edit'}
          </button>
        </div>

        {!editing ? (
          <div className="profile__chips">
            {skinLabel ? (
              <span className="profile__chip profile__chip--solid">{skinLabel}</span>
            ) : (
              <span className="faint">No skin type set</span>
            )}
            {profile.concerns.map((c) => (
              <span key={c} className="profile__chip">
                {CONCERNS.find((x) => x.id === c)?.label || c}
              </span>
            ))}
          </div>
        ) : (
          <div className="profile__editor">
            <label className="profile__label">Skin type</label>
            <div className="profile__chips">
              {SKIN_TYPES.map((s) => (
                <button
                  key={s.id}
                  className={`profile__chip ${profile.skinType === s.id ? 'profile__chip--solid' : ''}`}
                  onClick={() => updateProfile({ skinType: s.id })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <label className="profile__label">Concerns</label>
            <div className="profile__chips">
              {CONCERNS.map((c) => (
                <button
                  key={c.id}
                  className={`profile__chip ${profile.concerns.includes(c.id) ? 'profile__chip--solid' : ''}`}
                  onClick={() => toggleConcern(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card profile__section">
        <h2>Preferences</h2>

        <Row icon={<Moon size={18} />} label="Dark mode">
          <Toggle
            on={profile.darkMode}
            onClick={() => updateProfile({ darkMode: !profile.darkMode })}
          />
        </Row>

        <Row icon={<Sparkles size={18} />} label="AI analysis (opt-in)" sub="Uses Gemini when online">
          <Toggle
            on={profile.aiEnabled}
            onClick={() => updateProfile({ aiEnabled: !profile.aiEnabled })}
          />
        </Row>

        {profile.aiEnabled && (
          <div className="profile__keyrow">
            <label className="profile__label">Your Gemini API key (optional)</label>
            <div className="profile__keyfield">
              <input
                className="input"
                type="password"
                placeholder="Leave empty to use the app proxy"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button
                className="btn btn--primary"
                onClick={() => {
                  updateProfile({ geminiKey: keyInput.trim() })
                  showToast('API key saved')
                }}
              >
                <Check size={18} />
              </button>
            </div>
            <p className="faint profile__keyhint">
              Bring your own key from Google AI Studio so your usage never hits shared limits.
            </p>
          </div>
        )}
      </section>

      <section className="card profile__section profile__dataset">
        <Database size={18} className="faint" />
        <div>
          <strong>CosIng dataset v{datasetMeta.version}</strong>
          <div className="faint">
            {datasetMeta.count} ingredients · built {datasetMeta.generatedAt}
          </div>
        </div>
      </section>
    </div>
  )
}

function Row({ icon, label, sub, children }) {
  return (
    <div className="profile__row">
      <span className="profile__rowicon">{icon}</span>
      <div className="profile__rowtext">
        <span>{label}</span>
        {sub && <span className="faint">{sub}</span>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, onClick }) {
  return (
    <button
      className={`toggle ${on ? 'toggle--on' : ''}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    >
      <span className="toggle__knob" />
    </button>
  )
}
