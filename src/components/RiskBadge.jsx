import { ShieldCheck, AlertTriangle, OctagonAlert, HelpCircle } from 'lucide-react'

const META = {
  safe: { label: 'Safe', Icon: ShieldCheck },
  caution: { label: 'Caution', Icon: AlertTriangle },
  alert: { label: 'Alert', Icon: OctagonAlert },
  unknown: { label: 'Unknown', Icon: HelpCircle },
}

// Badge = color + text label, never color alone (WCAG, section 4.4).
export default function RiskBadge({ level, showIcon = true, size = 14 }) {
  const meta = META[level] || META.unknown
  const { Icon } = meta
  return (
    <span className={`badge badge--${level}`}>
      {showIcon && <Icon size={size} strokeWidth={2.5} />}
      {meta.label}
    </span>
  )
}
