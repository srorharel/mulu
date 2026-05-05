import { motion } from 'framer-motion'

const TAP   = { scale: 0.97 }
const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

// Drop-in <button> replacement with whileTap spring feedback.
// Pass any className (including .btn-* aliases) and it works identically.
// RTL-safe: no directional styles. Works for washer side in Phase E.
export default function MotionButton({ children, className, disabled, ...props }) {
  return (
    <motion.button
      whileTap={disabled ? undefined : TAP}
      transition={SPRING}
      className={className}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  )
}
