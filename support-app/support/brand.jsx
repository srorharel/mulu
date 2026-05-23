// Wash — shared brand bits used by the Support app.
// Only the logo image + the dark map background.

const WashLogo = ({ size = 40, style }) => (
  <img src="assets/wash-logo.png" alt="Wash"
    style={{
      width: size, height: size, objectFit: 'contain',
      display: 'block', filter: 'drop-shadow(0 4px 10px rgba(38,181,95,0.28))',
      ...style,
    }}/>
);

// Dark map placeholder (matches consumer-app map style)
const MapBG = ({ dark, style }) => {
  const land = dark ? '#1a1d27' : '#E9EEF2';
  const road = dark ? '#2a2d3a' : '#FFFFFF';
  const stroke = dark ? '#3a3e4d' : '#dbe2e9';
  const park = dark ? '#1f2a23' : '#DCE9DD';
  const water = dark ? '#1a2535' : '#CDDBE8';
  return (
    <svg viewBox="0 0 390 600" preserveAspectRatio="xMidYMid slice" style={{ display: 'block', ...style }}>
      <rect width="390" height="600" fill={land}/>
      <path d="M0 420 Q 80 380 160 410 T 320 400 L 390 420 L 390 600 L 0 600 Z" fill={park} opacity="0.7"/>
      <ellipse cx="350" cy="120" rx="90" ry="60" fill={water} opacity="0.85"/>
      <g stroke={stroke} strokeWidth="1">
        <path d="M-10 200 L 410 240" stroke={road} strokeWidth="22"/>
        <path d="M-10 200 L 410 240" />
        <path d="M-10 380 L 410 420" stroke={road} strokeWidth="18"/>
        <path d="M-10 380 L 410 420"/>
        <path d="M120 -10 L 100 610" stroke={road} strokeWidth="16"/>
        <path d="M120 -10 L 100 610"/>
        <path d="M260 -10 L 280 610" stroke={road} strokeWidth="14"/>
        <path d="M260 -10 L 280 610"/>
        <path d="M40 60 L 200 100 L 260 160" stroke={road} strokeWidth="10"/>
        <path d="M40 60 L 200 100 L 260 160"/>
        <path d="M180 480 L 380 540" stroke={road} strokeWidth="10"/>
        <path d="M180 480 L 380 540"/>
      </g>
      <g fill={dark ? '#22252f' : '#dbe2e9'} opacity={dark ? 0.55 : 0.5}>
        <rect x="20" y="240" width="58" height="120" rx="3"/>
        <rect x="130" y="252" width="100" height="110" rx="3"/>
        <rect x="290" y="266" width="80" height="100" rx="3"/>
        <rect x="20" y="60" width="60" height="120" rx="3"/>
        <rect x="148" y="50" width="60" height="40" rx="3"/>
      </g>
    </svg>
  );
};

Object.assign(window, { WashLogo, MapBG });
