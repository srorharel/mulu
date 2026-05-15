// Static map placeholder SVG — ported from MOCKUP/brand.jsx.
// Used on Order Tracking per ADR-013 (live map deferred).
// Light mode only; dark variant not needed for consumer screens.
export default function MapBG({ className = '' }) {
  return (
    <svg
      viewBox="0 0 390 600"
      preserveAspectRatio="xMidYMid slice"
      className={`block ${className}`}
      aria-hidden="true"
    >
      <rect width="390" height="600" fill="#E9EEF2" />
      {/* Park area */}
      <path d="M0 420 Q 80 380 160 410 T 320 400 L 390 420 L 390 600 L 0 600 Z" fill="#DCE9DD" opacity="0.7" />
      {/* Water blob */}
      <ellipse cx="350" cy="120" rx="90" ry="60" fill="#CDDBE8" opacity="0.85" />
      {/* Roads */}
      <g stroke="#dbe2e9" strokeWidth="1">
        <path d="M-10 200 L 410 240" stroke="#FFFFFF" strokeWidth="22" />
        <path d="M-10 200 L 410 240" />
        <path d="M-10 380 L 410 420" stroke="#FFFFFF" strokeWidth="18" />
        <path d="M-10 380 L 410 420" />
        <path d="M120 -10 L 100 610" stroke="#FFFFFF" strokeWidth="16" />
        <path d="M120 -10 L 100 610" />
        <path d="M260 -10 L 280 610" stroke="#FFFFFF" strokeWidth="14" />
        <path d="M260 -10 L 280 610" />
        <path d="M40 60 L 200 100 L 260 160" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M40 60 L 200 100 L 260 160" />
        <path d="M180 480 L 380 540" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M180 480 L 380 540" />
      </g>
      {/* City blocks */}
      <g fill="#dbe2e9" opacity="0.5">
        <rect x="20" y="240" width="58" height="120" rx="3" />
        <rect x="130" y="252" width="100" height="110" rx="3" />
        <rect x="290" y="266" width="80" height="100" rx="3" />
        <rect x="20" y="60" width="60" height="120" rx="3" />
        <rect x="148" y="50" width="60" height="40" rx="3" />
      </g>
    </svg>
  )
}
