import { NavLink } from 'react-router-dom'
import { Home, History, Eye, User } from 'lucide-react'
import './BottomNav.css'

const TABS = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/history', label: 'History', Icon: History },
  { to: '/watchlist', label: 'Watchlist', Icon: Eye },
  { to: '/profile', label: 'Profile', Icon: User },
]

export default function BottomNav() {
  return (
    <nav className="bottomnav">
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="bottomnav__item">
          {({ isActive }) => (
            <>
              <Icon size={22} strokeWidth={isActive ? 2.6 : 2} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
