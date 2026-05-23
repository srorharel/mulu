// Wash Support — Conversations dashboard (primary screen)
// 3-column: Queue | Chat | Context panel (OrderPanel)

function SupportConversations() {
  // Mock data
  const queueGroups = [
    {
      label: 'Mine',     count: 2, color: S.agent,
      items: [
        { id: 'c1', name: 'Noa Avraham',    role: 'consumer', avatar: 'NA', hue: 290,
          preview: 'Yes please, I can wait another 15 min', time: 'now',  unread: 0, selected: true, mine: true, typing: false },
        { id: 'c2', name: 'Yossi Mizrahi',  role: 'washer',   avatar: 'YM', hue: 145,
          preview: "Can't find the address — there's no…",  time: '2m',   unread: 2, mine: true },
      ],
    },
    {
      label: 'Unassigned', count: 4, color: S.warning,
      items: [
        { id: 'c3', name: 'Daniel Cohen',   role: 'consumer', avatar: 'DC', hue: 20,
          preview: 'I was charged twice — order JX-3987', time: '5m',  unread: 4, urgent: true },
        { id: 'c4', name: 'Maya Levi',      role: 'consumer', avatar: 'ML', hue: 320,
          preview: "Hi, my washer hasn't arrived yet…",   time: '11m', unread: 1 },
        { id: 'c5', name: 'Itai Shapira',   role: 'washer',   avatar: 'IS', hue: 200,
          preview: 'Site closed gates after 8pm 🚧',       time: '23m', unread: 1 },
        { id: 'c6', name: 'Roni Bar',       role: 'consumer', avatar: 'RB', hue: 80,
          preview: 'Could you change the pickup address?', time: '34m', unread: 1 },
      ],
    },
    {
      label: 'All',      count: 14, color: S.inkSubtle,
      items: [
        { id: 'c7', name: 'Tomer Azulay',  role: 'consumer',  avatar: 'TA', hue: 240,
          preview: 'Thanks, all sorted ✓',  time: '1h',  unread: 0, assigned: 'Maya' },
        { id: 'c8', name: 'Lior Stein',    role: 'washer',    avatar: 'LS', hue: 170,
          preview: 'Photo upload keeps failing',  time: '1h', unread: 0, assigned: 'Eli' },
      ],
    },
  ];

  return (
    <DesktopWindow title="Wash · Support">
      <LeftRail active="conv" />

      {/* Queue column */}
      <div style={{
        width: 320, flexShrink: 0, borderRight: `1px solid ${S.edge}`,
        background: S.surfaceEl, display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 18px 12px', borderBottom: `1px solid ${S.edge}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3, color: S.ink }}>
              Conversations
            </div>
            <Pill color={S.agent} dot>Live</Pill>
          </div>
          {/* Search */}
          <div style={{
            marginTop: 12,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 10,
            background: S.surface, border: `1px solid ${S.edge}`,
            color: S.inkSubtle, fontSize: 12,
          }}>
            <SIcon.Search width="14" height="14"/>
            <span style={{ flex: 1 }}>Search name or order…</span>
            <kbd style={{
              fontFamily: S.mono, fontSize: 10, padding: '1px 5px', borderRadius: 4,
              background: S.surfaceHi, color: S.inkMuted, border: `1px solid ${S.edge}`,
            }}>⌘K</kbd>
          </div>
        </div>

        {/* Groups */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {queueGroups.map(g => (
            <div key={g.label}>
              <div style={{
                padding: '12px 18px 6px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SIcon.ChevronD width="11" height="11" stroke={S.inkSubtle}/>
                  <span style={{ fontSize: 11, fontWeight: 700, color: S.inkMuted,
                    textTransform: 'uppercase', letterSpacing: 0.6 }}>{g.label}</span>
                </div>
                <span style={{ fontSize: 11, color: g.color, fontWeight: 700 }}>{g.count}</span>
              </div>
              {g.items.map(it => (
                <QueueItem key={it.id} it={it}/>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Chat pane */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        background: S.surface }}>
        <ChatHeader/>
        <ChatBody/>
        <ChatComposer/>
      </div>

      {/* Context panel */}
      <OrderContextPanel/>
    </DesktopWindow>
  );
}

function QueueItem({ it }) {
  const roleColor = it.role === 'consumer' ? S.accent : '#A78BFA';
  return (
    <div style={{
      margin: '0 8px 2px', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
      background: it.selected ? S.agentSoft : 'transparent',
      border: it.selected ? `1px solid rgba(63,181,143,0.3)` : '1px solid transparent',
      position: 'relative',
      display: 'flex', gap: 11, alignItems: 'flex-start',
    }}>
      <Avatar initials={it.avatar} size={36} hue={it.hue}
        ring={it.urgent ? S.danger : null}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: S.ink,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
          }}>{it.name}</div>
          <div style={{ fontSize: 10.5, color: S.inkSubtle, flexShrink: 0 }}>{it.time}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
            color: roleColor,
            padding: '1.5px 6px', borderRadius: 4, background: `${roleColor}1f`,
          }}>{it.role}</span>
          {it.urgent && <Pill color={S.danger} dot>Urgent</Pill>}
          {it.assigned && (
            <span style={{ fontSize: 10, color: S.inkSubtle }}>· {it.assigned}</span>
          )}
        </div>
        <div style={{
          fontSize: 12, color: S.inkMuted, marginTop: 6,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{it.preview}</div>
      </div>
      {it.unread > 0 && (
        <div style={{
          position: 'absolute', right: 10, bottom: 10,
          minWidth: 18, height: 18, padding: '0 6px', borderRadius: 999,
          background: it.selected ? S.agent : S.accent,
          color: it.selected ? '#fff' : S.surface,
          fontSize: 10.5, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{it.unread}</div>
      )}
    </div>
  );
}

function ChatHeader() {
  return (
    <div style={{
      flexShrink: 0, padding: '14px 22px', borderBottom: `1px solid ${S.edge}`,
      background: S.surfaceEl,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <Avatar initials="NA" size={42} hue={290}/>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: S.ink }}>Noa Avraham</span>
          <Pill color={S.accent}>consumer</Pill>
          <Pill color={S.inkMuted} bg={S.surfaceHi}>VAT included pricing</Pill>
        </div>
        <div style={{ fontSize: 12, color: S.inkSubtle, marginTop: 2,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <SIcon.Car width="12" height="12"/>
            Order JX-4012 · ₪100
          </span>
          <span>·</span>
          <span>Opened 7m ago</span>
          <span>·</span>
          <span style={{ color: S.success, fontWeight: 600 }}>Claimed by you</span>
        </div>
      </div>
      <button style={{
        padding: '8px 12px', borderRadius: 9, border: `1px solid ${S.edge}`,
        background: 'transparent', color: S.inkMuted,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 600, fontFamily: S.sans,
      }}>
        <SIcon.AlertTriangle width="13" height="13"/>
        Escalate
      </button>
      <button style={{
        padding: '8px 14px', borderRadius: 9, border: 'none',
        background: S.agent, color: '#fff',
        fontSize: 12, fontWeight: 700, fontFamily: S.sans,
        boxShadow: `0 4px 12px rgba(63,181,143,0.3)`,
      }}>Resolve</button>
    </div>
  );
}

function ChatBody() {
  const msgs = [
    { side: 'user',  who: 'Noa',  hue: 290, time: '14:18',
      text: "Hi! My washer was supposed to arrive at 14:00 but I don't see him yet 🙏" },
    { side: 'user',  who: 'Noa',  hue: 290, time: '14:18', cont: true,
      text: "Is everything ok?" },
    { side: 'system', text: 'Order JX-4012 status: en_route · washer 1.2 km away · ETA 4 min', time: '14:19' },
    { side: 'agent', who: 'Eli',  hue: 30,  time: '14:19',
      text: "Hi Noa, thanks for reaching out. I'm seeing Yossi 1.2 km from your location — he should arrive in about 4 minutes. Traffic on Namir Rd is a bit heavy today." },
    { side: 'agent', who: 'Eli',  hue: 30,  time: '14:19', cont: true, attachment: 'map' },
    { side: 'user',  who: 'Noa',  hue: 290, time: '14:20',
      text: "Yes please, I can wait another 15 min" },
    { side: 'typing' },
  ];
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Date divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px' }}>
        <div style={{ flex: 1, height: 1, background: S.edge }}/>
        <div style={{ fontSize: 10.5, color: S.inkSubtle, fontWeight: 600,
          letterSpacing: 0.5, textTransform: 'uppercase' }}>Today · May 23</div>
        <div style={{ flex: 1, height: 1, background: S.edge }}/>
      </div>

      {msgs.map((m, i) => {
        if (m.side === 'typing') return <TypingBubble key={i}/>;
        if (m.side === 'system') return (
          <div key={i} style={{ alignSelf: 'center', margin: '8px 0',
            padding: '6px 12px', borderRadius: 999,
            background: S.surfaceEl2, border: `1px solid ${S.edge}`,
            fontSize: 11, color: S.inkMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: S.accent }}/>
            {m.text}
            <span style={{ color: S.inkSubtle }}>· {m.time}</span>
          </div>
        );
        return <Bubble key={i} m={m}/>;
      })}
    </div>
  );
}

function Bubble({ m }) {
  const isAgent = m.side === 'agent';
  return (
    <div style={{
      display: 'flex', gap: 10, alignSelf: isAgent ? 'flex-end' : 'flex-start',
      flexDirection: isAgent ? 'row-reverse' : 'row',
      maxWidth: '78%', marginTop: m.cont ? 2 : 10, alignItems: 'flex-end',
    }}>
      <div style={{ width: 28, height: 28, visibility: m.cont ? 'hidden' : 'visible' }}>
        <Avatar initials={m.who[0]} size={28} hue={m.hue}/>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column',
        alignItems: isAgent ? 'flex-end' : 'flex-start', gap: 4 }}>
        {!m.cont && (
          <div style={{ fontSize: 11, color: S.inkSubtle, padding: '0 4px' }}>
            <span style={{ color: isAgent ? S.agent : S.ink, fontWeight: 600 }}>{m.who}</span>
            <span> · {m.time}</span>
          </div>
        )}
        <div style={{
          padding: '10px 14px',
          background: isAgent
            ? `linear-gradient(135deg, ${S.agent}, ${S.agentDeep})`
            : S.surfaceEl,
          border: isAgent ? 'none' : `1px solid ${S.edge}`,
          color: isAgent ? '#fff' : S.ink,
          fontSize: 13.5, lineHeight: 1.45, fontWeight: 400,
          borderRadius: 14,
          borderBottomRightRadius: isAgent && !m.cont ? 4 : 14,
          borderBottomLeftRadius: !isAgent && !m.cont ? 4 : 14,
          boxShadow: isAgent ? `0 4px 14px rgba(63,181,143,0.18)` : 'none',
          maxWidth: 460,
        }}>
          {m.attachment === 'map' ? (
            <div style={{
              width: 340, height: 180, borderRadius: 8, overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.15)', position: 'relative',
            }}>
              <MapBG dark style={{ width: '100%', height: '100%' }}/>
              <svg viewBox="0 0 340 180" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <path d="M 60 140 Q 120 90 170 80 T 280 50" stroke={S.accent} strokeWidth="3"
                  strokeLinecap="round" fill="none"/>
                <circle cx="60" cy="140" r="9" fill={S.accent} stroke="#fff" strokeWidth="2.5"/>
                <circle cx="280" cy="50" r="9" fill="#fff" stroke={S.accent} strokeWidth="2.5"/>
              </svg>
              <div style={{ position: 'absolute', top: 8, left: 8,
                padding: '4px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)',
                fontSize: 10, color: '#fff', fontWeight: 600, backdropFilter: 'blur(8px)' }}>
                1.2 km · ETA 4 min
              </div>
            </div>
          ) : m.text}
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'center' }}>
      <Avatar initials="N" size={28} hue={290}/>
      <div style={{
        padding: '12px 14px', borderRadius: 14, borderBottomLeftRadius: 4,
        background: S.surfaceEl, border: `1px solid ${S.edge}`,
        display: 'flex', gap: 4,
      }}>
        <style>{`@keyframes sdot{0%,80%,100%{opacity:0.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}`}</style>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%', background: S.inkMuted,
            animation: `sdot 1.2s ${i * 0.15}s infinite ease-in-out`,
          }}/>
        ))}
      </div>
      <span style={{ fontSize: 11, color: S.inkSubtle }}>Noa is typing…</span>
    </div>
  );
}

