// "wash" wordmark — green gradient sphere + Inter 800 text.
// Radial gradient and inset shadow use inline styles (no Tailwind equivalent).
export default function WashMark({ className = '' }) {
  return (
    <div className={`inline-flex items-center gap-[7px] font-extrabold text-[22px] text-primary-800 tracking-[-0.6px] leading-none ${className}`}>
      <div
        className="relative rounded-full shrink-0"
        style={{
          width: 23,
          height: 23,
          background: 'radial-gradient(circle at 35% 30%, #B9E5CB, #47D17F)',
          boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.08), 0 1px 3px rgba(38,181,95,0.35)',
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            top: '18%', left: '24%',
            width: '30%', height: '20%',
            background: 'rgba(255,255,255,0.7)',
            filter: 'blur(1px)',
          }}
        />
      </div>
      wash
    </div>
  )
}
