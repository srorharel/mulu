import { motion } from 'framer-motion'
import { Navigation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 28 }

export default function NavLauncher({ activeJob }) {
  const { profile } = useAuth()
  const { t }       = useTranslation()

  if (!activeJob) return null
  if (
    typeof activeJob.lat !== 'number' ||
    typeof activeJob.lng !== 'number' ||
    Number.isNaN(activeJob.lat) ||
    Number.isNaN(activeJob.lng)
  ) return null

  const pref  = profile?.nav_app_preference ?? 'waze'
  const label = pref === 'google' ? 'Google Maps' : 'Waze'

  const url = pref === 'google'
    ? `https://www.google.com/maps/dir/?api=1&destination=${activeJob.lat},${activeJob.lng}&travelmode=driving`
    : `https://waze.com/ul?ll=${activeJob.lat},${activeJob.lng}&navigate=yes`

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileTap={{ scale: 0.92 }}
      transition={SPRING}
      aria-label={t('washer.nav.openIn', { app: label })}
      className="fixed z-40 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-xl border bg-glass border-glass-border text-ink"
      style={{
        bottom: 'calc(var(--nav-height, 56px) + var(--drawer-collapsed-height, 120px) + var(--stack-gap, 12px))',
        insetInlineEnd: '1rem',
      }}
    >
      <Navigation className="h-4 w-4 text-accent" />
      {label}
    </motion.a>
  )
}
