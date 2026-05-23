// Wash — Support app screens (agent-only, dark, desktop)
// Tokens per Support-design.md. Violet agent accent #7C3AED.

// ─── Tokens ─────────────────────────────────────────────────
const S = {
  surface:     '#0c0d12',
  surfaceEl:   '#15171f',
  surfaceEl2:  '#1a1d27',
  surfaceHi:   '#22252f',
  ink:         '#f4f5f7',
  inkMuted:    '#a3a8b8',
  inkSubtle:   '#6b7388',
  edge:        '#23262f',
  edgeStrong:  '#2e323d',
  accent:      '#7DD9A2', // brand green
  agent:       '#3FB58F', // teal-green (agent UI) — Wash brand-family, distinct from consumer light green
  agentDeep:   '#1F7A5E',
  agentSoft:   'rgba(63,181,143,0.16)',
  success:     '#22c55e',
  warning:     '#f59e0b',
  danger:      '#ef4444',
  sans:        'Inter, system-ui, -apple-system, sans-serif',
  mono:        'ui-monospace, "SF Mono", Menlo, monospace',
};

// ─── Tiny lucide-style icons (24-grid) ──────────────────────
const sic = (children) => (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);
const SIcon = {
  MessageSquare: sic(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>),
  CheckSquare:   sic(<><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>),
  Ticket:        sic(<><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/><path d="M13 5v2M13 17v2M13 11v2"/></>),
  Search:        sic(<><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>),
  Settings:      sic(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>),
  Paperclip:     sic(<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>),
  Send:          sic(<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>),
  Slash:         sic(<><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>),
  Star:          sic(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>),
  AlertTriangle: sic(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>),
  Phone:         sic(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>),
  MapPin:        sic(<><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></>),
  Car:           sic(<><path d="M5 17h14l-1.5-7.5A2 2 0 0 0 15.55 8h-7.1A2 2 0 0 0 6.5 9.5L5 17z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></>),
  Check:         sic(<polyline points="20 6 9 17 4 12"/>),
  X:             sic(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>),
  Filter:        sic(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>),
  Plus:          sic(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
  ChevronD:      sic(<polyline points="6 9 12 15 18 9"/>),
  ChevronR:      sic(<polyline points="9 18 15 12 9 6"/>),
  Clock:         sic(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>),
  Image:         sic(<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>),
  Lightning:     sic(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>),
  Logo:          sic(<><circle cx="12" cy="12" r="9"/><path d="M3 12 Q 7 16, 12 12 T 21 12"/></>),
};

// ─── Desktop window chrome ──────────────────────────────────
const DesktopWindow = ({ children, title, width = 1440, height = 900 }) => (
  <div style={{
    width, height, borderRadius: 14, overflow: 'hidden', position: 'relative',
    background: S.surface, color: S.ink, fontFamily: S.sans,
    boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column',
  }}>
    {/* Window titlebar */}
    <div style={{
      height: 38, flexShrink: 0,
      background: 'linear-gradient(180deg, #1a1c25, #14161d)',
      borderBottom: `1px solid ${S.edge}`,
      display: 'flex', alignItems: 'center', padding: '0 14px',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }}/>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }}/>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }}/>
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none',
        fontSize: 12, color: S.inkMuted, fontWeight: 500,
      }}>{title}</div>
    </div>
    {/* Inner content */}
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>{children}</div>
  </div>
);

// ─── Left rail (logo + tab icons + agent avatar) ────────────
const LeftRail = ({ active = 'conv' }) => {
  const items = [
    { id: 'conv',      Ic: SIcon.MessageSquare, label: 'Conversations', badge: 8 },
    { id: 'approvals', Ic: SIcon.CheckSquare,   label: 'Approvals',     badge: 3 },
    { id: 'tickets',   Ic: SIcon.Ticket,        label: 'Tickets',       badge: 12 },
  ];
  return (
    <div style={{
      width: 68, flexShrink: 0,
      background: S.surface, borderRight: `1px solid ${S.edge}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '14px 0',
    }}>
      {/* Logo — Wash mark (shared with main app) */}
      <div style={{ marginBottom: 18 }}>
        <WashLogo size={40}/>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {items.map(it => (
          <div key={it.id} style={{
            width: 44, height: 44, borderRadius: 12, position: 'relative',
            background: active === it.id ? S.agentSoft : 'transparent',
            color: active === it.id ? S.agent : S.inkMuted,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: active === it.id ? `1px solid rgba(63,181,143,0.3)` : '1px solid transparent',
          }}>
            <it.Ic width="20" height="20"/>
            {it.badge > 0 && (
              <div style={{
                position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18,
                padding: '0 4px', borderRadius: 999,
                background: active === it.id ? S.agent : S.danger,
                color: '#fff', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${S.surface}`,
              }}>{it.badge}</div>
            )}
            {active === it.id && (
              <div style={{
                position: 'absolute', left: -8, top: 12, bottom: 12,
                width: 3, borderRadius: 2, background: S.agent,
              }}/>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          color: S.inkMuted,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><SIcon.Settings width="18" height="18"/></div>
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `linear-gradient(135deg, #f59e0b, #c2410c)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 13,
            border: `2px solid ${S.surface}`,
          }}>EL</div>
          <div style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 11, height: 11, borderRadius: '50%',
            background: S.success, border: `2px solid ${S.surface}`,
          }}/>
        </div>
      </div>
    </div>
  );
};

// ─── Status pill ────────────────────────────────────────────
const Pill = ({ children, color = S.inkMuted, bg, dot = false, style }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 8px', borderRadius: 999,
    background: bg || `${color}1f`,
    color, fontSize: 11, fontWeight: 600, letterSpacing: 0.1,
    ...style,
  }}>
    {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }}/>}
    {children}
  </span>
);

// ─── Avatar ─────────────────────────────────────────────────
const Avatar = ({ initials, size = 36, hue = 200, ring }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: `linear-gradient(135deg, hsl(${hue} 50% 55%), hsl(${(hue + 40) % 360} 50% 35%))`,
    color: '#fff', fontWeight: 700, fontSize: size * 0.38,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: ring ? `2px solid ${ring}` : 'none',
  }}>{initials}</div>
);

Object.assign(window, { S, SIcon, DesktopWindow, LeftRail, Pill, Avatar });
