// Incoming-call ringtone, synthesized with the Web Audio API so it needs no
// bundled audio asset and works the same on web + Capacitor WebView. Plays a
// classic two-tone ring cadence (≈1s ring, ≈2s gap) on a loop + vibrates, until
// stopRing() is called (answer / decline / timeout / connect).
//
// Autoplay note: browsers/WebViews may keep an AudioContext suspended until a
// user gesture. primeRingtone() unlocks it on first interaction (CallProvider
// wires it to the first pointerdown) so the ring can sound when a call arrives
// without a fresh gesture. On a native WebView (where remote call audio already
// auto-plays) this generally works; on a cold web tab with zero prior gesture
// the ring may be silent until the user taps — the on-screen call card still shows.

let ctx = null
let timer = null
let active = false

function getCtx() {
  if (!ctx) {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// Call from a user gesture (e.g. first tap) to unlock audio output ahead of time.
export function primeRingtone() {
  getCtx()
}

function vibrate() {
  try { navigator.vibrate?.([600, 200, 600, 1600]) } catch { /* unsupported */ }
}

// One ~1s two-tone ring (440Hz + 480Hz, US-style), enveloped to avoid clicks.
function ringOnce() {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const dur = 1.0
  for (const f of [440, 480]) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = f
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05)
    gain.gain.setValueAtTime(0.2, now + dur - 0.08)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    osc.connect(gain).connect(c.destination)
    osc.start(now)
    osc.stop(now + dur)
  }
}

export function startRing() {
  if (active) return
  active = true
  ringOnce()
  vibrate()
  // Repeat the ring+vibrate cadence until stopped.
  timer = setInterval(() => { ringOnce(); vibrate() }, 3000)
}

export function stopRing() {
  active = false
  if (timer) { clearInterval(timer); timer = null }
  try { navigator.vibrate?.(0) } catch { /* unsupported */ }
}
