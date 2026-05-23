import { motion } from 'framer-motion'

export default function TypingIndicator({ label }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="bg-surface-elevated border border-edge rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1">
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-ink-muted/60"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay }}
          />
        ))}
      </div>
      {label && <span className="text-xs text-ink-muted/60">{label}</span>}
    </div>
  )
}
