// Wash — shared primitives, mesh background, icons, glass cards
// Tokens from design.md (§2). Mobile-first 390px frame.

// ─── Tokens ─────────────────────────────────────────────────
const W = {
  // Surfaces
  surface:        '#fafafa',
  surfaceEl:      '#ffffff',
  ink:            '#171717',
  inkMuted:       '#737373',
  inkSubtle:      '#9ca3af',
  edge:           '#f5f5f5',
  // Brand greens
  g50:  '#F3FCF7',
  g100: '#E5F6EC',
  g200: '#D4EDDE',
  g300: '#B9E5CB',
  g400: '#9CDEB6',
  g500: '#7DD9A2',
  g600: '#47D17F',
  g700: '#26B55F',
  g800: '#1C8747',
  g900: '#135C30',
  // State
  warn:  '#f59e0b',
  danger:'#ef4444',
  // Glass
  glass:        'rgba(255,255,255,0.60)',
  glassBorder:  'rgba(255,255,255,0.55)',
  glassDark:    'rgba(26,29,39,0.50)',
  // Dark surfaces (washer)
  dSurface:    '#0f1117',
  dElevated:   '#1a1d27',
  dEdge:       '#2a2d3a',
  dInk:        '#f5f5f5',
  dInkMuted:   '#a3a3a3',
};

// ─── Mesh background (consumer) ─────────────────────────────
const MeshBG = ({ style }) => (
  <div style={{
    position: 'absolute', inset: 0,
    background: [
      'radial-gradient(at 18% 6%, rgba(125,217,162,0.42), transparent 42%)',
      'radial-gradient(at 88% 0%, rgba(125,217,162,0.22), transparent 38%)',
      'radial-gradient(at 100% 78%, rgba(245,158,11,0.16), transparent 45%)',
      'radial-gradient(at 0% 100%, rgba(125,217,162,0.30), transparent 45%)',
      W.surface,
    ].join(','),
    ...style,
  }} />
);

const MeshDark = ({ style }) => (
  <div style={{
    position: 'absolute', inset: 0,
    background: [
      'radial-gradient(at 20% 0%, rgba(125,217,162,0.14), transparent 50%)',
      'radial-gradient(at 100% 100%, rgba(47,209,127,0.10), transparent 45%)',
      W.dSurface,
    ].join(','),
    ...style,
  }} />
);

