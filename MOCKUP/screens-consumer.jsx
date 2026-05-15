// Wash — consumer screens (Home, Order Tracking, History)

// ───────────────────────────────────────────────────────────
// Screen: Consumer Home / Booking form
// ───────────────────────────────────────────────────────────
function ConsumerHome() {
  return (
    <div style={{ position: 'relative', width: 390, height: 844, overflow: 'hidden',
      background: W.surface, fontFamily: 'Inter, system-ui' }}>
      <MeshBG />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        {/* spacer for status bar */}
        <div style={{ height: SAFE_TOP }} />

        {/* Header */}
        <div style={{ padding: '6px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <WashMark size={22} />
          <div style={{
            width: 38, height: 38, borderRadius: 14,
            background: `linear-gradient(135deg, ${W.g300}, ${W.g600})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 14,
            boxShadow: '0 2px 6px rgba(38,181,95,0.3)',
          }}>NA</div>
        </div>

        {/* Title */}
        <div style={{ padding: '4px 20px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: W.inkMuted, letterSpacing: 0.2 }}>
            Good afternoon, Noa
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: W.ink, letterSpacing: -0.7, marginTop: 2 }}>
            Where's your car parked?
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Location card */}
          <GlassCard padding={0} radius={22}>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <div style={{ width: 78, height: 78, position: 'relative', overflow: 'hidden',
                borderTopLeftRadius: 22, borderBottomLeftRadius: 22 }}>
                <MapBG style={{ width: '100%', height: '100%' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', color: W.g700 }}>
                  <Icon.MapPin width="22" height="22" fill={W.g500} stroke={W.g800}/>
                </div>
              </div>
              <div style={{ flex: 1, padding: '14px 14px 14px 14px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: W.g700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Pickup location
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: W.ink, marginTop: 2 }}>
                  Habarzel St 23, Ramat Hahayal
                </div>
                <div style={{ fontSize: 12, color: W.inkMuted, marginTop: 1 }}>
                  Tel Aviv · Building B parking
                </div>
              </div>
              <div style={{ padding: '14px 14px', alignSelf: 'center', color: W.inkSubtle }}>
                <Icon.ChevronR width="20" height="20"/>
              </div>
            </div>
          </GlassCard>

          {/* License plate */}
          <GlassCard padding={16} radius={22}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: W.g700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Vehicle
              </div>
              <div style={{ fontSize: 11, color: W.g700, fontWeight: 600 }}>Change plate</div>
            </div>
            {/* Confirmed state — car summary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <IsraeliPlate number="48-271-95" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: W.ink }}>
                  Toyota Corolla · 2021
                </div>
                <div style={{ fontSize: 12, color: W.inkMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>White</span><span style={{ color: W.inkSubtle }}>·</span><span>Private car</span>
                </div>
              </div>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', background: W.g500,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                boxShadow: '0 1px 3px rgba(38,181,95,0.4)',
              }}>
                <Icon.Check width="16" height="16" strokeWidth="3" />
              </div>
            </div>
          </GlassCard>

          {/* Photos */}
          <GlassCard padding={16} radius={22}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: W.g700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Photos · 2 required
              </div>
              <div style={{ fontSize: 11, color: W.g700, fontWeight: 600 }}>2/2</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Front', tone: '#7f8d99' },
                { label: 'Side',  tone: '#8a9aa6' },
              ].map((p, i) => (
                <div key={i} style={{
                  aspectRatio: '1.2', borderRadius: 14, position: 'relative',
                  background: `linear-gradient(135deg, ${p.tone}, #4f5a64)`,
                  overflow: 'hidden', border: `1px solid rgba(255,255,255,0.4)`,
                }}>
                  {/* fake car silhouette */}
                  <svg viewBox="0 0 100 70" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    <ellipse cx="50" cy="62" rx="42" ry="3" fill="rgba(0,0,0,0.25)"/>
                    <path d="M10 50 Q 12 32 26 30 L 38 22 Q 50 18 62 22 L 74 30 Q 88 32 90 50 L 88 56 L 12 56 Z" fill="rgba(255,255,255,0.9)"/>
                    <path d="M28 32 L 38 24 Q 50 20 62 24 L 72 32 Z" fill="rgba(160,200,230,0.55)"/>
                    <circle cx="26" cy="56" r="6" fill="#1a1a1a"/>
                    <circle cx="74" cy="56" r="6" fill="#1a1a1a"/>
                  </svg>
                  <div style={{
                    position: 'absolute', top: 8, left: 8,
                    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
                    color: '#fff', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 8,
                  }}>{p.label}</div>
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    width: 22, height: 22, borderRadius: '50%', background: W.g500, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}><Icon.Check width="14" height="14" strokeWidth="3"/></div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Site resources */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Water tap',     sub: 'Available',  Ic: Icon.Droplet, on: true },
              { label: 'Power outlet',  sub: 'Not on site', Ic: Icon.Zap,    on: false },
            ].map((t, i) => (
              <GlassCard key={i} padding={12} radius={18} style={{
                borderColor: t.on ? W.g300 : W.glassBorder,
                background: t.on ? `linear-gradient(135deg, rgba(125,217,162,0.22), rgba(255,255,255,0.65))` : W.glass,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 11,
                    background: t.on ? W.g500 : 'rgba(0,0,0,0.06)',
                    color: t.on ? '#fff' : W.inkMuted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <t.Ic width="18" height="18"/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: W.ink }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: t.on ? W.g800 : W.inkMuted }}>{t.sub}</div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Sticky price + CTA */}
        <div style={{ padding: '12px 16px 12px', paddingBottom: SAFE_BOT + 70 }}>
          <GlassCard padding={14} radius={22} style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(243,252,247,0.85))',
            borderColor: W.g300,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: W.g700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Total · VAT included
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: W.ink, letterSpacing: -0.6 }}>₪100</span>
                  <span style={{ fontSize: 11, color: W.inkMuted }}>₪84.75 + ₪15.25 VAT</span>
                </div>
              </div>
              <button style={{
                height: 52, padding: '0 22px', borderRadius: 16, border: 'none',
                background: `linear-gradient(180deg, ${W.g500}, ${W.g600})`,
                color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(38,181,95,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}>
                Book wash
                <Icon.ChevronR width="18" height="18" strokeWidth="2.5"/>
              </button>
            </div>
          </GlassCard>
        </div>

        <BottomNav active="home" />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Screen: Order Tracking
// ───────────────────────────────────────────────────────────
function OrderTracking() {
  const stages = [
    { id: 'req',  label: 'Requested', done: true },
    { id: 'assigned', label: 'Assigned', done: true },
    { id: 'enroute', label: 'En route', done: true, active: true },
    { id: 'wash', label: 'Washing', done: false },
    { id: 'done', label: 'Complete', done: false },
  ];
  return (
    <div style={{ position: 'relative', width: 390, height: 844, overflow: 'hidden',
      background: W.surface, fontFamily: 'Inter, system-ui' }}>
      {/* Map fills entire top */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <MapBG style={{ width: '100%', height: '60%' }} />
        {/* Route line */}
        <svg viewBox="0 0 390 506" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '60%' }}>
          <path d="M 70 360 Q 130 280 180 260 T 290 180" stroke={W.g700} strokeWidth="4"
            strokeLinecap="round" fill="none" strokeDasharray="0"/>
          <path d="M 70 360 Q 130 280 180 260 T 290 180" stroke="#fff" strokeWidth="1.5"
            strokeLinecap="round" fill="none" strokeDasharray="2 6"/>
          {/* car (start) */}
          <g transform="translate(290 180)">
            <circle r="22" fill="rgba(125,217,162,0.25)"/>
            <circle r="14" fill="#fff" stroke={W.g700} strokeWidth="2"/>
            <g transform="translate(-8 -8)" fill={W.g800}>
              <path d="M2 11 h12 l-0.6 -4 a 2 2 0 0 0 -2 -1.5 h -6.8 a 2 2 0 0 0 -2 1.5 z"/>
              <circle cx="5" cy="12" r="1.4"/>
              <circle cx="11" cy="12" r="1.4"/>
            </g>
          </g>
          {/* washer pin (moving) */}
          <g transform="translate(70 360)">
            <circle r="26" fill="rgba(38,181,95,0.18)">
              <animate attributeName="r" values="22;30;22" dur="2.4s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2.4s" repeatCount="indefinite"/>
            </circle>
            <circle r="18" fill={W.g700} stroke="#fff" strokeWidth="3"/>
            <text y="5" textAnchor="middle" fontSize="14" fill="#fff" fontWeight="800" fontFamily="Inter">Y</text>
          </g>
        </svg>
        {/* fade to mesh below */}
        <div style={{
          position: 'absolute', top: '50%', left: 0, right: 0, bottom: 0,
          background: `linear-gradient(180deg, transparent 0%, ${W.surface} 60%)`,
        }}/>
      </div>

      {/* Status bar spacer + top chrome */}
      <div style={{ position: 'absolute', top: SAFE_TOP, left: 0, right: 0, padding: '6px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 14,
          background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(14px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          color: W.ink,
        }}>
          <Icon.ArrowL width="20" height="20"/>
        </div>
        <div style={{
          padding: '8px 14px', borderRadius: 999,
          background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(14px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          fontSize: 12, fontWeight: 700, color: W.g800,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: W.g600, boxShadow: `0 0 0 3px ${W.g100}` }}/>
          LIVE
        </div>
      </div>

      {/* Big ETA pill */}
      <div style={{ position: 'absolute', top: SAFE_TOP + 56, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          padding: '10px 20px', borderRadius: 999,
          background: '#fff',
          boxShadow: '0 6px 20px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: W.g100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: W.g800 }}>
            <Icon.Clock width="18" height="18"/>
          </div>
          <div>
            <div style={{ fontSize: 11, color: W.inkMuted, fontWeight: 500 }}>Arriving in</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: W.ink, letterSpacing: -0.3 }}>4 min · 1.2 km</div>
          </div>
        </div>
      </div>

      {/* Bottom sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
        boxShadow: '0 -8px 30px rgba(0,0,0,0.12)',
        padding: '8px 16px 0',
        paddingBottom: SAFE_BOT + 8,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: W.edge }}/>
        </div>

        {/* status */}
        <div style={{ padding: '0 4px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: W.g700, letterSpacing: 0.3, textTransform: 'uppercase' }}>
            Your washer is on the way
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: W.ink, marginTop: 2, letterSpacing: -0.4 }}>
            Yossi is heading to your car
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
          {stages.map((s, i) => (
            <React.Fragment key={s.id}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: s.done ? W.g600 : W.edge,
                  border: s.active ? `3px solid ${W.g200}` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.done && !s.active && <Icon.Check width="10" height="10" strokeWidth="4" stroke="#fff"/>}
                </div>
                <div style={{ fontSize: 9.5, fontWeight: s.active ? 700 : 500, color: s.active ? W.ink : W.inkMuted }}>
                  {s.label}
                </div>
              </div>
              {i < stages.length - 1 && (
                <div style={{ flex: 0.3, height: 2, marginBottom: 16, background: s.done ? W.g500 : W.edge, borderRadius: 2 }}/>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Washer info */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: 12, background: W.g50, borderRadius: 18,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: `linear-gradient(135deg, ${W.g400}, ${W.g700})`,
            color: '#fff', fontWeight: 700, fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}>Y</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: W.ink }}>Yossi M.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: W.inkMuted }}>
              <Icon.Star width="12" height="12" fill={W.warn} stroke="none"/>
              <span style={{ color: W.ink, fontWeight: 600 }}>4.92</span>
              <span>· 1,284 washes</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[Icon.Message, Icon.Phone].map((Ic, i) => (
              <button key={i} style={{
                width: 40, height: 40, borderRadius: 12, border: 'none',
                background: '#fff', color: W.g800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}><Ic width="18" height="18"/></button>
            ))}
          </div>
        </div>

        {/* Bottom row: cancel + total */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 4, paddingBottom: 8 }}>
          <button style={{
            background: 'none', border: 'none', fontSize: 13, fontWeight: 600,
            color: W.danger, fontFamily: 'inherit', padding: 4,
          }}>Cancel order</button>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: W.inkMuted, fontWeight: 500 }}>Total</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: W.ink, letterSpacing: -0.3 }}>₪100</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Screen: History
