import { motion, useReducedMotion } from 'framer-motion'

// The brand logo filling a circular badge, ringed by a soft green glow and a few
// gently floating bubbles — the shared "Spotlight Bubbles" motif used across the
// entry flow (Landing hero + auth screens). The logo image fills the circle
// (object-cover) so no white shows behind it; a thin white ring frames it for
// contrast against the green mesh. Built only from the existing primary-* palette.
// RTL-safe and honors prefers-reduced-motion (everything holds still).
//
// `size` is the overall medallion diameter in px; the badge, ring and bubbles all
// scale from it so it looks right at any size.
const BUBBLES = [
  { size: 0.09,  top: '3%',    right: '15%', dur: 3.6 },
  { size: 0.055, top: '32%',   left:  '11%', dur: 4.4 },
  { size: 0.065, bottom: '5%', right: '21%', dur: 4.0 },
  { size: 0.045, bottom: '24%', left: '19%', dur: 4.8 },
]

export default function LogoSpotlight({ size = 118, animate = true }) {
  const reduce = useReducedMotion()
  const motionOn = animate && !reduce
  const ringWidth = Math.max(3, Math.round(size * 0.03))

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* soft spotlight glow */}
      <div className="absolute -inset-1 rounded-full bg-primary-300/30 blur-2xl" aria-hidden="true" />

      {/* concentric rings */}
      <motion.span
        {...(motionOn ? { animate: { scale: [1, 1.05, 1], opacity: [0.55, 0.3, 0.55] }, transition: { duration: 5, repeat: Infinity, ease: 'easeInOut' } } : {})}
        className="absolute inset-0 rounded-full border border-primary-300/50"
        aria-hidden="true"
      />
      <motion.span
        {...(motionOn ? { animate: { scale: [1, 1.035, 1] }, transition: { duration: 6, repeat: Infinity, ease: 'easeInOut' } } : {})}
        className="absolute rounded-full border-[1.5px] border-primary-400/55"
        style={{ inset: '7%' }}
        aria-hidden="true"
      />

      {/* logo badge — fills the circle, white ring frames it (no white behind) */}
      <div
        className="absolute overflow-hidden rounded-full border-white bg-primary-600 shadow-[0_12px_30px_rgba(38,181,95,0.35)]"
        style={{ inset: '15%', borderWidth: ringWidth }}
      >
        <img
          src="/logo.png"
          alt="MULU"
          draggable={false}
          className="h-full w-full object-cover select-none scale-[1.04]"
        />
      </div>

      {/* floating bubbles */}
      {BUBBLES.map((b, i) => (
        <motion.span
          key={i}
          {...(motionOn ? { animate: { y: [0, -6, 0] }, transition: { duration: b.dur, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 } } : {})}
          style={{ width: size * b.size, height: size * b.size, top: b.top, bottom: b.bottom, left: b.left, right: b.right }}
          className="absolute rounded-full bg-primary-300/60"
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
