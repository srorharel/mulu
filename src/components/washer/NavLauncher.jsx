import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'
import wazeLogo from '../../assets/waze.svg'
import googleMapsLogo from '../../assets/google-maps.svg'

const SPRING = { type: 'spring', stiffness: 300, damping: 28 }

// Icon-only nav launcher, anchored by its parent (under the EarningsWidget in the
// Dashboard top-chrome). The logo + deep-link follow the washer's nav_app_preference
// (Waze by default; Google Maps if chosen) — so Google-Maps washers keep their choice.
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

  const useGoogle = (profile?.nav_app_preference ?? 'waze') === 'google'
  const logo  = useGoogle ? googleMapsLogo : wazeLogo
  const label = useGoogle
    ? t('washer.nav.openIn', { app: 'Google Maps' })
    : t('washer.nav.openInWaze')
  const url = useGoogle
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
      aria-label={label}
      className="flex items-center justify-center w-11 h-11 rounded-2xl shadow-lg backdrop-blur-xl border bg-glass border-glass-border shrink-0"
    >
      <img src={logo} alt="" aria-hidden="true" className="w-6 h-6" />
    </motion.a>
  )
}
