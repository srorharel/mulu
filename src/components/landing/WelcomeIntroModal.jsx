import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { X, MapPin, Car, ShieldCheck, Sparkles, ChevronRight } from 'lucide-react'

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

// Pre-signup "about us" screen shown when the user taps the register CTA on the
// landing page. Explains how MULU works, then asks how they want to join: the
// footer splits into two role choices, each routed to its own registration page
// (consumer → /signup/customer, washer → /signup/washer) via onSelectRole.
export default function WelcomeIntroModal({ open, onClose, onSelectRole }) {
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

              <p className="text-xs text-ink-muted text-center mt-5 mb-2">
                {t('landing.intro.signoff')}
              </p>
            </div>

            {/* Role chooser — splits into the two registration flows */}
            <div className="px-6 pb-6 pt-3 shrink-0 flex flex-col gap-2.5">
              <p className="text-[11px] font-semibold text-primary-600 dark:text-accent uppercase tracking-wide text-center">
                {t('landing.intro.chooseRole')}
              </p>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                transition={SPRING}
                onClick={() => onSelectRole('consumer')}
                className="flex items-center gap-3 w-full text-start rounded-2xl bg-primary-600 text-white px-4 py-3.5"
              >
                <div className="rounded-xl bg-white/20 p-2 shrink-0">
                  <Car className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{t('landing.intro.roleCustomer')}</p>
                  <p className="text-[12px] text-white/80 leading-tight mt-0.5">{t('landing.intro.roleCustomerSub')}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-white/90 shrink-0 rtl:rotate-180" />
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                transition={SPRING}
                onClick={() => onSelectRole('washer')}
                className="flex items-center gap-3 w-full text-start rounded-2xl border-2 border-primary-200 dark:border-primary-500/40 px-4 py-3.5"
              >
                <div className="rounded-xl bg-primary-50 dark:bg-primary-500/15 p-2 shrink-0">
                  <Sparkles className="h-5 w-5 text-primary-600 dark:text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink leading-tight">{t('landing.intro.roleWasher')}</p>
                  <p className="text-[12px] text-ink-muted leading-tight mt-0.5">{t('landing.intro.roleWasherSub')}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-ink-muted shrink-0 rtl:rotate-180" />
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
