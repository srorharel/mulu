import { Power } from 'lucide-react'
import { motion } from 'framer-motion'

const SPRING = { type: 'spring', stiffness: 300, damping: 28 }

// Floating glass FAB for the online/offline toggle.
// Positioned top-start (= physical top-right in WasherShell's dir="rtl").
// start-* Tailwind logical properties automatically flip to the physical
// right side when rendered inside a dir="rtl" ancestor.
export default function OnlineToggle({ online, onToggle, disabled }) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={SPRING}
      onClick={onToggle}
      disabled={disabled}
      className={`fixed z-40 flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-xl border transition-colors ${
        online
          ? 'bg-primary-500/90 border-primary-400/40 text-white'
          : 'bg-glass border-glass-border text-ink-muted'
      }`}
      style={{
        top:              'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))',
        insetInlineStart: '1rem',   // = right: 1rem in RTL
        minHeight: 44,
      }}
    >
      <Power className="h-4 w-4" />
      {disabled ? '…' : online ? 'Online' : 'Offline'}
    </motion.button>
  )
}
