import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Moon, Sparkles, Check, Cloud, CloudOff, RefreshCw, LogOut, Languages, Camera } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { db } from '../db/db.js'
import { datasetMeta } from '../core/classifier.js'
import { SKIN_TYPES, CONCERNS } from '../core/constants.js'
import { t, tn, getLang, LANGUAGES } from '../i18n/index.js'
import './Profile.css'

export default function Profile() {
  const navigate = useNavigate()
  const { profile, updateProfile, showToast, cloudEnabled, user, syncing, runSync, signOut } = useApp()
  const [editing, setEditing] = useState(false)
  const [scanCount, setScanCount] = useState(0)
  const [keyInput, setKeyInput] = useState(profile.geminiKey || '')
  // The proxy needs zero setup; the bring-your-own-key field is advanced-only,
  // so keep it collapsed unless a key is already saved.
  const [showKey, setShowKey] = useState(Boolean(profile.geminiKey))
  const photoInput = useRef(null)

  useEffect(() => {
    db.scans.count().then(setScanCount)
  }, [])

  const initial = (profile.name || '?').trim().charAt(0).toUpperCase()

  async function onPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // re-picking the same file must fire change again
    if (!file) return
    try {
      const avatar = await toAvatarDataUrl(file)
      updateProfile({ avatar })
      showToast(t('profile.photoSaved'))
    } catch {
      showToast(t('profile.photoFailed'))
    }
  }

  function toggleConcern(id) {
    const next = profile.concerns.includes(id)
      ? profile.concerns.filter((c) => c !== id)
      : [...profile.concerns, id]
    updateProfile({ concerns: next })
  }

  return (
    <div className="screen profile">
      <header className="profile__head">
        <button
          className="profile__avatar"
          onClick={() => photoInput.current?.click()}
          aria-label={t('profile.changePhoto')}
        >
          {profile.avatar ? <img src={profile.avatar} alt="" /> : initial}
          <span className="profile__avatar-badge">
            <Camera size={12} strokeWidth={2.5} />
          </span>
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          hidden
          onChange={onPhoto}
          aria-hidden="true"
        />
        <div>
          <h1 className="profile__name">{profile.name || t('profile.title')}</h1>
          <span className="muted">{tn('profile.scanned', scanCount)}</span>
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
              <span className="profile__chip profile__chip--info">
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
            label={t('profile.darkMode')}
          />
        </Row>

        <Row icon={<Sparkles size={18} />} label={t('profile.ai')} sub={t('profile.aiSub')}>
          <Toggle
            on={profile.aiEnabled}
            onClick={() => updateProfile({ aiEnabled: !profile.aiEnabled })}
            label={t('profile.ai')}
          />
        </Row>

        {profile.aiEnabled && !showKey && (
          <button className="btn btn--ghost btn--block" onClick={() => setShowKey(true)}>
            {t('profile.useOwnKey')}
          </button>
        )}

        {profile.aiEnabled && showKey && (
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

      <p className="faint profile__dataset">{datasetLine()}</p>
    </div>
  )
}

// Center-crop the picked image to a small square JPEG data URL — a few KB in
// IndexedDB instead of a multi-MB camera photo, and offline by construction.
const AVATAR_SIZE = 192
async function toAvatarDataUrl(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('bad image'))
      i.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = AVATAR_SIZE
    const scale = Math.max(AVATAR_SIZE / img.width, AVATAR_SIZE / img.height)
    const w = img.width * scale
    const h = img.height * scale
    canvas
      .getContext('2d')
      .drawImage(img, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// "Analizamos con una base de 28.700 ingredientes · actualizada el 11 de julio de 2026"
function datasetLine() {
  const locale = getLang() === 'es' ? 'es-AR' : 'en-US'
  // generatedAt is "YYYY-MM-DD"; parse the parts so the date can't shift a day
  // when the device timezone is behind UTC.
  const [y, m, d] = datasetMeta.generatedAt.split('-').map(Number)
  return t('profile.datasetLine', {
    n: datasetMeta.count.toLocaleString(locale),
    d: new Date(y, m - 1, d).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  })
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

function Toggle({ on, onClick, label }) {
  return (
    <button
      className={`toggle ${on ? 'toggle--on' : ''}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <span className="toggle__knob" />
    </button>
  )
}
