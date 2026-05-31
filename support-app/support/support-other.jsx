// MULU Support — Approvals, Tickets, Login

// ─────────────────────────────────────────────────────────────
// APPROVALS — washer completed jobs awaiting review
// ─────────────────────────────────────────────────────────────
function SupportApprovals() {
  const queue = [
    { id: 'JX-4011', washer: 'Yossi M.',  consumer: 'Noa A.',     car: 'Toyota Corolla', plate: '48-271-95', price: 100, time: '3 min ago', selected: true, hue: 145 },
    { id: 'JX-4009', washer: 'Itai S.',   consumer: 'Daniel C.',  car: 'Nissan X-Trail', plate: '94-103-22', price: 120, time: '12 min ago', hue: 200 },
    { id: 'JX-4005', washer: 'Lior Stein',consumer: 'Maya L.',    car: 'Mazda 3',        plate: '37-820-04', price: 100, time: '38 min ago', hue: 170 },
    { id: 'JX-4001', washer: 'Yossi M.',  consumer: 'Tomer A.',   car: 'Hyundai Ioniq',  plate: '11-559-86', price: 100, time: '1h ago', hue: 145 },
    { id: 'JX-3998', washer: 'Eitan G.',  consumer: 'Roni B.',    car: 'Kia Sportage',   plate: '20-447-31', price: 120, time: '1h ago', hue: 60 },
  ];

  return (
    <DesktopWindow title="MULU · Support">
      <LeftRail active="approvals"/>

      {/* Approval queue list */}
      <div style={{ width: 360, flexShrink: 0, borderRight: `1px solid ${S.edge}`,
        background: S.surfaceEl, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 18px 14px', borderBottom: `1px solid ${S.edge}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: S.ink, letterSpacing: -0.3 }}>
              Approvals
            </span>
            <Pill color={S.warning} dot>3 waiting</Pill>
          </div>
          <div style={{ fontSize: 11.5, color: S.inkMuted, marginTop: 4 }}>
            Review photos + GPS, then approve or reject
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {['All', 'High value', 'Disputed'].map((t, i) => (
              <div key={t} style={{
                padding: '5px 10px', borderRadius: 8,
                background: i === 0 ? S.agentSoft : 'transparent',
                color: i === 0 ? S.agent : S.inkMuted,
                border: i === 0 ? `1px solid rgba(63,181,143,0.3)` : `1px solid ${S.edge}`,
                fontSize: 11.5, fontWeight: 600,
              }}>{t}</div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
          {queue.map(q => (
            <div key={q.id} style={{
              padding: 12, borderRadius: 10, marginBottom: 4,
              background: q.selected ? S.agentSoft : 'transparent',
              border: q.selected ? `1px solid rgba(63,181,143,0.3)` : '1px solid transparent',
              display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
            }}>
              <Avatar initials={q.washer.split(' ').map(s => s[0]).join('').slice(0, 2)} hue={q.hue} size={36}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: S.mono, fontSize: 12.5, fontWeight: 700, color: S.ink }}>{q.id}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: S.accent }}>₪{q.price}</span>
                </div>
                <div style={{ fontSize: 12.5, color: S.ink, fontWeight: 600, marginTop: 2 }}>{q.car}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
                  fontSize: 11, color: S.inkMuted }}>
                  <span style={{ fontFamily: S.mono, color: S.inkMuted, fontWeight: 600,
                    padding: '1px 5px', borderRadius: 4, background: S.surfaceHi,
                    border: `1px solid ${S.edge}` }}>{q.plate}</span>
                  <span>· {q.time}</span>
                </div>
                <div style={{ fontSize: 11, color: S.inkSubtle, marginTop: 4 }}>
                  {q.washer} → {q.consumer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approval review pane */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: S.surface }}>
        <ApprovalReview/>
      </div>
    </DesktopWindow>
  );
}

function ApprovalReview() {
  return (
    <div>
      {/* Header */}
      <div style={{ padding: '20px 28px 18px', borderBottom: `1px solid ${S.edge}`,
        background: S.surfaceEl, position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1 style={{ margin: 0, fontFamily: S.mono, fontSize: 22, fontWeight: 800,
                color: S.ink, letterSpacing: -0.3 }}>JX-4011</h1>
              <Pill color={S.warning} dot>Pending approval</Pill>
              <span style={{ fontSize: 11.5, color: S.inkSubtle }}>completed 3 min ago</span>
            </div>
            <div style={{ fontSize: 13, color: S.inkMuted, marginTop: 4,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <SIcon.Car width="14" height="14"/>
              Toyota Corolla · <span style={{ fontFamily: S.mono, color: S.ink }}>48-271-95</span> · White
              <span style={{ color: S.inkSubtle }}>·</span>
              ₪100 (washer ₪60 · platform ₪40)
            </div>
          </div>
          <div style={{ flex: 1 }}/>
          <button style={{
            padding: '10px 14px', borderRadius: 10, border: `1px solid ${S.danger}55`,
            background: 'transparent', color: S.danger,
            fontSize: 12.5, fontWeight: 700, fontFamily: S.sans,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <SIcon.X width="14" height="14"/>
            Reject
          </button>
          <button style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: S.accent, color: S.surface,
            fontSize: 13, fontWeight: 800, fontFamily: S.sans,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            boxShadow: '0 4px 14px rgba(125,217,162,0.3)',
          }}>
            <SIcon.Check width="15" height="15" strokeWidth="3"/>
            Approve & release payout
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Photos section */}
          <PhotoBlock title="Arrival photos" subtitle="Uploaded 24 min ago · GPS matched"
            labels={['Front', 'Rear', 'Driver side', 'Passenger side']}
            badgeColor={S.inkMuted}/>
          <PhotoBlock title="Completion photos" subtitle="Uploaded 3 min ago · clean evidence"
            labels={['Front', 'Rear', 'Driver side', 'Passenger side']}
            badgeColor={S.accent} clean/>
        </div>

        {/* Right column: map + details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Map */}
          <div style={{
            background: S.surfaceEl, border: `1px solid ${S.edge}`,
            borderRadius: 14, overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: `1px solid ${S.edge}` }}>
              <span style={{ fontSize: 11.5, color: S.inkMuted, fontWeight: 700,
                letterSpacing: 0.4, textTransform: 'uppercase' }}>Washer location</span>
              <Pill color={S.accent} dot>Match · 8m offset</Pill>
            </div>
            <div style={{ position: 'relative', height: 220 }}>
              <MapBG dark style={{ width: '100%', height: '100%' }}/>
              <svg viewBox="0 0 360 220" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                {/* expected location */}
                <circle cx="180" cy="115" r="40" fill="rgba(125,217,162,0.15)" stroke={S.accent} strokeWidth="1.5" strokeDasharray="4 4"/>
                <circle cx="180" cy="115" r="9" fill="#fff" stroke={S.accent} strokeWidth="2.5"/>
                {/* actual */}
                <circle cx="186" cy="118" r="11" fill={S.accent} stroke="#fff" strokeWidth="3">
                  <animate attributeName="r" values="11;15;11" dur="2s" repeatCount="indefinite"/>
                </circle>
              </svg>
            </div>
          </div>

          {/* Timing */}
          <div style={{ background: S.surfaceEl, border: `1px solid ${S.edge}`,
            borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11.5, color: S.inkMuted, fontWeight: 700,
              letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 }}>Timeline</div>
            {[
              { t: '13:48', l: 'Order placed', c: S.inkMuted },
              { t: '13:52', l: 'Yossi accepted', c: S.inkMuted },
              { t: '14:08', l: 'Arrived on site', c: S.inkMuted },
              { t: '14:09', l: 'Arrival photos · 4/4', c: S.inkMuted },
              { t: '14:33', l: 'Wash complete', c: S.accent },
              { t: '14:36', l: 'Completion photos · 4/4', c: S.accent },
            ].map((s, i, a) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 0' }}>
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.inkSubtle, width: 38 }}>{s.t}</span>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.c }}/>
                <span style={{ fontSize: 12.5, color: S.ink }}>{s.l}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${S.edge}`,
              display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: S.inkMuted }}>Total wash duration</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: S.ink }}>24 min</span>
            </div>
          </div>

          {/* Notes */}
          <div style={{ background: S.surfaceEl, border: `1px solid ${S.edge}`,
            borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11.5, color: S.inkMuted, fontWeight: 700,
              letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>Auto-checks</div>
            {[
              { l: 'Plate visible in 4/4 arrival photos', ok: true },
              { l: 'GPS within 50m of order address',     ok: true },
              { l: 'Clean delta detected',                ok: true },
              { l: 'No customer complaint',               ok: true },
            ].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%',
                  background: c.ok ? S.accent : S.danger,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SIcon.Check width="10" height="10" strokeWidth="3" stroke={S.surface}/>
                </div>
                <span style={{ fontSize: 12.5, color: S.ink }}>{c.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoBlock({ title, subtitle, labels, badgeColor, clean }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: S.ink }}>{title}</h3>
        <span style={{ fontSize: 11.5, color: S.inkSubtle }}>{subtitle}</span>
        <div style={{ flex: 1 }}/>
        <Pill color={badgeColor} dot={!!clean}>{clean ? 'Clean' : 'Reference'}</Pill>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {labels.map((l, i) => <CarPhoto key={l} label={l} angle={i} clean={clean}/>)}
      </div>
    </div>
  );
}

function CarPhoto({ label, angle, clean }) {
  // Slightly different background tones so the 4 photos read as different angles
  const tone = clean
    ? `linear-gradient(135deg, #4f6671, #2a3540)`
    : `linear-gradient(135deg, #5c5043, #2e2820)`;
  const carColor = clean ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.78)';
  return (
    <div style={{
      aspectRatio: '1.2', borderRadius: 10, position: 'relative', overflow: 'hidden',
      background: tone, border: `1px solid ${S.edge}`,
    }}>
      <svg viewBox="0 0 100 70" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <ellipse cx="50" cy="62" rx="42" ry="3" fill="rgba(0,0,0,0.35)"/>
        <g transform={`rotate(${angle * 4 - 6} 50 40)`}>
          <path d="M10 50 Q 12 32 26 30 L 38 22 Q 50 18 62 22 L 74 30 Q 88 32 90 50 L 88 56 L 12 56 Z" fill={carColor}/>
          <path d="M28 32 L 38 24 Q 50 20 62 24 L 72 32 Z" fill="rgba(120,160,200,0.55)"/>
          <circle cx="26" cy="56" r="6" fill="#0a0a0a"/>
          <circle cx="74" cy="56" r="6" fill="#0a0a0a"/>
        </g>
        {!clean && (
          // dirt specks
          <g fill="rgba(0,0,0,0.4)">
            <circle cx="30" cy="40" r="1.2"/><circle cx="48" cy="42" r="0.9"/>
            <circle cx="62" cy="38" r="1.4"/><circle cx="72" cy="45" r="1"/>
            <circle cx="22" cy="48" r="0.8"/><circle cx="80" cy="48" r="1.2"/>
          </g>
        )}
      </svg>
      <div style={{
        position: 'absolute', top: 7, left: 7,
        padding: '3px 7px', borderRadius: 5,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        color: '#fff', fontSize: 9.5, fontWeight: 600, letterSpacing: 0.2,
      }}>{label}</div>
      <div style={{
        position: 'absolute', bottom: 6, right: 7,
        fontFamily: S.mono, fontSize: 9, color: 'rgba(255,255,255,0.65)',
      }}>{clean ? '14:36' : '14:09'}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TICKETS — table view
// ─────────────────────────────────────────────────────────────
function SupportTickets() {
  const tickets = [
    { id: 'T-2041', title: '1★ rating — washer left soap on hood',  status: 'open',         severity: 'high',   user: 'Daniel C.', hue: 20,  order: 'JX-3987', age: '12 min', assignee: null,    auto: true },
    { id: 'T-2040', title: 'Could not find vehicle — wrong address', status: 'open',         severity: 'medium', user: 'Itai S.',   hue: 200, order: 'JX-3982', age: '38 min', assignee: 'Eli',   auto: false },
    { id: 'T-2039', title: 'Photo upload fails on iOS 17',            status: 'in_progress', severity: 'low',    user: 'Lior S.',   hue: 170, order: '—',       age: '1h',     assignee: 'Maya',  auto: false },
    { id: 'T-2038', title: 'Double charge — JX-3974',                  status: 'in_progress', severity: 'high',   user: 'Roni B.',   hue: 80,  order: 'JX-3974', age: '2h',     assignee: 'Eli',   auto: false },
    { id: 'T-2037', title: '1★ rating — no show',                      status: 'resolved',    severity: 'high',   user: 'Tomer A.',  hue: 240, order: 'JX-3960', age: '4h',     assignee: 'Maya',  auto: true },
    { id: 'T-2036', title: 'Water tap location wrong on map',          status: 'resolved',    severity: 'low',    user: 'Maya L.',   hue: 320, order: 'JX-3941', age: '1d',     assignee: 'Eli',   auto: false },
    { id: 'T-2035', title: 'Refund request — paid but cancelled',      status: 'resolved',    severity: 'medium', user: 'Yael K.',   hue: 0,   order: 'JX-3930', age: '1d',     assignee: 'Maya',  auto: false },
  ];

  const sevColor = { high: S.danger, medium: S.warning, low: S.inkMuted };
  const statusColor = { open: S.warning, in_progress: S.agent, resolved: S.success };
  const statusLabel = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };

  return (
    <DesktopWindow title="MULU · Support">
      <LeftRail active="tickets"/>
      <div style={{ flex: 1, minWidth: 0, background: S.surface,
        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '22px 28px 14px', borderBottom: `1px solid ${S.edge}`,
          background: S.surfaceEl }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11.5, color: S.inkMuted, fontWeight: 700,
                letterSpacing: 0.5, textTransform: 'uppercase' }}>Support</div>
              <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 800,
                color: S.ink, letterSpacing: -0.5 }}>Tickets</h1>
            </div>
            <div style={{ flex: 1 }}/>
            <button style={{
              padding: '9px 14px', borderRadius: 10, border: 'none',
              background: S.agent, color: '#fff',
              fontSize: 12.5, fontWeight: 700, fontFamily: S.sans,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 4px 12px rgba(63,181,143,0.3)',
            }}>
              <SIcon.Plus width="14" height="14" strokeWidth="3"/>
              New ticket
            </button>
          </div>

          {/* Stat row */}
          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            {[
              { l: 'Open',         v: 5,   c: S.warning,  trend: '+2 today' },
              { l: 'In progress',  v: 7,   c: S.agent,    trend: '4 mine' },
              { l: 'Resolved · 7d',v: 142, c: S.success,  trend: '94% within SLA' },
              { l: 'Avg first reply', v: '6m 12s', c: S.ink, trend: '-18% vs last week', wide: true },
            ].map(s => (
              <div key={s.l} style={{
                flex: s.wide ? 1.4 : 1, padding: '12px 14px', borderRadius: 12,
                background: S.surface, border: `1px solid ${S.edge}`,
              }}>
                <div style={{ fontSize: 10.5, color: S.inkMuted, fontWeight: 700,
                  letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.l}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: s.c, letterSpacing: -0.4 }}>{s.v}</span>
                  <span style={{ fontSize: 11, color: S.inkSubtle }}>{s.trend}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Filter row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
            {[
              { l: 'All',         n: 14, on: true },
              { l: 'Open',        n: 5  },
              { l: 'In progress', n: 7  },
              { l: 'Resolved',    n: 2  },
              { l: 'Auto-created',n: 4  },
              { l: 'Mine',        n: 6  },
            ].map(t => (
              <div key={t.l} style={{
                padding: '6px 11px', borderRadius: 8,
                background: t.on ? S.agentSoft : 'transparent',
                color: t.on ? S.agent : S.inkMuted,
                border: t.on ? `1px solid rgba(63,181,143,0.3)` : `1px solid ${S.edge}`,
                fontSize: 12, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {t.l}
                <span style={{ fontSize: 10.5, opacity: 0.7 }}>{t.n}</span>
              </div>
            ))}
            <div style={{ flex: 1 }}/>
            <div style={{
              padding: '6px 11px', borderRadius: 8, border: `1px solid ${S.edge}`,
              color: S.inkMuted, fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <SIcon.Filter width="12" height="12"/>
              Sort: Severity ↓
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 28px 28px' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
            <thead>
              <tr style={{ fontSize: 10.5, fontWeight: 700, color: S.inkSubtle,
                letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {['', 'Ticket', 'Status', 'Severity', 'Reporter', 'Order', 'Age', 'Assignee'].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.id} style={{
                  background: S.surfaceEl,
                  boxShadow: `inset 0 0 0 1px ${S.edge}`,
                }}>
                  <td style={{ padding: '12px 10px', borderRadius: '10px 0 0 10px', width: 12 }}>
                    <div style={{ width: 4, height: 30, borderRadius: 2,
                      background: sevColor[t.severity] }}/>
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: S.mono, fontSize: 11.5, color: S.inkMuted,
                        fontWeight: 700 }}>{t.id}</span>
                      {t.auto && <Pill color={S.agent} bg={S.agentSoft}>auto · 1★</Pill>}
                    </div>
                    <div style={{ fontSize: 13.5, color: S.ink, fontWeight: 600, marginTop: 2 }}>
                      {t.title}
                    </div>
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <Pill color={statusColor[t.status]} dot>{statusLabel[t.status]}</Pill>
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: sevColor[t.severity],
                      textTransform: 'capitalize' }}>{t.severity}</span>
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar initials={t.user.split(' ').map(s => s[0]).join('')} size={26} hue={t.hue}/>
                      <span style={{ fontSize: 12.5, color: S.ink }}>{t.user}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 10px', fontFamily: S.mono, fontSize: 12,
                    color: t.order === '—' ? S.inkSubtle : S.inkMuted }}>{t.order}</td>
                  <td style={{ padding: '12px 10px', fontSize: 12, color: S.inkMuted }}>{t.age}</td>
                  <td style={{ padding: '12px 10px', borderRadius: '0 10px 10px 0' }}>
                    {t.assignee ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Avatar initials={t.assignee[0]} size={22} hue={t.assignee === 'Eli' ? 30 : 200}/>
                        <span style={{ fontSize: 12, color: S.ink }}>{t.assignee}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11.5, color: S.inkSubtle,
                        padding: '4px 8px', borderRadius: 6, border: `1px dashed ${S.edge}` }}>
                        Unassigned
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DesktopWindow>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────
function SupportLogin() {
  return (
    <DesktopWindow title="MULU · Agent sign-in">
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Atmospheric violet mesh */}
        <div style={{ position: 'absolute', inset: 0, background: [
          'radial-gradient(at 14% 18%, rgba(63,181,143,0.25), transparent 40%)',
          'radial-gradient(at 88% 88%, rgba(125,217,162,0.12), transparent 45%)',
          'radial-gradient(at 88% 14%, rgba(63,181,143,0.10), transparent 50%)',
          S.surface,
        ].join(',') }}/>
        {/* Faint grid */}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.25 }}>
          <defs>
            <pattern id="sgrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0V32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sgrid)"/>
        </svg>

        {/* Left side: brand */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '52%',
          padding: '64px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WashLogo size={40}/>
            <span style={{ fontSize: 16, fontWeight: 800, color: S.ink, letterSpacing: -0.3 }}>
              MULU<span style={{ color: S.agent }}>/agent</span>
            </span>
          </div>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: S.agent,
              letterSpacing: 1, textTransform: 'uppercase' }}>Internal · Agent only</div>
            <h1 style={{ margin: '14px 0 12px', fontSize: 44, fontWeight: 800,
              color: S.ink, letterSpacing: -1.4, lineHeight: 1.05 }}>
              Keep the queue<br/>moving.
            </h1>
            <p style={{ margin: 0, fontSize: 15, color: S.inkMuted, maxWidth: 380, lineHeight: 1.5 }}>
              Triage conversations, approve completed jobs, and resolve
              tickets — all in one live, dark workspace.
            </p>

            {/* Mini live stats */}
            <div style={{ display: 'flex', gap: 14, marginTop: 28 }}>
              {[
                { l: 'Avg first reply', v: '6m', c: S.accent },
                { l: 'CSAT this week',  v: '4.7', c: S.warning },
                { l: 'Agents online',   v: '4',   c: S.agent },
              ].map(s => (
                <div key={s.l} style={{
                  padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(20,22,30,0.6)', backdropFilter: 'blur(20px)',
                  border: `1px solid ${S.edge}`, minWidth: 110,
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.c, letterSpacing: -0.4 }}>{s.v}</div>
                  <div style={{ fontSize: 10.5, color: S.inkMuted, fontWeight: 600,
                    letterSpacing: 0.4, textTransform: 'uppercase' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: S.inkSubtle }}>
            © 2026 MULU · v3.2 · Build a8c4f
          </div>
        </div>

        {/* Right side: login card */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '48%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{
            width: 380, padding: 30,
            background: 'rgba(20,22,30,0.7)', backdropFilter: 'blur(30px) saturate(160%)',
            border: `1px solid ${S.edge}`, borderRadius: 18,
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <SIcon.CheckSquare width="16" height="16" stroke={S.agent}/>
              <span style={{ fontSize: 11, color: S.agent, fontWeight: 700,
                letterSpacing: 0.5, textTransform: 'uppercase' }}>Agent portal</span>
            </div>
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800,
              color: S.ink, letterSpacing: -0.5 }}>Sign in to continue</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: S.inkMuted }}>
              Accounts are provisioned by an admin.
            </p>

            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Work email" value="eli.cohen@wash.co.il" focused/>
              <Field label="Password"   value="••••••••••••" type="password"/>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginTop: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
                fontSize: 12, color: S.inkMuted }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 5,
                  background: S.agent,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <SIcon.Check width="11" height="11" strokeWidth="3" stroke="#fff"/>
                </span>
                Remember device
              </label>
              <span style={{ fontSize: 12, color: S.agent, fontWeight: 600 }}>Forgot?</span>
            </div>

            <button style={{
              width: '100%', marginTop: 18, height: 46, borderRadius: 12,
              border: 'none', background: `linear-gradient(180deg, ${S.agent}, ${S.agentDeep})`,
              color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: S.sans,
              boxShadow: `0 8px 22px rgba(63,181,143,0.4), inset 0 1px 0 rgba(255,255,255,0.25)`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              Continue to dashboard
              <SIcon.ChevronR width="16" height="16" strokeWidth="3"/>
            </button>

            <div style={{ marginTop: 16, padding: '10px 12px',
              borderRadius: 10, background: 'rgba(245,158,11,0.08)',
              border: `1px solid rgba(245,158,11,0.2)`,
              display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <SIcon.AlertTriangle width="14" height="14" stroke={S.warning}
                style={{ flexShrink: 0, marginTop: 1 }}/>
              <span style={{ fontSize: 11.5, color: S.inkMuted, lineHeight: 1.5 }}>
                Non-agent accounts will be signed out automatically. This portal is for the support team only.
              </span>
            </div>
          </div>
        </div>
      </div>
    </DesktopWindow>
  );
}

function Field({ label, value, type, focused }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: S.inkMuted,
        letterSpacing: 0.3, marginBottom: 6 }}>{label}</div>
      <div style={{
        height: 44, padding: '0 14px', borderRadius: 11,
        background: S.surface,
        border: `1.5px solid ${focused ? S.agent : S.edge}`,
        boxShadow: focused ? `0 0 0 4px ${S.agentSoft}` : 'none',
        display: 'flex', alignItems: 'center',
        fontSize: 13.5, color: S.ink,
        fontFamily: type === 'password' ? 'inherit' : S.sans,
      }}>
        {value}
        {focused && (
          <span style={{
            display: 'inline-block', width: 1.5, height: 16,
            background: S.agent, marginLeft: 2,
            animation: 'sblink 1s steps(2) infinite',
          }}/>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { SupportApprovals, SupportTickets, SupportLogin });
