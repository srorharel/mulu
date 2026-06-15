import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Waves, MapPin, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import GlassCard from '../components/ui/GlassCard.jsx'
import WelcomeIntroModal from '../components/landing/WelcomeIntroModal.jsx'
import LogoSpotlight from '../components/ui/LogoSpotlight.jsx'

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
  const navigate = useNavigate()
  const [introOpen, setIntroOpen] = useState(false)

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
        <GlassCard className="p-7 flex flex-col items-center gap-6 text-center">
          <motion.div variants={itemVariants} className="flex flex-col items-center">
            <LogoSpotlight size={200} />
            <h1 className="text-[26px] font-bold text-neutral-900 mt-5 leading-tight">
              {t('landing.heroTitle')}
            </h1>
            <p className="text-neutral-500 text-[15px] mt-2 max-w-xs leading-relaxed">
              {t('landing.tagline')}
            </p>
          </motion.div>

          <motion.ul className="w-full flex flex-col gap-3" variants={containerVariants}>
            {FEATURES.map(({ icon: Icon, text }) => (
              <motion.li
                key={text}
                variants={itemVariants}
                className="flex items-center gap-3.5 rounded-2xl bg-white/55 border border-primary-100 px-4 py-3 text-start"
              >
                <div className="rounded-xl bg-primary-50 p-2.5 shrink-0">
                  <Icon className="h-5 w-5 text-primary-600" />
                </div>
                <span className="text-[15px] font-medium text-neutral-700">{text}</span>
              </motion.li>
            ))}
          </motion.ul>
        </GlassCard>

        {/* CTAs */}
        <motion.div variants={itemVariants} className="flex flex-col gap-3 mt-auto pt-2">
          <motion.div {...tapProps}>
            <button
              type="button"
              onClick={() => setIntroOpen(true)}
              className="btn-primary w-full justify-center text-base py-4"
            >
              {t('landing.ctaStart')}
            </button>
          </motion.div>
          <motion.div {...tapProps}>
            <Link
              to="/login"
              className="btn w-full justify-center border border-primary-200 text-primary-600 hover:bg-primary-50 text-base py-4"
            >
              {t('auth.login')}
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>

      <WelcomeIntroModal
        open={introOpen}
        onClose={() => setIntroOpen(false)}
        onSelectRole={(role) => {
          setIntroOpen(false)
          navigate(role === 'washer' ? '/signup/washer' : '/signup/customer')
        }}
      />
    </div>
  )
}
