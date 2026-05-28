import { Link } from 'react-router-dom'
import { Waves, MapPin, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import GlassCard from '../components/ui/GlassCard.jsx'
import useBrandAsset from '../hooks/useBrandAsset.js'

const FEATURE_ICONS = [MapPin, Waves, Clock]

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.1 } },
}
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}
const tapProps = { whileTap: { scale: 0.97 }, transition: { type: 'spring', stiffness: 300, damping: 30 } }

export default function Landing() {
  const { t } = useTranslation()
  const logoSrc = useBrandAsset('main_logo', '/logo.png')

  const FEATURES = [
    { icon: FEATURE_ICONS[0], text: t('landing.feature1') },
    { icon: FEATURE_ICONS[1], text: t('landing.feature2') },
    { icon: FEATURE_ICONS[2], text: t('landing.feature3') },
  ]

  return (
    <div className="bg-mesh flex flex-col min-h-full px-5 py-10">
      <motion.div
        className="flex flex-col gap-5 flex-1"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Hero glass card */}
        <GlassCard className="p-6 flex flex-col items-center gap-4 text-center">
          <motion.div variants={itemVariants}>
            <img
              src={logoSrc}
              alt="Wash"
              width={1104}
              height={975}
              loading="eager"
              className="w-[140px] md:w-[180px] h-auto mx-auto"
            />
            <p className="text-neutral-500 text-sm mt-1 max-w-xs">
              {t('landing.tagline')}
            </p>
          </motion.div>

          <motion.ul className="w-full flex flex-col gap-3 mt-1" variants={containerVariants}>
            {FEATURES.map(({ icon: Icon, text }) => (
              <motion.li
                key={text}
                variants={itemVariants}
                className="flex items-center gap-3 text-sm text-neutral-700"
              >
                <div className="rounded-full bg-primary-50 p-2 shrink-0">
                  <Icon className="h-4 w-4 text-primary-500" />
                </div>
                <span>{text}</span>
              </motion.li>
            ))}
          </motion.ul>
        </GlassCard>

        {/* CTAs */}
        <motion.div variants={itemVariants} className="flex flex-col gap-3 mt-auto">
          <motion.div {...tapProps}>
            <Link to="/signup" className="btn-primary w-full justify-center">
              {t('auth.signup')}
            </Link>
          </motion.div>
          <motion.div {...tapProps}>
            <Link
              to="/login"
              className="btn w-full justify-center border border-primary-200 text-primary-600 hover:bg-primary-50"
            >
              {t('auth.login')}
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  )
}
