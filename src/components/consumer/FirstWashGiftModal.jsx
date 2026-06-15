import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Gift, Sparkles } from 'lucide-react'

const SPRING = { type: 'spring', stiffness: 340, damping: 30 }

// Celebratory panel shown once to a brand-new consumer on their first visit to
// /home, announcing the first-wash discount. Purely informational — the actual
// discount is enforced server-side in validate_order_prices (ADR-040). The
// caller gates on first-wash eligibility + a per-user "seen" flag.
export default function FirstWashGiftModal({ open, percent, onClose }) {
  const { t } = useTranslation()

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.95 }}
            transition={SPRING}
            role="dialog"
            aria-modal="true"
            aria-label={t('firstWashGift.title')}
            className="w-full max-w-sm bg-white dark:bg-surface-elevated rounded-[28px] shadow-2xl overflow-hidden text-center"
            onClick={e => e.stopPropagation()}
          >
            {/* Festive header */}
            <div className="relative px-6 pt-8 pb-6 bg-gradient-to-b from-primary-500 to-primary-600 text-white overflow-hidden">
              <Sparkles className="absolute top-4 start-5 h-4 w-4 text-white/50" />
              <Sparkles className="absolute top-7 end-7 h-5 w-5 text-white/40" />
              <Sparkles className="absolute bottom-4 start-10 h-3 w-3 text-white/40" />
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0, transition: { ...SPRING, delay: 0.1 } }}
                className="mx-auto w-16 h-16 rounded-full bg-white/20 flex items-center justify-center"
              >
                <Gift className="h-8 w-8 text-white" />
              </motion.div>
              <p className="mt-3 inline-block rounded-full bg-white text-primary-700 text-sm font-extrabold px-3 py-1">
                {t('firstWashGift.badge', { percent })}
              </p>
            </div>

            {/* Body */}
            <div className="px-6 pt-5 pb-6 flex flex-col gap-2">
              <h2 className="text-2xl font-bold text-ink leading-tight">
                {t('firstWashGift.title')}
              </h2>
              <p className="text-sm text-ink-muted leading-relaxed">
                {t('firstWashGift.body', { percent })}
              </p>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                transition={SPRING}
                onClick={onClose}
                className="mt-3 w-full py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold"
              >
                {t('firstWashGift.cta')}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
