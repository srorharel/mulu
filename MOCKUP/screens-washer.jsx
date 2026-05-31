// MULU — washer screens (Dashboard map, Active Job drawer, Plate states)

// ───────────────────────────────────────────────────────────
// Washer Dashboard — dark, with map and available jobs
// ───────────────────────────────────────────────────────────
function WasherDashboard() {
  const jobs = [
    { x: 96,  y: 230, price: 100, you: false },
    { x: 240, y: 310, price: 120, you: false },
    { x: 310, y: 460, price: 100, you: false },
    { x: 130, y: 480, price: 130, you: false },
  ];
  return (
    <div style={{ position: 'relative', width: 390, height: 844, overflow: 'hidden',
      background: W.dSurface, fontFamily: 'Inter, system-ui', color: W.dInk }}>
      {/* Map */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <MapBG dark style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Subtle vignette */}
      <div style={{ position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)',
        pointerEvents: 'none' }}/>

      {/* Top status bar spacer */}
      <div style={{ height: SAFE_TOP, position: 'relative', zIndex: 5 }}/>

      {/* Top chrome — online toggle pill */}
      <div style={{
        position: 'absolute', top: SAFE_TOP + 8, left: 16, right: 16,
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 5,
      }}>
        <div style={{
          padding: '8px 14px 8px 8px', borderRadius: 999,
          background: 'rgba(26,29,39,0.7)', backdropFilter: 'blur(16px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%, ${W.g300}, ${W.g700})`,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13, border: '2px solid rgba(255,255,255,0.15)',
          }}>YM</div>
          <div>
            <div style={{ fontSize: 12, color: W.dInkMuted, fontWeight: 500, lineHeight: 1 }}>You're</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: W.dInk, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: W.g500,
                boxShadow: `0 0 8px ${W.g500}` }}/>
              Online
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{
          padding: '10px 14px', borderRadius: 16,
          background: 'rgba(26,29,39,0.7)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'right',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}>
          <div style={{ fontSize: 10, color: W.dInkMuted, fontWeight: 600, letterSpacing: 0.4 }}>TODAY</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: W.g500, letterSpacing: -0.3 }}>₪420</div>
        </div>
      </div>

      {/* Job pins */}
      {jobs.map((j, i) => (
        <div key={i} style={{
          position: 'absolute', left: j.x, top: j.y,
          transform: 'translate(-50%, -100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 6,
        }}>
          <div style={{
            padding: '5px 10px', borderRadius: 999,
            background: W.g500, color: W.dSurface,
            fontWeight: 800, fontSize: 12, letterSpacing: -0.2,
            boxShadow: '0 4px 14px rgba(38,181,95,0.5)',
            border: '2px solid rgba(255,255,255,0.5)',
          }}>₪{j.price}</div>
          <div style={{
            width: 0, height: 0, marginTop: -1,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: `8px solid ${W.g500}`,
          }}/>
        </div>
      ))}

      {/* Center: "You are here" */}
      <div style={{
        position: 'absolute', left: 195, top: 380,
        transform: 'translate(-50%, -50%)', zIndex: 7,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(125,217,162,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: W.g500, border: '3px solid #fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}/>
        </div>
      </div>

      {/* Job preview card — incoming */}
      <div style={{
        position: 'absolute', left: 16, right: 16, bottom: SAFE_BOT + 20, zIndex: 10,
      }}>
        <div style={{
          background: 'rgba(26,29,39,0.85)',
          backdropFilter: 'blur(24px) saturate(160%)',
          borderRadius: 24, padding: 14,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}>
          {/* badge row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{
              padding: '5px 11px', borderRadius: 999,
              background: W.g500, color: W.dSurface,
              fontWeight: 800, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: W.dSurface }}/>
              New job · 0.8 km
            </div>
            <div style={{ fontSize: 11, color: W.dInkMuted, fontWeight: 600 }}>
              expires in 0:18
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <IsraeliPlate number="48-271-95" size={0.95}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: W.dInk }}>Toyota Corolla</div>
              <div style={{ fontSize: 12, color: W.dInkMuted }}>White · Private car</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: W.dInkMuted, fontWeight: 600 }}>YOU EARN</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: W.g500, letterSpacing: -0.4 }}>₪60</div>
            </div>
          </div>

          {/* location strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 14,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 12,
          }}>
            <div style={{ color: W.g500 }}><Icon.MapPin width="18" height="18"/></div>
            <div style={{ flex: 1, fontSize: 13, color: W.dInk, fontWeight: 500 }}>
              Habarzel St 23 · Building B
            </div>
            <div style={{ fontSize: 12, color: W.dInkMuted, fontWeight: 600 }}>3 min</div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <button style={{
              height: 48, borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent', color: W.dInk,
              fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
            }}>Skip</button>
            <button style={{
              height: 48, borderRadius: 14, border: 'none',
              background: `linear-gradient(180deg, ${W.g500}, ${W.g700})`, color: '#fff',
              fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 6px 18px rgba(38,181,95,0.4)',
            }}>
              Accept job
              <Icon.ChevronR width="18" height="18" strokeWidth="3"/>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom-right FAB stack (recenter + power) */}
      <div style={{
        position: 'absolute', right: 16, bottom: SAFE_BOT + 246, zIndex: 8,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <button style={{
          width: 48, height: 48, borderRadius: 16, border: 'none',
          background: 'rgba(26,29,39,0.85)', backdropFilter: 'blur(14px)',
          color: W.dInk, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}><Icon.Navigation width="20" height="20" stroke={W.g500} fill={W.g500}/></button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Washer Active Job — drawer fully expanded, washing in progress
// ───────────────────────────────────────────────────────────
function WasherActiveJob() {
  return (
    <div style={{ position: 'relative', width: 390, height: 844, overflow: 'hidden',
      background: W.dSurface, fontFamily: 'Inter, system-ui', color: W.dInk }}>
      <MeshDark />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: SAFE_TOP }}/>

        {/* Header */}
        <div style={{ padding: '6px 16px 4px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={{
            width: 40, height: 40, borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)', color: W.dInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon.ArrowL width="20" height="20"/></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: W.dInkMuted, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Job #JX-4012
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: W.dInk, letterSpacing: -0.4 }}>
              Active wash
            </div>
          </div>
          <div style={{
            padding: '6px 10px', borderRadius: 999,
            background: W.g700, color: '#fff',
            fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#fff',
              animation: 'wpulse 1.5s ease-in-out infinite',
            }}/>
            <style>{`@keyframes wpulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
            WASHING
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          {/* Car / customer card */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 22, padding: 16,
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <IsraeliPlate number="48-271-95" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: W.dInk }}>Toyota Corolla</div>
                <div style={{ fontSize: 12, color: W.dInkMuted }}>2021 · White · Private</div>
              </div>
            </div>
            {/* Customer photo previews */}
            <div style={{ display: 'flex', gap: 8 }}>
              {['Front', 'Side'].map((lbl, i) => (
                <div key={lbl} style={{
                  flex: 1, aspectRatio: '1.3', borderRadius: 12, position: 'relative',
                  background: `linear-gradient(135deg, #4a5560, #2a3038)`,
                  overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <svg viewBox="0 0 100 70" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    <path d="M10 50 Q 12 32 26 30 L 38 22 Q 50 18 62 22 L 74 30 Q 88 32 90 50 L 88 56 L 12 56 Z" fill="rgba(255,255,255,0.85)"/>
                    <path d="M28 32 L 38 24 Q 50 20 62 24 L 72 32 Z" fill="rgba(100,140,170,0.6)"/>
                    <circle cx="26" cy="56" r="6" fill="#0a0a0a"/>
                    <circle cx="74" cy="56" r="6" fill="#0a0a0a"/>
                  </svg>
                  <div style={{
                    position: 'absolute', top: 6, left: 6,
                    background: 'rgba(0,0,0,0.55)', color: '#fff',
                    fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                  }}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer + location */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 22, padding: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: `linear-gradient(135deg, #c08adb, #6e4f8a)`,
                color: '#fff', fontWeight: 700, fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid rgba(255,255,255,0.1)',
              }}>N</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: W.dInk }}>Noa A.</div>
                <div style={{ fontSize: 12, color: W.dInkMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon.Star width="11" height="11" fill={W.warn} stroke="none"/>
                  <span style={{ color: W.dInk, fontWeight: 600 }}>4.8</span>
                  <span>· 14 orders</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[Icon.Message, Icon.Phone].map((Ic, i) => (
                  <button key={i} style={{
                    width: 36, height: 36, borderRadius: 11,
                    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
                    color: W.dInk, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Ic width="16" height="16"/></button>
                ))}
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, background: 'rgba(125,217,162,0.18)',
                color: W.g500, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon.MapPin width="16" height="16"/></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: W.dInk }}>Habarzel St 23</div>
                <div style={{ fontSize: 11, color: W.dInkMuted }}>Building B · Note: yellow pillar</div>
              </div>
              <div style={{
                padding: '6px 10px', borderRadius: 10,
                background: 'rgba(125,217,162,0.12)', color: W.g500,
                fontSize: 11, fontWeight: 700,
              }}>Open in Waze</div>
            </div>
          </div>

          {/* Site resources */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { l: 'Water tap',    on: true,  Ic: Icon.Droplet },
              { l: 'Power outlet', on: false, Ic: Icon.Zap },
            ].map((r, i) => (
              <div key={i} style={{
                flex: 1, padding: '10px 12px', borderRadius: 14,
                background: r.on ? 'rgba(125,217,162,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${r.on ? 'rgba(125,217,162,0.25)' : 'rgba(255,255,255,0.06)'}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ color: r.on ? W.g500 : W.inkMuted }}>
                  <r.Ic width="16" height="16"/>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: W.dInk }}>{r.l}</div>
                  <div style={{ fontSize: 10, color: r.on ? W.g500 : W.dInkMuted }}>
                    {r.on ? 'Available' : 'Not on site'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stage progress */}
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 22, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: W.g500, letterSpacing: 0.4,
              textTransform: 'uppercase', marginBottom: 8 }}>
              Stage 3 of 4
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: W.dInk, letterSpacing: -0.3, marginBottom: 12 }}>
              Washing in progress · 6:42
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[
                { l: 'Arrived',   done: true },
                { l: 'Pre-rinse', done: true },
                { l: 'Wash',      done: true, active: true },
                { l: 'Complete',  done: false },
              ].map((s, i, a) => (
                <React.Fragment key={i}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      width: 14, height: 14, margin: '0 auto', borderRadius: '50%',
                      background: s.done ? W.g500 : 'rgba(255,255,255,0.12)',
                      border: s.active ? `3px solid ${W.g700}` : 'none',
                      boxShadow: s.active ? `0 0 0 3px rgba(125,217,162,0.25)` : 'none',
                    }}/>
                    <div style={{ fontSize: 10, fontWeight: s.active ? 700 : 500,
                      color: s.active ? W.dInk : W.dInkMuted, marginTop: 5 }}>{s.l}</div>
                  </div>
                  {i < a.length - 1 && (
                    <div style={{ flex: 0.3, height: 2, marginBottom: 18,
                      background: s.done ? W.g500 : 'rgba(255,255,255,0.1)', borderRadius: 2 }}/>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* CTA bar */}
        <div style={{ padding: '0 16px 12px', paddingBottom: SAFE_BOT + 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              padding: '8px 12px', borderRadius: 12,
              background: 'rgba(125,217,162,0.1)',
              border: '1px solid rgba(125,217,162,0.2)',
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ fontSize: 10, color: W.dInkMuted, fontWeight: 600 }}>YOU EARN</div>
              <div style={{ flex: 1 }}/>
              <div style={{ fontSize: 16, fontWeight: 800, color: W.g500, letterSpacing: -0.3 }}>₪60</div>
            </div>
          </div>
          <button style={{
            width: '100%', height: 54, borderRadius: 16, border: 'none',
            background: `linear-gradient(180deg, ${W.g500}, ${W.g700})`,
            color: '#fff', fontWeight: 800, fontSize: 16, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 8px 22px rgba(38,181,95,0.45), inset 0 1px 0 rgba(255,255,255,0.3)',
          }}>
            Mark wash complete
            <Icon.Check width="20" height="20" strokeWidth="3"/>
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Plate state stack — 3 states of LicensePlatePicker (idle, looking_up, error)
// ───────────────────────────────────────────────────────────
function PlateStateStack() {
  const states = [
    {
      key: 'idle',
      label: 'IDLE',
      color: W.inkMuted,
      input: '',
      placeholder: 'Enter plate · 7+ digits',
      borderColor: W.edge,
      icon: null,
      footer: null,
    },
    {
      key: 'looking_up',
      label: 'LOOKING UP',
      color: W.g700,
      input: '48-271-95',
      borderColor: W.g300,
      icon: <Icon.Loader width="18" height="18" stroke={W.g700} style={{ animation: 'wspin 0.9s linear infinite' }}/>,
      footer: <span style={{ color: W.inkMuted }}>Checking vehicle registry…</span>,
    },
    {
      key: 'found',
      label: 'CONFIRMED',
      color: W.g700,
      input: '48-271-95',
      borderColor: W.g400,
      icon: <div style={{
        width: 22, height: 22, borderRadius: '50%', background: W.g500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon.Check width="14" height="14" strokeWidth="3" stroke="#fff"/></div>,
      footer: <span style={{ color: W.g700, fontWeight: 600 }}>Toyota Corolla · 2021 · White</span>,
    },
    {
      key: 'not_found',
      label: 'NOT FOUND',
      color: W.warn,
      input: '99-887-65',
      borderColor: W.warn,
      icon: <Icon.Alert width="18" height="18" stroke={W.warn}/>,
      footer: <span style={{ color: W.warn }}>Not in registry · enter manually</span>,
    },
    {
      key: 'error',
      label: 'ERROR',
      color: W.danger,
      input: '48-271-95',
      borderColor: W.danger,
      icon: <Icon.Alert width="18" height="18" stroke={W.danger}/>,
      footer: <span style={{ color: W.danger }}>Network error · tap to retry</span>,
    },
  ];

  return (
    <div style={{ position: 'relative', width: 390, height: 844, overflow: 'hidden',
      background: W.surface, fontFamily: 'Inter, system-ui' }}>
      <style>{`@keyframes wspin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <MeshBG />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: SAFE_TOP }}/>
        <div style={{ padding: '12px 20px 14px' }}>
          <div style={{ fontSize: 12, color: W.g700, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Spec · LicensePlatePicker
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: W.ink, letterSpacing: -0.5, marginTop: 2 }}>
            All five states
          </div>
          <div style={{ fontSize: 12, color: W.inkMuted, marginTop: 4 }}>
            Single persistent &lt;input&gt; · trailing icon swaps per state
          </div>
        </div>

        <div style={{ flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
          {states.map(s => (
            <GlassCard key={s.key} padding={14} radius={18}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.color, letterSpacing: 0.5 }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: W.inkSubtle }}>
                  {s.key}
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 12px 0 14px', height: 48, borderRadius: 14,
                background: '#fff',
                border: `1.5px solid ${s.borderColor}`,
              }}>
                <span style={{
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                  fontSize: 17, fontWeight: 700, letterSpacing: 2,
                  color: s.input ? W.ink : W.inkSubtle, flex: 1,
                }}>
                  {s.input || s.placeholder}
                </span>
                {s.icon}
              </div>
              {s.footer && (
                <div style={{ fontSize: 12, marginTop: 8, paddingLeft: 4 }}>{s.footer}</div>
              )}
            </GlassCard>
          ))}
        </div>
        <div style={{ height: SAFE_BOT + 16 }}/>
      </div>
    </div>
  );
}

Object.assign(window, { WasherDashboard, WasherActiveJob, PlateStateStack });
