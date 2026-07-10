import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Moon, Sparkles, Database, Check, Cloud, CloudOff, RefreshCw, LogOut, Languages } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { db } from '../db/db.js'
import { datasetMeta } from '../core/classifier.js'
import { SKIN_TYPES, CONCERNS } from '../core/constants.js'
import { t, getLang, LANGUAGES } from '../i18n/index.js'
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
          <h1 className="profile__name">{profile.name || t('profile.title')}</h1>
          <span className="muted">{t('profile.scanned', { n: scanCount })}</span>
        </div>
      </header>

      {cloudEnabled && (
        <section className="card profile__section profile__account">
          {user ? (
            <>
              <div className="profile__account-info">
                <Cloud size={18} className="profile__rowicon" />
                <div className="profile__rowtext">
                  <span>{user.email || t('profile.signedInFallback')}</span>
                  <span className="faint">
                    {syncing ? t('profile.syncing') : t('profile.synced')}
                  </span>
                </div>
              </div>
              <div className="profile__account-actions">
                <button className="btn btn--outline" onClick={runSync} disabled={syncing}>
                  <RefreshCw size={16} /> {t('profile.syncNow')}
                </button>
                <button className="btn btn--ghost" onClick={signOut}>
                  <LogOut size={16} /> {t('profile.signOut')}
                </button>
              </div>
            </>
          ) : (
            <div className="profile__account-info">
              <CloudOff size={18} className="faint" />
              <div className="profile__rowtext">
                <span>{t('profile.notSignedIn')}</span>
                <span className="faint">{t('profile.signInSub')}</span>
              </div>
              <button className="btn btn--primary" onClick={() => navigate('/auth')}>
                {t('profile.signIn')}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="card profile__section">
        <div className="profile__section-head">
          <h2>{t('profile.skinProfile')}</h2>
          <button className="profile__edit" onClick={() => setEditing((e) => !e)}>
            <Pencil size={15} /> {editing ? t('profile.done') : t('profile.edit')}
          </button>
        </div>

        {!editing ? (
          <div className="profile__chips">
            {profile.skinType ? (
              <span className="profile__chip profile__chip--solid">
                {t(`skin.${profile.skinType}`)}
              </span>
            ) : (
              <span className="faint">{t('profile.noSkinType')}</span>
            )}
            {profile.concerns.map((c) => (
              <span key={c} className="profile__chip">
                {t(`concern.${c}`)}
              </span>
            ))}
          </div>
        ) : (
          <div className="profile__editor">
            <label className="profile__label">{t('profile.skinType')}</label>
            <div className="profile__chips">
              {SKIN_TYPES.map((id) => (
                <button
                  key={id}
                  className={`profile__chip ${profile.skinType === id ? 'profile__chip--solid' : ''}`}
                  onClick={() => updateProfile({ skinType: id })}
                >
                  {t(`skin.${id}`)}
                </button>
              ))}
            </div>
            <label className="profile__label">{t('profile.concerns')}</label>
            <div className="profile__chips">
              {CONCERNS.map((id) => (
                <button
                  key={id}
                  className={`profile__chip ${profile.concerns.includes(id) ? 'profile__chip--solid' : ''}`}
                  onClick={() => toggleConcern(id)}
                >
                  {t(`concern.${id}`)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card profile__section">
        <h2>{t('profile.preferences')}</h2>

        <Row icon={<Languages size={18} />} label={t('profile.language')}>
          <div className="profile__chips">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                className={`profile__chip ${getLang() === l.id ? 'profile__chip--solid' : ''}`}
                onClick={() => updateProfile({ language: l.id })}
              >
                {l.label}
              </button>
            ))}
          </div>
        </Row>

        <Row icon={<Moon size={18} />} label={t('profile.darkMode')}>
          <Toggle
            on={profile.darkMode}
            onClick={() => updateProfile({ darkMode: !profile.darkMode })}
          />
        </Row>

        <Row icon={<Sparkles size={18} />} label={t('profile.ai')} sub={t('profile.aiSub')}>
          <Toggle
            on={profile.aiEnabled}
            onClick={() => updateProfile({ aiEnabled: !profile.aiEnabled })}
          />
        </Row>

        {profile.aiEnabled && (
          <div className="profile__keyrow">
            <label className="profile__label">{t('profile.keyLabel')}</label>
            <div className="profile__keyfield">
              <input
                className="input"
                type="password"
                placeholder={t('profile.keyPlaceholder')}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button
                className="btn btn--primary"
                onClick={() => {
                  updateProfile({ geminiKey: keyInput.trim() })
                  showToast(t('profile.keySaved'))
                }}
              >
                <Check size={18} />
              </button>
            </div>
            <p className="faint profile__keyhint">{t('profile.keyHint')}</p>
          </div>
        )}
      </section>

      <section className="card profile__section profile__dataset">
        <Database size={18} className="faint" />
        <div>
          <strong>{t('profile.dataset', { v: datasetMeta.version })}</strong>
          <div className="faint">
            {t('profile.datasetSub', { n: datasetMeta.count, d: datasetMeta.generatedAt })}
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