function ChatComposer() {
  return (
    <div style={{ flexShrink: 0, padding: '12px 22px 16px', borderTop: `1px solid ${S.edge}`,
      background: S.surfaceEl }}>
      {/* Canned response chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: S.inkSubtle, fontWeight: 600,
          letterSpacing: 0.4, padding: '4px 0' }}>QUICK</span>
        {['/eta', '/refund', '/escalate', '/canned'].map(s => (
          <span key={s} style={{
            padding: '4px 9px', borderRadius: 8,
            background: S.surfaceHi, border: `1px solid ${S.edge}`,
            color: S.inkMuted, fontFamily: S.mono, fontSize: 11, fontWeight: 600,
          }}>{s}</span>
        ))}
      </div>
      <div style={{
        border: `1px solid ${S.edgeStrong}`, borderRadius: 12,
        background: S.surface, padding: '10px 12px',
        display: 'flex', alignItems: 'flex-end', gap: 10,
      }}>
        <button style={{
          width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent',
          color: S.inkMuted, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><SIcon.Paperclip width="17" height="17"/></button>
        <div style={{ flex: 1, padding: '6px 0', color: S.ink, fontSize: 13.5, minHeight: 22 }}>
          <span>Thanks Noa — I'll keep you updated. Yossi's now </span>
          <span style={{ background: S.agentSoft, color: S.agent, padding: '1px 3px',
            borderRadius: 3, fontWeight: 600 }}>0.8 km away</span>
          <span style={{ color: S.ink }}>.</span>
          <span style={{ display: 'inline-block', width: 1.5, height: 14,
            background: S.agent, marginLeft: 2, verticalAlign: 'middle',
            animation: 'sblink 1s steps(2) infinite' }}/>
          <style>{`@keyframes sblink{50%{opacity:0}}`}</style>
        </div>
        <div style={{ fontSize: 10.5, color: S.inkSubtle, padding: '0 4px',
          display: 'flex', alignItems: 'center', gap: 4 }}>
          <SIcon.Slash width="11" height="11"/>
          Type / for canned
        </div>
        <button style={{
          padding: '0 14px', height: 34, borderRadius: 9, border: 'none',
          background: S.agent, color: '#fff',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, fontWeight: 700, fontFamily: S.sans,
          boxShadow: `0 3px 10px rgba(63,181,143,0.35)`,
        }}>
          <SIcon.Send width="13" height="13"/>
          Send
        </button>
      </div>
    </div>
  );
}

function OrderContextPanel() {
  return (
    <div style={{
      width: 340, flexShrink: 0, borderLeft: `1px solid ${S.edge}`,
      background: S.surfaceEl, display: 'flex', flexDirection: 'column', overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${S.edge}` }}>
        <div style={{ fontSize: 10.5, color: S.inkSubtle, fontWeight: 700,
          letterSpacing: 0.5, textTransform: 'uppercase' }}>Linked order</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ fontFamily: S.mono, fontSize: 15, fontWeight: 700, color: S.ink }}>
            JX-4012
          </div>
          <Pill color={S.accent} dot>En route</Pill>
        </div>
      </div>

      {/* Map */}
      <div style={{ padding: 14 }}>
        <div style={{ height: 168, borderRadius: 12, overflow: 'hidden',
          position: 'relative', border: `1px solid ${S.edge}` }}>
          <MapBG dark style={{ width: '100%', height: '100%' }}/>
          <svg viewBox="0 0 340 168" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <path d="M 60 130 Q 120 90 170 80 T 280 40" stroke={S.accent} strokeWidth="3" fill="none" strokeLinecap="round"/>
            <circle cx="60" cy="130" r="10" fill={S.accent} stroke="#fff" strokeWidth="2.5">
              <animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite"/>
            </circle>
            <circle cx="280" cy="40" r="10" fill="#fff" stroke={S.accent} strokeWidth="2.5"/>
          </svg>
          <div style={{ position: 'absolute', bottom: 8, left: 8,
            padding: '5px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(10px)',
            fontSize: 11, color: '#fff', fontWeight: 600 }}>
            Live · 4 min · 1.2 km
          </div>
        </div>
      </div>

      {/* Detail rows */}
      <div style={{ padding: '4px 18px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Row label="Service" value="Wash · Private car"/>
        <Row label="Vehicle" value={<><span style={{ fontFamily: S.mono }}>48-271-95</span> · Toyota Corolla 2021</>}/>
        <Row label="Address" value="Habarzel St 23, Tel Aviv"/>
        <Row label="Resources" value={
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <Pill color={S.accent} bg={`${S.accent}1f`}>Water</Pill>
            <Pill color={S.inkSubtle}>No power</Pill>
          </span>
        }/>
      </div>

      {/* Parties */}
      <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PartyRow role="Consumer" name="Noa Avraham" sub="14 orders · 4.8 ★" hue={290} ini="NA"/>
        <PartyRow role="Washer" name="Yossi Mizrahi" sub="1,284 washes · 4.92 ★" hue={145} ini="YM" online/>
      </div>

      {/* Pricing */}
      <div style={{ padding: '0 14px 14px' }}>
        <div style={{
          padding: 14, borderRadius: 12,
          background: S.surface, border: `1px solid ${S.edge}`,
        }}>
          <div style={{ fontSize: 10.5, color: S.inkSubtle, fontWeight: 700,
            letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Pricing</div>
          {[
            { l: 'Worker payout', v: '₪60' },
            { l: 'Platform fee',  v: '₪40' },
            { l: 'VAT (18%)',     v: '₪15.25', muted: true },
          ].map(r => (
            <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between',
              padding: '3px 0', fontSize: 12.5, color: r.muted ? S.inkMuted : S.ink }}>
              <span>{r.l}</span><span style={{ fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${S.edge}`, marginTop: 8, paddingTop: 8,
            display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: S.inkMuted, fontWeight: 600 }}>Consumer total</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: S.ink, letterSpacing: -0.3 }}>₪100</span>
          </div>
          <div style={{ fontSize: 10, color: S.inkSubtle, marginTop: 4 }}>
            Set by DB trigger · client display only
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '0 14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button style={{
          padding: '10px', borderRadius: 10, border: `1px solid ${S.edge}`,
          background: 'transparent', color: S.danger,
          fontSize: 12, fontWeight: 700, fontFamily: S.sans,
        }}>Cancel order</button>
        <button style={{
          padding: '10px', borderRadius: 10, border: 'none',
          background: S.accent, color: S.surface,
          fontSize: 12, fontWeight: 700, fontFamily: S.sans,
        }}>Force complete</button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: S.inkSubtle, fontWeight: 600,
        letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: S.ink, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function PartyRow({ role, name, sub, hue, ini, online }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: 10, borderRadius: 11,
      background: S.surface, border: `1px solid ${S.edge}`,
    }}>
      <div style={{ position: 'relative' }}>
        <Avatar initials={ini} size={36} hue={hue}/>
        {online && (
          <div style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 11, height: 11, borderRadius: '50%', background: S.success,
            border: `2px solid ${S.surface}`,
          }}/>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, color: S.inkSubtle, fontWeight: 700,
          letterSpacing: 0.5, textTransform: 'uppercase' }}>{role}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: S.ink }}>{name}</div>
        <div style={{ fontSize: 11, color: S.inkMuted }}>{sub}</div>
      </div>
      <button style={{
        width: 30, height: 30, borderRadius: 8, border: `1px solid ${S.edge}`,
        background: 'transparent', color: S.inkMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><SIcon.Phone width="14" height="14"/></button>
    </div>
  );
}

Object.assign(window, { SupportConversations });
