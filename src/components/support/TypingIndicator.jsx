import { motion } from 'framer-motion'

const DOT = {
  animate: { y: [0, -5, 0] },
  transition: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' },
}

export default function TypingIndicator({ label }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="bg-glass border border-glass-border backdrop-blur-sm rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1">
        {[0, 0.15, 0.3].map((delay, i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-ink-muted/60"
            animate={DOT.animate}
            transition={{ ...DOT.transition, delay }}
          />
        ))}
      </div>
      {label && <span className="text-xs text-ink-muted/60">{label}</span>}
    </div>
  )
}