// ─── Glass card ─────────────────────────────────────────────
const GlassCard = ({ children, style, dark, padding = 16, radius = 22 }) => (
  <div style={{
    background: dark ? W.glassDark : W.glass,
    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : W.glassBorder}`,
    backdropFilter: 'blur(20px) saturate(160%)',
    WebkitBackdropFilter: 'blur(20px) saturate(160%)',
    borderRadius: radius,
    padding,
    boxShadow: dark
      ? '0 4px 16px rgba(0,0,0,0.35)'
      : '0 6px 20px rgba(15,40,30,0.06), 0 2px 6px rgba(15,40,30,0.04)',
    ...style,
  }}>{children}</div>
);

// ─── Lucide-style icon set (24px stroke=2) ──────────────────
const ic = (children, vb = '0 0 24 24') => (p) => (
  <svg viewBox={vb} fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);
const Icon = {
  MapPin:    ic(<><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></>),
  Navigation:ic(<polygon points="3 11 22 2 13 21 11 13 3 11"/>),
  Camera:    ic(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>),
  Plus:      ic(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
  Droplet:   ic(<path d="M12 2.7s7 7.3 7 12.3a7 7 0 1 1-14 0c0-5 7-12.3 7-12.3z"/>),
  Zap:       ic(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>),
  Check:     ic(<polyline points="20 6 9 17 4 12"/>),
  CheckCircle:ic(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>),
  Loader:    ic(<><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></>),
  Alert:     ic(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>),
  ChevronR:  ic(<polyline points="9 18 15 12 9 6"/>),
  ChevronD:  ic(<polyline points="6 9 12 15 18 9"/>),
  Phone:     ic(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>),
  Message:   ic(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>),
  Star:      ic(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>),
  Home:      ic(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>),
  Clock:     ic(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>),
  User:      ic(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>),
  Power:     ic(<><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></>),
  Menu:      ic(<><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>),
  ArrowL:    ic(<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>),
  X:         ic(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>),
  Car:       ic(<><path d="M5 17h14l-1.5-7.5A2 2 0 0 0 15.55 8h-7.1A2 2 0 0 0 6.5 9.5L5 17z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></>),
  Filter:    ic(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>),
  Shield:    ic(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>),
  Sparkles:  ic(<><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 14l.8 1.8 1.8.7-1.8.7-.8 1.8-.8-1.8-1.8-.7 1.8-.7z" strokeWidth="1.5"/></>, '0 0 24 24'),
};

// ─── Israeli license plate visual ───────────────────────────
const IsraeliPlate = ({ number = '12-345-67', size = 1 }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'stretch',
    height: 38 * size, borderRadius: 6 * size,
    background: '#FFE74A', border: '1.5px solid #2a2a2a',
    boxShadow: '0 1px 0 rgba(0,0,0,0.1)',
    overflow: 'hidden', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  }}>
    <div style={{
      width: 14 * size, background: '#1452AF',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4,
      color: '#FFE74A', fontSize: 7 * size, fontWeight: 700, letterSpacing: 0,
    }}>IL</div>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: `0 ${10 * size}px`, fontSize: 20 * size, fontWeight: 800,
      color: '#1a1a1a', letterSpacing: 1.5,
    }}>{number}</div>
  </div>
);

// ─── Status bar dimensions ──────────────────────────────────
const SAFE_TOP = 54;   // status bar height (iOS frame)
const SAFE_BOT = 34;   // home indicator

// ─── Bottom tab nav (consumer) ──────────────────────────────
const BottomNav = ({ active = 'home' }) => {
  const tabs = [
    { id: 'home',    label: 'Home',    Ic: Icon.Home },
    { id: 'history', label: 'History', Ic: Icon.Clock },
    { id: 'profile', label: 'Profile', Ic: Icon.User },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingBottom: SAFE_BOT, paddingTop: 6, paddingLeft: 16, paddingRight: 16,
      background: 'rgba(255,255,255,0.78)',
      backdropFilter: 'blur(24px) saturate(160%)',
      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      borderTop: `1px solid ${W.edge}`,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      zIndex: 30,
    }}>
      {tabs.map(t => (
        <div key={t.id} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 3, padding: '6px 14px', borderRadius: 14,
          background: active === t.id ? W.g100 : 'transparent',
          color: active === t.id ? W.g800 : W.inkMuted,
          minWidth: 60,
        }}>
          <t.Ic width="22" height="22" />
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.1 }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
};

// ─── Wash wordmark ──────────────────────────────────────────
const WashMark = ({ size = 22, color = W.g800 }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 7,
    fontFamily: 'Inter, system-ui', fontWeight: 800, fontSize: size,
    letterSpacing: -0.6, color,
  }}>
    <div style={{
      width: size * 1.05, height: size * 1.05, borderRadius: '50%',
      background: `radial-gradient(circle at 35% 30%, ${W.g300}, ${W.g600})`,
      boxShadow: `inset 0 -2px 4px rgba(0,0,0,0.08), 0 1px 3px rgba(38,181,95,0.35)`,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: '18%', left: '24%',
        width: '30%', height: '20%', borderRadius: '50%',
        background: 'rgba(255,255,255,0.7)', filter: 'blur(1px)',
      }}/>
    </div>
    wash
  </div>
);

// ─── Map placeholder (light + dark) ─────────────────────────
const MapBG = ({ dark, style }) => {
  const land = dark ? '#1a1d27' : '#E9EEF2';
  const road = dark ? '#2a2d3a' : '#FFFFFF';
  const stroke = dark ? '#3a3e4d' : '#dbe2e9';
  const park = dark ? '#1f2a23' : '#DCE9DD';
  const water = dark ? '#1a2535' : '#CDDBE8';
  return (
    <svg viewBox="0 0 390 600" preserveAspectRatio="xMidYMid slice" style={{ display: 'block', ...style }}>
      <rect width="390" height="600" fill={land}/>
      {/* park */}
      <path d="M0 420 Q 80 380 160 410 T 320 400 L 390 420 L 390 600 L 0 600 Z" fill={park} opacity="0.7"/>
      {/* water blob */}
      <ellipse cx="350" cy="120" rx="90" ry="60" fill={water} opacity="0.85"/>
      {/* roads */}
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
      {/* blocks (subtle) */}
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

Object.assign(window, { W, MeshBG, MeshDark, GlassCard, Icon, IsraeliPlate, BottomNav, WashMark, MapBG, SAFE_TOP, SAFE_BOT });
