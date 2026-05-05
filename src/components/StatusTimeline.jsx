import { motion } from 'framer-motion'
import { CheckCircle, Circle } from 'lucide-react'

const STEPS = [
  { key: 'pending',      label: 'Order placed' },
  { key: 'accepted',     label: 'Washer accepted' },
  { key: 'en_route',    label: 'Washer on the way' },
  { key: 'arrived',     label: 'Washer arrived' },
  { key: 'in_progress', label: 'Washing in progress' },
  { key: 'completed',   label: 'Completed' },
]

const ORDER = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'completed']

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

export default function StatusTimeline({ status }) {
  const currentIdx = ORDER.indexOf(status)

  return (
    <ol className="flex flex-col gap-0">
      {STEPS.map(({ key, label }, i) => {
        const done   = i < currentIdx
        const active = i === currentIdx
        const future = i > currentIdx
        return (
          <li key={key} className="flex gap-3">
            <div className="flex flex-col items-center">
              {/* Indicator slot — fixed size so layout stays stable */}
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
                  // layoutId morphs this element from old step position to new step position
                  // when `status` prop changes between renders.
                  <motion.div
                    layoutId="timeline-active-indicator"
                    className="h-5 w-5 rounded-full border-4 border-primary-500 bg-white"
                    transition={SPRING}
                  />
                ) : (
                  <Circle className="h-5 w-5 text-neutral-200" />
                )}
              </div>

              {i < STEPS.length - 1 && (
                <div
                  className={`w-0.5 flex-1 my-1 transition-colors duration-300 ${done ? 'bg-success-500' : 'bg-neutral-100'}`}
                  style={{ minHeight: 20 }}
                />
              )}
            </div>

            <p className={`pb-4 text-sm ${
              active  ? 'font-semibold text-neutral-900' :
              future  ? 'text-neutral-300' :
                        'text-neutral-500'
            }`}>
              {label}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
