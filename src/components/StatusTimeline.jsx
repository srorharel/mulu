import { motion } from 'framer-motion'
import { CheckCircle, Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const STEP_KEYS = [
  { key: 'pending',      i18nKey: 'status.pending'      },
  { key: 'accepted',     i18nKey: 'status.accepted'     },
  { key: 'en_route',     i18nKey: 'status.en_route'     },
  { key: 'arrived',      i18nKey: 'status.arrived'      },
  { key: 'in_progress',  i18nKey: 'status.in_progress'  },
  { key: 'completed',    i18nKey: 'status.completed'    },
]

const ORDER = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed']

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

export default function StatusTimeline({ status }) {
  const { t } = useTranslation()
  const currentIdx = ORDER.indexOf(status)

  return (
    <ol className="flex flex-col gap-0">
      {STEP_KEYS.map(({ key, i18nKey }, i) => {
        const done   = i < currentIdx
        const active = i === currentIdx
        const future = i > currentIdx
        return (
          <li key={key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="relative h-5 w-5 shrink-0 flex items-center justify-center">
                {done ? (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={SPRING}
                  >
                    <CheckCircle className="h-5 w-5 text-success-500" />
                  </motion.div>
                ) : active ? (
                  <motion.div
                    layoutId="timeline-active-indicator"
                    className="h-5 w-5 rounded-full border-4 border-primary-500 bg-surface-elevated"
                    transition={SPRING}
                  />
                ) : (
                  <Circle className="h-5 w-5 text-ink-subtle" />
                )}
              </div>

              {i < STEP_KEYS.length - 1 && (
                <div
                  className={`w-0.5 flex-1 my-1 transition-colors duration-300 ${done ? 'bg-success-500' : 'bg-edge'}`}
                  style={{ minHeight: 20 }}
                />
              )}
            </div>

            <p className={`pb-4 text-sm ${
              active  ? 'font-semibold text-ink' :
              future  ? 'text-ink-subtle' :
                        'text-ink-muted'
            }`}>
              {t(i18nKey)}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
