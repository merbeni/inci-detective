import { ShieldCheck, AlertTriangle, OctagonAlert, HelpCircle } from 'lucide-react'
import { t } from '../i18n/index.js'

const ICONS = {
  safe: ShieldCheck,
  caution: AlertTriangle,
  alert: OctagonAlert,
  unknown: HelpCircle,
}

// Badge = color + text label, never color alone (WCAG, section 4.4).
export default function RiskBadge({ level, showIcon = true, size = 14 }) {
  const lvl = ICONS[level] ? level : 'unknown'
  const Icon = ICONS[lvl]
  return (
    <span className={`badge badge--${lvl}`}>
      {showIcon && <Icon size={size} strokeWidth={2.5} />}
      {t(`badge.${lvl}`)}
    </span>
  )
}
