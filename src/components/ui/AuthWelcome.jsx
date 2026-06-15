import { motion, useReducedMotion } from 'framer-motion'
import WashMark from './WashMark.jsx'

// "Spotlight Bubbles" welcome header for the auth screens (login + both signups).
// The brand logo sits inside concentric rings with a soft green glow and a few
// gently floating bubbles — playful and on-theme for car wash, built only from
// the existing primary-* palette. RTL-safe (no directional styles) and honors
// prefers-reduced-motion: rings and bubbles hold still when motion is reduced.
const BUBBLES = [
  { size: 10, top: '4%',   right: '18%', dur: 3.6 },
  { size: 6,  top: '34%',  left:  '14%', dur: 4.4 },
  { size: 7,  bottom: '6%', right: '24%', dur: 4.0 },
  { size: 5,  bottom: '24%', left: '22%', dur: 4.8 },
]

export default function AuthWelcome({ title, subtitle, logoSize = 46 }) {
  const reduce = useReducedMotion()

  const ring = (extra) =>
    reduce ? {} : { animate: { scale: [1, 1.05, 1], opacity: [0.55, 0.3, 0.55], ...extra }, transition: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative h-28 w-28 mb-1">
        {/* soft spotlight glow */}
        <div className="absolute -inset-1 rounded-full bg-primary-300/25 blur-2xl" aria-hidden="true" />

        {/* concentric rings */}
        <motion.span {...ring()} className="absolute inset-0 rounded-full border border-primary-300/50" aria-hidden="true" />
        <motion.span
          {...(reduce ? {} : { animate: { scale: [1, 1.035, 1] }, transition: { duration: 6, repeat: Infinity, ease: 'easeInOut' } })}
          className="absolute inset-3 rounded-full border-[1.5px] border-primary-400/55"
          aria-hidden="true"
        />

        {/* core medallion with the real logo */}
        <div className="absolute inset-[22px] rounded-full bg-white dark:bg-surface-elevated shadow-[0_10px_28px_rgba(38,181,95,0.32)] flex items-center justify-center">
          <WashMark size={logoSize} className="rounded-[12px]" />
        </div>

        {/* floating bubbles */}
        {BUBBLES.map((b, i) => (
          <motion.span
            key={i}
            {...(reduce ? {} : { animate: { y: [0, -6, 0] }, transition: { duration: b.dur, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 } })}
            style={{ width: b.size, height: b.size, top: b.top, bottom: b.bottom, left: b.left, right: b.right }}
            className="absolute rounded-full bg-primary-300/60"
            aria-hidden="true"
          />
        ))}
      </div>

      <h1 className="text-2xl font-bold text-neutral-900 dark:text-ink leading-tight">{title}</h1>
      {subtitle && (
        <p className="text-neutral-500 dark:text-ink-muted text-sm mt-1.5 max-w-xs leading-relaxed">{subtitle}</p>
      )}
    </div>
  )
}