// ───────────────────────────────────────────────────────────
function ConsumerHistory() {
  const groups = [
    {
      label: 'This week',
      items: [
        { date: 'Today', time: '14:20', plate: '48-271-95', car: 'Corolla · White', price: 100, status: 'In progress', live: true },
        { date: 'Mon',    time: '10:05', plate: '48-271-95', car: 'Corolla · White', price: 100, status: 'Completed', live: false },
      ],
    },
    {
      label: 'Last month',
      items: [
        { date: 'Apr 28', time: '08:45', plate: '94-103-22', car: 'X-Trail · Black',  price: 120, status: 'Completed', live: false },
        { date: 'Apr 14', time: '17:30', plate: '48-271-95', car: 'Corolla · White', price: 100, status: 'Completed', live: false },
        { date: 'Apr 02', time: '12:15', plate: '94-103-22', car: 'X-Trail · Black',  price: 120, status: 'Completed', live: false },
      ],
    },
  ];
  return (
    <div style={{ position: 'relative', width: 390, height: 844, overflow: 'hidden',
      background: W.surface, fontFamily: 'Inter, system-ui' }}>
      <MeshBG />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: SAFE_TOP }}/>
        {/* Header */}
        <div style={{ padding: '8px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: W.ink, letterSpacing: -0.7 }}>History</div>
          <button style={{
            width: 40, height: 40, borderRadius: 14, border: 'none',
            background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(14px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: W.ink, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}><Icon.Filter width="18" height="18" strokeWidth="2"/></button>
        </div>

        {/* Summary card */}
        <div style={{ padding: '6px 16px 14px' }}>
          <GlassCard padding={16} radius={22} style={{
            background: `linear-gradient(135deg, rgba(28,135,71,0.92), rgba(38,181,95,0.92))`,
            border: 'none', color: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  This year
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8 }}>24</span>
                  <span style={{ fontSize: 13, opacity: 0.85 }}>washes</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                  ₪2,480 spent · Saved 18 hrs
                </div>
              </div>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: 'rgba(255,255,255,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(255,255,255,0.3)',
              }}><Icon.Sparkles width="26" height="26" stroke="#fff" fill="rgba(255,255,255,0.3)"/></div>
            </div>
          </GlassCard>
        </div>

        {/* List */}
        <div style={{ flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          {groups.map(g => (
            <div key={g.label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: W.inkMuted,
                letterSpacing: 0.5, textTransform: 'uppercase', padding: '4px 4px 8px' }}>
                {g.label}
              </div>
              <GlassCard padding={0} radius={20}>
                {g.items.map((it, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 14px',
                    borderBottom: i < g.items.length - 1 ? `1px solid ${W.edge}` : 'none',
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 13,
                      background: it.live ? W.g100 : 'rgba(0,0,0,0.04)',
                      color: it.live ? W.g800 : W.inkMuted,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative',
                    }}>
                      <Icon.Car width="20" height="20"/>
                      {it.live && (
                        <span style={{
                          position: 'absolute', top: -3, right: -3,
                          width: 12, height: 12, borderRadius: '50%', background: W.g600,
                          border: '2px solid #fff',
                        }}/>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: W.ink }}>{it.date}</span>
                        <span style={{ fontSize: 12, color: W.inkMuted }}>{it.time}</span>
                      </div>
                      <div style={{ fontSize: 12, color: W.inkMuted, marginTop: 1,
                        display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                          color: W.ink, fontWeight: 600 }}>{it.plate}</span>
                        <span>·</span>
                        <span>{it.car}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: W.ink }}>₪{it.price}</div>
                      <div style={{
                        fontSize: 10, fontWeight: 600,
                        color: it.live ? W.g700 : W.inkMuted,
                        marginTop: 2,
                      }}>{it.status}</div>
                    </div>
                  </div>
                ))}
              </GlassCard>
            </div>
          ))}
        </div>

        <div style={{ height: SAFE_BOT + 70 }}/>
        <BottomNav active="history" />
      </div>
    </div>
  );
}

Object.assign(window, { ConsumerHome, OrderTracking, ConsumerHistory });
