import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Leaf, ArrowRight, Check } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { SKIN_TYPES, CONCERNS } from '../core/constants.js'
import { t } from '../i18n/index.js'
import './Onboarding.css'

export default function Onboarding() {
  const navigate = useNavigate()
  const { profile, updateProfile } = useApp()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(profile.name || '')
  const [skinType, setSkinType] = useState(profile.skinType || '')
  const [concerns, setConcerns] = useState(profile.concerns || [])

  const TOTAL = 3 // steps with a progress bar (after Welcome)

  function next() {
    setStep((s) => s + 1)
  }

  async function finish() {
    await updateProfile({ name: name.trim(), skinType, concerns, onboarded: true })
    navigate('/', { replace: true })
  }

  function toggleConcern(id) {
    setConcerns((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  return (
    <div className="onb">
      {step > 0 && (
        <div className="onb__progress">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span key={i} className={`onb__seg ${i < step ? 'is-done' : ''}`} />
          ))}
        </div>
      )}

      <div className="onb__body">
        {step === 0 && (
          <div className="onb__welcome">
            <span className="onb__logo">
              <Leaf size={34} strokeWidth={2.4} />
            </span>
            <h1>INCI Detective</h1>
            <p className="muted">{t('onb.welcome')}</p>
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
                >
                  {t(`concern.${id}`)}
                </button>
              ))}
            </div>
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
        {step === 3 && (
          <button className="btn btn--primary btn--block btn--lg" onClick={finish}>
            {t('onb.finish')} <Check size={18} />
          </button>
        )}
        {step > 0 && step < 3 && (
          <button className="btn btn--ghost btn--block" onClick={finish}>
            {t('onb.skip')}
          </button>
        )}
      </div>
    </div>
  )
}
