import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Leaf, ArrowRight, Check, Cloud } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { SKIN_TYPES, CONCERNS } from '../core/constants.js'
import { t, getLang, LANGUAGES } from '../i18n/index.js'
import './Onboarding.css'

export default function Onboarding() {
  const navigate = useNavigate()
  const { profile, updateProfile, cloudEnabled, user } = useApp()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(profile.name || '')
  const [skinType, setSkinType] = useState(profile.skinType || '')
  const [concerns, setConcerns] = useState(profile.concerns || [])

  // The account step only makes sense when cloud sync is configured and the
  // user isn't already signed in (e.g. re-onboarding after a reset).
  const hasAuthStep = cloudEnabled && !user
  const LAST = hasAuthStep ? 4 : 3
  const TOTAL = LAST // steps with a progress bar (after Welcome)

  function next() {
    setStep((s) => s + 1)
  }

  async function finishTo(path, state) {
    await updateProfile({ name: name.trim(), skinType, concerns, onboarded: true })
    navigate(path, { replace: true, state })
  }

  function skip() {
    // Skipping the profile questions still offers the account choice.
    if (hasAuthStep) setStep(4)
    else finishTo('/')
  }

  function toggleConcern(id) {
    setConcerns((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  return (
    <div className="onb">
      {step > 0 && (
        <>
          <div className="onb__progress">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <span key={i} className={`onb__seg ${i < step ? 'is-done' : ''}`} />
            ))}
          </div>
          <span className="onb__stepcount faint">{t('onb.step', { x: step, y: TOTAL })}</span>
        </>
      )}

      <div className="onb__body">
        {step === 0 && (
          <div className="onb__welcome">
            <span className="onb__logo">
              <Leaf size={34} strokeWidth={2.4} />
            </span>
            <h1>INCI Detective</h1>
            <p className="muted">{t('onb.welcome')}</p>
            <div className="onb__langs">
              {LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  className={`onb__chip ${getLang() === l.id ? 'is-sel' : ''}`}
                  onClick={() => updateProfile({ language: l.id })}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="onb__step">
            <h2>{t('onb.nameQ')}</h2>
            <p className="muted">{t('onb.nameSub')}</p>
            <input
              className="input onb__input"
              placeholder={t('onb.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {step === 2 && (
          <div className="onb__step">
            <h2>{t('onb.skinQ')}</h2>
            <p className="muted">{t('onb.skinSub')}</p>
            <div className="onb__cards">
              {SKIN_TYPES.map((id) => (
                <button
                  key={id}
                  className={`onb__card ${skinType === id ? 'is-sel' : ''}`}
                  onClick={() => setSkinType(id)}
                  aria-pressed={skinType === id}
                >
                  <div className="onb__card-main">
                    <strong>{t(`skin.${id}`)}</strong>
                    <span className="faint">{t(`skin.${id}.desc`)}</span>
                  </div>
                  {skinType === id && <Check size={18} className="onb__card-check" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onb__step">
            <h2>{t('onb.concernsQ')}</h2>
            <p className="muted">{t('onb.concernsSub')}</p>
            <div className="onb__chips">
              {CONCERNS.map((id) => (
                <button
                  key={id}
                  className={`onb__chip ${concerns.includes(id) ? 'is-sel' : ''}`}
                  onClick={() => toggleConcern(id)}
                  aria-pressed={concerns.includes(id)}
                >
                  {t(`concern.${id}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="onb__welcome onb__step">
            <span className="onb__logo">
              <Cloud size={34} strokeWidth={2.2} />
            </span>
            <h2>{t('onb.accountQ')}</h2>
            <p className="muted">{t('onb.accountSub')}</p>
          </div>
        )}
      </div>

      <div className="onb__footer">
        {step === 0 && (
          <button className="btn btn--primary btn--block btn--lg" onClick={next}>
            {t('onb.start')} <ArrowRight size={18} />
          </button>
        )}
        {step === 1 && (
          <button
            className="btn btn--primary btn--block btn--lg"
            onClick={next}
            disabled={!name.trim()}
          >
            {t('onb.continue')} <ArrowRight size={18} />
          </button>
        )}
        {step === 2 && (
          <button
            className="btn btn--primary btn--block btn--lg"
            onClick={next}
            disabled={!skinType}
          >
            {t('onb.continue')} <ArrowRight size={18} />
          </button>
        )}
        {step === 3 &&
          (hasAuthStep ? (
            <button className="btn btn--primary btn--block btn--lg" onClick={next}>
              {t('onb.continue')} <ArrowRight size={18} />
            </button>
          ) : (
            <button className="btn btn--primary btn--block btn--lg" onClick={() => finishTo('/')}>
              {t('onb.finish')} <Check size={18} />
            </button>
          ))}
        {step === 4 && (
          <>
            <button
              className="btn btn--primary btn--block btn--lg"
              onClick={() => finishTo('/auth', { from: 'onboarding' })}
            >
              {t('onb.signIn')} <ArrowRight size={18} />
            </button>
            <button className="btn btn--ghost btn--block" onClick={() => finishTo('/')}>
              {t('onb.guest')}
            </button>
          </>
        )}
        {step > 0 && step < 3 && (
          <button className="btn btn--ghost btn--block" onClick={skip}>
            {t('onb.skip')}
          </button>
        )}
      </div>
    </div>
  )
}
