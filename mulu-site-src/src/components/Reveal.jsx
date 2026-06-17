import { motion, useReducedMotion } from 'framer-motion'

// Scroll-into-view reveal. Honors prefers-reduced-motion (no transform/opacity
// animation when the user opts out) and only fires once.
export function Reveal({ children, delay = 0, y = 20, className = '', as = 'div' }) {
  const reduce = useReducedMotion()
  const M = motion[as] || motion.div
  return (
    <M
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </M>
  )
}

// Staggered container — children using <Reveal> with incremental delay read nicer,
// but for simple grids pass index*0.06 as delay.
export function stagger(i, base = 0.06) {
  return i * base
}
