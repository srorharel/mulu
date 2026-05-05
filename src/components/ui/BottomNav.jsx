import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { MapPin, Clock, User, LayoutDashboard, DollarSign } from 'lucide-react'
import { motion, LayoutGroup } from 'framer-motion'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

export default function BottomNav() {
  const { profile } = useAuth()
  const isWasher = profile?.role === 'washer'

  const consumerLinks = [
    { to: '/home',    icon: MapPin,          label: 'Book'     },
    { to: '/history', icon: Clock,           label: 'Orders'   },
    { to: '/profile', icon: User,            label: 'Profile'  },
  ]

  const washerLinks = [
    { to: '/washer',          icon: LayoutDashboard, label: 'Jobs'     },
    { to: '/washer/earnings', icon: DollarSign,      label: 'Earnings' },
    { to: '/profile',         icon: User,            label: 'Profile'  },
  ]

  const links = isWasher ? washerLinks : consumerLinks

  // Consumer: glass surface with backdrop blur (light mode, LTR).
  // Washer:   dark elevated surface (resolved by .dark ancestor from WasherShell).
  // inset-x-0 is symmetric — safe for RTL.
  // Flex row direction reverses in dir="rtl" context — correct Hebrew tab order.
  const navClass = isWasher
    ? 'bg-surface-elevated border-edge'
    : 'bg-glass backdrop-blur-xl border-glass-border'

  return (
    <nav className={`fixed bottom-0 inset-x-0 z-40 flex safe-bottom border-t ${navClass}`}>
      <LayoutGroup id={isWasher ? 'washer-nav' : 'consumer-nav'}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? isWasher ? 'text-accent' : 'text-primary-600'
                  : isWasher
                    ? 'text-ink-muted hover:text-ink'
                    : 'text-neutral-400 hover:text-neutral-500'
              }`
            }
            style={{ minHeight: 56 }}
          >
            {({ isActive }) => (
              <>
                <div className="relative rounded-xl px-3 py-1">
                  {isActive && (
                    <motion.div
                      layoutId="nav-active-pill"
                      className={`absolute inset-0 rounded-xl ${isWasher ? 'bg-accent-muted' : 'bg-primary-50'}`}
                      transition={SPRING}
                    />
                  )}
                  <Icon className="h-5 w-5 relative z-10" />
                </div>
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </LayoutGroup>
    </nav>
  )
}
