import { motion, LayoutGroup } from 'framer-motion'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

export default function PillRow({ groupId, options, value, onChange }) {
  return (
    <LayoutGroup id={groupId}>
      <div className="flex rounded-xl overflow-hidden border border-edge bg-surface">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="relative flex-1 py-3 text-sm font-medium transition-colors"
          >
            {value === opt.value && (
              <motion.div
                layoutId={`${groupId}-pill`}
                className="absolute inset-0 bg-accent-muted"
                transition={SPRING}
              />
            )}
            <span className={`relative z-10 ${value === opt.value ? 'text-accent' : 'text-ink-muted'}`}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}
