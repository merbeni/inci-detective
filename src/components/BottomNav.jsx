import { NavLink } from 'react-router-dom'
import { Home, History, Eye, User } from 'lucide-react'
import { t } from '../i18n/index.js'
import './BottomNav.css'

const TABS = [
  { to: '/', key: 'nav.home', Icon: Home, end: true },
  { to: '/history', key: 'nav.history', Icon: History },
  { to: '/watchlist', key: 'nav.watchlist', Icon: Eye },
  { to: '/profile', key: 'nav.profile', Icon: User },
]

export default function BottomNav() {
  return (
    <nav className="bottomnav">
      {TABS.map(({ to, key, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="bottomnav__item">
          {({ isActive }) => (
            <>
              <Icon size={22} strokeWidth={isActive ? 2.6 : 2} />
              <span>{t(key)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
