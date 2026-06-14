// MULU brand mark — the real 3D-rendered logo tile (public/logo.png), the same
// image used for the phone app icon, so every logo in the app matches it exactly.
export default function WashMark({ size = 34, className = '' }) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt="MULU"
      className={`shrink-0 select-none ${className}`}
      draggable={false}
    />
  )
}
