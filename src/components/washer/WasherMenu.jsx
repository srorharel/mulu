import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { User, DollarSign, ShoppingBag, MessageCircle, Settings, LogOut, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'

const MENU_SPRING = { type: 'spring', stiffness: 300, damping: 30 }

const MENU_ITEMS = [
  { to: '/profile',          icon: User,          label: 'Profile'  },
  { to: '/washer/earnings',  icon: DollarSign,    label: 'Earnings' },
  { to: '/washer/shop',      icon: ShoppingBag,   label: 'Shop'     },
  { to: '/washer/support',   icon: MessageCircle, label: 'Support'  },
  { to: '/washer/settings',  icon: Settings,      label: 'Settings' },
]

// Slide-out menu from the leading edge (right side in RTL Hebrew).
// Props:
//   open     boolean
//   onClose  () => void
//   online   boolean — read-only status shown in the user header
export default function WasherMenu({ open, onClose, online }) {
  const navigate              = useNavigate()
  const { profile, signOut }  = useAuth()
  const menuRef               = useRef(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Move focus into the menu when it opens
  useEffect(() => {
    if (open) menuRef.current?.focus()
  }, [open])

  async function handleSignOut() {
    onClose()
    await signOut()
  }

  function go(to) {
    onClose()
    navigate(to)
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (profile?.email?.[0] ?? '?').toUpperCase()

  const displayName = profile?.full_name || profile?.email || 'User'

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ─────────────────────────────────────────────── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* ── Menu panel ───────────────────────────────────────────── */}
          <motion.div
            key="menu"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={MENU_SPRING}
            className="fixed top-0 bottom-0 z-50 w-4/5 max-w-xs flex flex-col bg-glass border-e border-glass-border backdrop-blur-xl outline-none"
            style={{ insetInlineStart: 0 }}
          >
            {/* ── User header ──────────────────────────────────────── */}
            <div
              className="px-5 pb-5 flex items-center gap-4"
              style={{ paddingTop: 'max(2rem, calc(env(safe-area-inset-top, 0px) + 1.5rem))' }}
            >
              <div className="h-12 w-12 rounded-full bg-accent-muted flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-accent">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">{displayName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${online ? 'bg-accent' : 'bg-neutral-500'}`} />
                  <span className={`text-xs ${online ? 'text-accent' : 'text-ink-muted'}`}>
                    {online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-b border-edge mx-4" />

            {/* ── Nav items ────────────────────────────────────────── */}
            <nav className="flex-1 overflow-y-auto py-2">
              {MENU_ITEMS.map(({ to, icon: Icon, label }) => (
                <motion.button
                  key={to}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => go(to)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 text-sm font-medium text-ink hover:bg-white/5 transition-colors"
                >
                  <Icon className="h-5 w-5 text-ink-muted shrink-0" />
                  <span className="flex-1 text-start">{label}</span>
                  <ChevronRight className="h-4 w-4 text-ink-muted/40 rtl:rotate-180 shrink-0" />
                </motion.button>
              ))}
            </nav>

            <div className="border-b border-edge mx-4" />

            {/* ── Sign out ─────────────────────────────────────────── */}
            <div style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSignOut}
                className="w-full flex items-center gap-4 px-5 py-3.5 text-sm font-medium text-danger-500 hover:bg-danger-500/10 transition-colors"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-start">Sign out</span>
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
