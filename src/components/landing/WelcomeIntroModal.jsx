import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { X, MapPin, Car, ShieldCheck, Gift } from 'lucide-react'

const SPRING = { type: 'spring', stiffness: 340, damping: 30 }

const STEPS = [
  { icon: MapPin,      key: 'step1' },
  { icon: Car,         key: 'step2' },
  { icon: ShieldCheck, key: 'step3' },
]

const listVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
}
const stepVariants = {
  hidden:  { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

// Pre-signup intro shown when the user taps the register CTA on the landing
// page. Purely informational — primary CTA continues to /signup, anything
// else dismisses.
export default function WelcomeIntroModal({ open, onClose, onContinue }) {
  const { t } = useTranslation()

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 48, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 48, scale: 0.97 }}
            transition={SPRING}
            role="dialog"
            aria-modal="true"
            aria-label={t('landing.intro.title')}
            className="w-full max-w-md bg-white dark:bg-surface-elevated rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: 'min(90dvh, 720px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative px-6 pt-6 pb-4 shrink-0 bg-gradient-to-b from-primary-50 to-transparent dark:from-primary-500/10">
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="absolute top-4 end-4 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-2xl font-bold text-ink leading-tight">
                {t('landing.intro.title')}
              </h2>
              <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                {t('landing.intro.subtitle')}
              </p>
            </div>

            {/* How it works */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
              <p className="text-[11px] font-semibold text-primary-600 dark:text-accent uppercase tracking-wide mb-3">
                {t('landing.intro.howItWorks')}
              </p>
              <motion.ol
                className="flex flex-col gap-4"
                variants={listVariants}
                initial="hidden"
                animate="visible"
              >
                {STEPS.map(({ icon: Icon, key }, i) => (
                  <motion.li key={key} variants={stepVariants} className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div className="rounded-xl bg-primary-50 dark:bg-primary-500/15 p-2.5">
                        <Icon className="h-5 w-5 text-primary-500" />
                      </div>
                      <span className="absolute -top-1.5 -start-1.5 h-5 w-5 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700 dark:text-ink-muted leading-relaxed pt-1">
                      {t(`landing.intro.${key}`)}
                    </p>
                  </motion.li>
                ))}
              </motion.ol>

              {/* Joining gift */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.45, duration: 0.25 } }}
                className="mt-5 rounded-2xl border border-primary-200 dark:border-primary-500/30 bg-primary-50/70 dark:bg-primary-500/10 p-4 flex items-center gap-3"
              >
                <div className="rounded-full bg-primary-500 p-2.5 shrink-0">
                  <Gift className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-primary-700 dark:text-accent">
                    {t('landing.intro.giftTitle')}
                  </p>
                  <p className="text-sm text-primary-700/80 dark:text-ink-muted">
                    {t('landing.intro.giftText')}
                  </p>
                </div>
              </motion.div>

              <p className="text-xs text-ink-muted text-center mt-4 mb-2">
                {t('landing.intro.signoff')}
              </p>
            </div>

            {/* CTAs */}
            <div className="px-6 pb-6 pt-3 shrink-0 flex flex-col gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                transition={SPRING}
                onClick={onContinue}
                className="w-full py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold"
              >
                {t('landing.intro.cta')}
              </motion.button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-sm font-medium text-neutral-500 dark:text-ink-muted"
              >
                {t('landing.intro.later')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
