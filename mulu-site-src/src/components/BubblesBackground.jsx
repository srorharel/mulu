// Decorative, site-wide soap-bubble field. Fixed behind all content, never
// interactive, hidden from AT. Animations auto-disable under prefers-reduced-motion
// via the global rule in index.css.

// Deterministic set (no Math.random) so SSR/build output is stable.
const BUBBLES = [
  { left: '4%', top: '14%', size: 120, dur: 9, delay: 0, tint: 'brand', drift: 'float-slow' },
  { left: '12%', top: '68%', size: 70, dur: 7, delay: 1.2, tint: 'white', drift: 'float' },
  { left: '22%', top: '32%', size: 44, dur: 6, delay: 0.6, tint: 'secondary', drift: 'float' },
  { left: '34%', top: '82%', size: 96, dur: 11, delay: 0.4, tint: 'white', drift: 'float-slow' },
  { left: '46%', top: '10%', size: 56, dur: 8, delay: 1.8, tint: 'brand', drift: 'float' },
  { left: '58%', top: '60%', size: 130, dur: 12, delay: 0.2, tint: 'pale', drift: 'float-slow' },
  { left: '67%', top: '22%', size: 38, dur: 6.5, delay: 1, tint: 'secondary', drift: 'float' },
  { left: '76%', top: '78%', size: 84, dur: 10, delay: 0.8, tint: 'white', drift: 'float-slow' },
  { left: '86%', top: '40%', size: 64, dur: 8.5, delay: 1.5, tint: 'brand', drift: 'float' },
  { left: '92%', top: '12%', size: 48, dur: 7.5, delay: 0.3, tint: 'pale', drift: 'float' },
  { left: '50%', top: '92%', size: 52, dur: 9.5, delay: 1.1, tint: 'white', drift: 'float-slow' },
  { left: '15%', top: '46%', size: 30, dur: 6, delay: 2, tint: 'secondary', drift: 'float' },
]

const TINTS = {
  brand: 'rgba(125,217,162,0.55)',
  secondary: 'rgba(71,209,127,0.45)',
  pale: 'rgba(185,229,203,0.55)',
  white: 'rgba(255,255,255,0.85)',
}

export function BubblesBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className={`absolute rounded-full will-change-transform ${b.drift === 'float-slow' ? 'animate-float-slow' : 'animate-float'}`}
          style={{
            left: b.left,
            top: b.top,
            width: b.size,
            height: b.size,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            opacity: 0.55,
            background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.92), rgba(255,255,255,0) 44%), radial-gradient(circle at 68% 72%, ${TINTS[b.tint]}, rgba(255,255,255,0) 62%)`,
            boxShadow: 'inset 0 0 12px rgba(255,255,255,0.4)',
            border: '1px solid rgba(255,255,255,0.5)',
          }}
        />
      ))}
    </div>
  )
}
