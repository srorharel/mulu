import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { MapPin, Clock, User, ArrowLeft } from 'lucide-react'
import { motion, LayoutGroup } from 'framer-motion'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

const consumerLinks = [
  { to: '/home',    icon: MapPin,  label: 'Book'    },
  { to: '/history', icon: Clock,   label: 'Orders'  },
  { to: '/profile', icon: User,    label: 'Profile' },
]

export default function BottomNav() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const isWasher    = profile?.role === 'washer'

  // Washer pages now navigate via the slide-out WasherMenu.
  // BottomNav on washer pages is a single "Back to Jobs" button that returns to Dashboard.
  if (isWasher) {
    return (
      <nav
        className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-center bg-surface-elevated border-t border-edge"
        style={{ minHeight: 56, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <button
          onClick={() => navigate('/washer')}
          className="flex items-center gap-2 py-3 px-5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          Back to Jobs
        </button>
      </nav>
    )
  }

  // Consumer: unchanged three-tab glass nav bar.
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex safe-bottom bg-glass backdrop-blur-xl border-t border-glass-border">
      <LayoutGroup id="consumer-nav">
        {consumerLinks.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-primary-600' : 'text-neutral-400 hover:text-neutral-500'
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
                      className="absolute inset-0 rounded-xl bg-primary-50"
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
