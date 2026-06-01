import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { User, DollarSign, ShoppingBag, MessageCircle, Settings, LogOut, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'
import { useHistoryDismissible } from '../../hooks/useHistoryDismissible.js'
import { useSupportUnread } from '../../hooks/useSupportUnread.js'
import Editable from '../editable/Editable.jsx'

const MENU_SPRING = { type: 'spring', stiffness: 300, damping: 30 }

const MENU_ITEM_DEFS = [
  { to: '/profile',          icon: User,          key: 'washer.menu.profile'   },
  { to: '/washer/earnings',  icon: DollarSign,    key: 'washer.menu.earnings'  },
  { to: '/washer/shop',      icon: ShoppingBag,   key: 'washer.menu.shop'      },
  { to: '/support',          icon: MessageCircle, key: 'washer.menu.support'   },
  { to: '/washer/settings',  icon: Settings,      key: 'washer.menu.settings'  },
]

export default function WasherMenu({ open, onClose, online }) {
  const navigate              = useNavigate()
  const { profile, signOut }  = useAuth()
  const { t }                 = useTranslation()
  const menuRef               = useRef(null)
  const pendingNavRef         = useRef(null)
  const supportUnread         = useSupportUnread()

  const { dismiss } = useHistoryDismissible(open, onClose, 'washer-menu')

  // Escape key → dismiss so the overlay's history entry is cleaned up first.
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, dismiss])

  useEffect(() => {
    if (open) menuRef.current?.focus()
  }, [open])

  // After dismiss() pops the overlay entry → onClose fires → open becomes false
  // → this effect fires and completes any deferred navigation.
  useEffect(() => {
    if (!open && pendingNavRef.current) {
      navigate(pendingNavRef.current)
      pendingNavRef.current = null
    }
  }, [open, navigate])

  async function handleSignOut() {
    dismiss()
    await signOut()
  }

  function go(to) {
    pendingNavRef.current = to
    dismiss()
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (profile?.email?.[0] ?? '?').toUpperCase()

  const displayName = profile?.full_name || profile?.email || 'User'

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={dismiss}
          />

          {/* Menu panel */}
          <Editable id="washer.dashboard.menu">
          <motion.div
            key="menu"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('washer.menu.navigationMenu')}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={MENU_SPRING}
            className="fixed top-0 bottom-0 z-50 w-4/5 max-w-xs flex flex-col bg-surface-elevated backdrop-blur-xl border-e border-edge rounded-e-glass overflow-hidden outline-none"
            style={{ insetInlineStart: 0 }}
          >
            {/* User header */}
            <div
              className="px-5 pb-5 flex items-center gap-4"
              style={{ paddingTop: 'max(2rem, calc(env(safe-area-inset-top, 0px) + 1.5rem))' }}
            >
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shrink-0">
                <span className="text-lg font-extrabold text-surface-elevated">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">{displayName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${online ? 'bg-accent' : 'bg-neutral-500'}`} />
                  <span className={`text-sm ${online ? 'text-accent' : 'text-ink-muted'}`}>
                    {online ? t('washer.toggle.online') : t('washer.toggle.offline')}
                  </span>
                </div>
              </div>
            </div>

            <div className="mx-4 border-t border-edge" />

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-2">
              {MENU_ITEM_DEFS.map(({ to, icon: Icon, key }) => (
                <motion.button
                  key={to}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => go(to)}
                  className="w-full flex items-center gap-3 px-4 min-h-[44px] py-2 text-start touch-manipulation active:bg-white/5 transition-colors"
                >
                  <span className="relative shrink-0 h-9 w-9 rounded-xl bg-accent-muted flex items-center justify-center">
                    <Icon className="h-5 w-5 text-accent" />
                    {to === '/support' && supportUnread > 0 && (
                      <span
                        data-testid="support-unread-dot"
                        className="absolute -top-0.5 -end-0.5 h-2.5 w-2.5 rounded-full bg-accent"
                      />
                    )}
                  </span>
                  <span className="flex-1 text-sm font-medium text-ink text-start">{t(key)}</span>
                  <ChevronRight className="h-4 w-4 text-ink-subtle rtl:rotate-180 shrink-0" />
                </motion.button>
              ))}
            </nav>

            <div className="mx-4 border-t border-edge" />

            {/* Sign out */}
            <div className="pt-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 min-h-[44px] py-2 text-start touch-manipulation active:bg-danger-500/10 transition-colors"
              >
                <span className="shrink-0 h-9 w-9 rounded-xl bg-danger-500/10 flex items-center justify-center">
                  <LogOut className="h-5 w-5 text-danger-500" />
                </span>
                <span className="flex-1 text-sm font-medium text-danger-500 text-start">{t('washer.menu.signOut')}</span>
              </motion.button>
            </div>
          </motion.div>
          </Editable>
        </>
      )}
    </AnimatePresence>
  )
}
