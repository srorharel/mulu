// MULU brand mark — the real logo (3D green tile with rounded white "MULU"),
// recolored to the app palette (#5FDC95 → #26B55F, deep #1C8747). Identical SVG
// to the marketing site's LogoTile. Baloo 2 is loaded via the @import in
// index.css; falls back to system-ui rounded if unavailable.
export default function WashMark({ size = 34, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="MULU"
    >
      <defs>
        <linearGradient id="mulu-tile-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5FDC95" />
          <stop offset="1" stopColor="#26B55F" />
        </linearGradient>
      </defs>
      <rect x="3" y="6" width="94" height="91" rx="26" fill="#1C8747" opacity="0.45" />
      <rect x="3" y="3" width="94" height="94" rx="26" fill="url(#mulu-tile-g)" />
      <ellipse cx="50" cy="16" rx="42" ry="12" fill="rgba(255,255,255,0.18)" />
      <text
        x="50" y="63"
        textAnchor="middle"
        fontFamily="'Baloo 2','Heebo',system-ui,sans-serif"
        fontWeight="800"
        fontSize="33"
        fill="#1C8747"
        opacity="0.4"
        transform="translate(0 2.5)"
      >
        MULU
      </text>
      <text
        x="50" y="63"
        textAnchor="middle"
        fontFamily="'Baloo 2','Heebo',system-ui,sans-serif"
        fontWeight="800"
        fontSize="33"
        fill="#FFFFFF"
      >
        MULU
      </text>
    </svg>
  )
}
