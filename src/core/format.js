import { t, getLang } from '../i18n/index.js'

export function relativeDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const day = 24 * 60 * 60 * 1000
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayDiff = Math.round((startToday - startThat) / day)

  if (dayDiff === 0) return t('date.today')
  if (dayDiff === 1) return t('date.yesterday')
  if (dayDiff < 7) return t('date.daysAgo', { n: dayDiff })
  return d.toLocaleDateString(getLang(), { day: 'numeric', month: 'short' })
}
