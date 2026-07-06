import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import { getIceServers } from '../lib/turn.js'
import { FEATURES } from '../lib/featureFlags.js'
import { primeRingtone, startRing, stopRing } from '../lib/ringtone.js'
import CallSheet from '../components/call/CallSheet.jsx'

// ── In-app WebRTC voice calling (Feature 2) ──────────────────────────────────
// Privacy by design: the call is data only — neither party's real phone number
// is involved or exposed. Signalling rides Supabase Realtime broadcast; media is
// a direct peer connection (STUN/TURN from the turn-credentials Edge Function).
//
// Channels:
//   user-calls:<userId>  — personal inbox; the only thing sent here is `ring`
//                          (so a callee is reachable anywhere in the app).
//   call:<callId>        — per-call signalling: accept / decline / offer /
//                          answer / ice / hangup. Both parties join this one.
//
// The whole provider is inert unless FEATURES.inAppCalls: with the flag off it
// renders children and nothing else (no channels, no sheet) — fully hidden.

const CallContext = createContext(null)

// callState: 'idle' | 'ringing' (outgoing) | 'incoming' | 'connecting' | 'connected' | 'ended' | 'failed'
export function CallProvider({ children }) {
  const { user, profile } = useAuth()
  const enabled = FEATURES.inAppCalls && !!user

  const [callState, setCallState]  = useState('idle')
  const [call, setCall]            = useState(null) // { callId, peerId, peerName, orderId, role }
  const [muted, setMuted]          = useState(false)
  const [speakerOn, setSpeakerOn]  = useState(true)
  const [durationSec, setDuration] = useState(0)

  const pcRef           = useRef(null)
  const localStreamRef  = useRef(null)
  const callChanRef     = useRef(null)
  const remoteAudioRef  = useRef(null)
  const pendingIceRef   = useRef([])
  const callRef         = useRef(null)
  const callStateRef    = useRef('idle')
  const durationTimer   = useRef(null)
  const disconnectTimer = useRef(null)

  callRef.current      = call
  callStateRef.current = callState

  // `call` intentionally stays set during the 1.5s ended/failed flash, so
  // "is a call live" must also consult the state — otherwise the flash window
  // silently blocks new outgoing calls and drops incoming rings.
  const isLiveCall = () =>
    !!callRef.current && !['idle', 'ended', 'failed'].includes(callStateRef.current)

  // ── Teardown ────────────────────────────────────────────────────────────────
  const cleanup = useCallback((finalState = 'idle') => {
    if (durationTimer.current)   { clearInterval(durationTimer.current);  durationTimer.current = null }
    if (disconnectTimer.current) { clearTimeout(disconnectTimer.current); disconnectTimer.current = null }
    try { pcRef.current?.close() } catch { /* noop */ }
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (callChanRef.current) { supabase.removeChannel(callChanRef.current); callChanRef.current = null }
    pendingIceRef.current = []
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    setMuted(false)
    setSpeakerOn(true)
    setDuration(0)
    setCallState(finalState)
    if (finalState === 'idle') {
      setCall(null)
    } else {
      // Brief "ended/failed" flash, then reset — but only if a new call hasn't
      // started in the meantime. Compare against the call that just ended (a
      // ref comparison would match the NEW call too and wrongly clear it).
      const endedCall = callRef.current
      setTimeout(() => {
        setCallState((s) => (s === finalState ? 'idle' : s))
        setCall((c) => (c === endedCall ? null : c))
      }, 1500)
    }
  }, [])

  // ── Signalling helpers (defined before the callbacks that depend on them) ─────
  const sendSignal = useCallback((callId, event, payload) => {
    callChanRef.current?.send({ type: 'broadcast', event, payload: { ...payload, from: user?.id } })
  }, [user?.id])

  const flushPendingIce = useCallback(async () => {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) return
    for (const c of pendingIceRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch { /* noop */ }
    }
    pendingIceRef.current = []
  }, [])

  // ── Peer-connection wiring (shared by caller + callee) ────────────────────────
  const buildPeerConnection = useCallback(async (callId) => {
    const iceServers = await getIceServers()
    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStreamRef.current = stream
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    pc.ontrack = (e) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0]
        remoteAudioRef.current.play?.().catch(() => {})
      }
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(callId, 'ice', { candidate: e.candidate })
    }
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') {
        // A recovered blip cancels the pending disconnect teardown.
        if (disconnectTimer.current) { clearTimeout(disconnectTimer.current); disconnectTimer.current = null }
        setCallState('connected')
        if (!durationTimer.current) {
          durationTimer.current = setInterval(() => setDuration((d) => d + 1), 1000)
        }
      } else if (s === 'failed') {
        cleanup('failed')
      } else if (s === 'closed') {
        cleanup('ended')
      } else if (s === 'disconnected') {
        // Per spec 'disconnected' is recoverable (Wi-Fi → cellular handoff,
        // ICE consent blip) — give it a grace window instead of killing the
        // call instantly; 'failed' means it's truly gone.
        if (!disconnectTimer.current) {
          disconnectTimer.current = setTimeout(() => {
            disconnectTimer.current = null
            if (pcRef.current === pc && pc.connectionState === 'disconnected') cleanup('ended')
          }, 7000)
        }
      }
    }
    return pc
  }, [cleanup, sendSignal])

  // Subscribe to the per-call channel and wire signalling handlers. `role`
  // controls who creates the offer (caller, after the callee accepts).
  const joinCallChannel = useCallback((callId, role) => {
    const chan = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false } } })
    callChanRef.current = chan

    chan.on('broadcast', { event: 'accept' }, async () => {
      if (role !== 'caller' || !pcRef.current) return
      setCallState('connecting')
      const offer = await pcRef.current.createOffer()
      await pcRef.current.setLocalDescription(offer)
      sendSignal(callId, 'offer', { sdp: offer })
    })

    chan.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      const pc = pcRef.current
      if (!pc) return
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      await flushPendingIce()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignal(callId, 'answer', { sdp: answer })
    })

    chan.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      const pc = pcRef.current
      if (!pc) return
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      await flushPendingIce()
    })

    chan.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      const pc = pcRef.current
      if (!pc) return
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch { /* noop */ }
      } else {
        pendingIceRef.current.push(payload.candidate)
      }
    })

    chan.on('broadcast', { event: 'decline' }, () => cleanup('ended'))
    chan.on('broadcast', { event: 'hangup' }, () => cleanup('ended'))

    chan.subscribe()
    return chan
  }, [cleanup, sendSignal, flushPendingIce])

  // ── Public actions ────────────────────────────────────────────────────────────

  // Start an outgoing call to a peer (used by the call buttons).
  const startCall = useCallback(async ({ peerId, peerName, orderId }) => {
    if (!enabled || isLiveCall() || !peerId) return
    // Unguessable per-call id (names the `call:<id>` Realtime channel). Use a
    // CSPRNG, not Math.random, so a third party can't guess the channel name and
    // attempt to observe/inject SDP/ICE. (Channel membership should also be
    // authorized server-side via Realtime RLS — verify that in the dashboard.)
    const rand = crypto.getRandomValues(new Uint32Array(2))
    const callId = `${orderId || 'x'}-${user.id.slice(0, 8)}-${rand[0].toString(36)}${rand[1].toString(36)}`
    setCall({ callId, peerId, peerName, orderId, role: 'caller' })
    setCallState('ringing')

    try {
      await buildPeerConnection(callId)
    } catch {
      cleanup('failed')
      return
    }
    joinCallChannel(callId, 'caller')

    // Ring the callee on their personal inbox channel.
    const inbox = supabase.channel(`user-calls:${peerId}`)
    inbox.subscribe((status) => {
      // A failed subscribe must still release the channel — supabase-js keeps
      // it registered and retrying otherwise, leaking one per failed attempt.
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        supabase.removeChannel(inbox)
        return
      }
      if (status !== 'SUBSCRIBED') return
      inbox.send({
        type: 'broadcast',
        event: 'ring',
        payload: { callId, fromId: user.id, fromName: profile?.full_name || '', orderId },
      }).finally(() => setTimeout(() => supabase.removeChannel(inbox), 1000))
    })

    // Best-effort push so the callee rings when the app is backgrounded/closed.
    // Non-blocking — the in-app ring above is the primary path.
    supabase.functions.invoke('notify-call', {
      body: { to_user_id: peerId, call_id: callId, from_name: profile?.full_name || '', order_id: orderId },
    }).catch(() => {})
  }, [enabled, user, profile, buildPeerConnection, joinCallChannel, cleanup])

  // Accept an incoming call.
  const accept = useCallback(async () => {
    const c = callRef.current
    if (!c || c.role !== 'callee') return
    setCallState('connecting')
    try {
      await buildPeerConnection(c.callId)
    } catch {
      sendSignal(c.callId, 'decline', {})
      cleanup('failed')
      return
    }
    sendSignal(c.callId, 'accept', {})
  }, [buildPeerConnection, cleanup, sendSignal])

  // Decline an incoming call.
  const decline = useCallback(() => {
    const c = callRef.current
    if (c) sendSignal(c.callId, 'decline', {})
    cleanup('ended')
  }, [cleanup, sendSignal])

  // Hang up an active/outgoing call.
  const hangup = useCallback(() => {
    const c = callRef.current
    if (c) sendSignal(c.callId, 'hangup', {})
    cleanup('ended')
  }, [cleanup, sendSignal])

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const next = !muted
    stream.getAudioTracks().forEach((t) => { t.enabled = !next })
    setMuted(next)
  }, [muted])

  // Best-effort speakerphone toggle. Routes the remote audio to a different
  // output sink where the platform exposes earpiece vs speaker as distinct
  // devices (desktop + newer Android Chrome via setSinkId). On mobile WebViews
  // that don't expose separate sinks this flips the on-screen state only —
  // guaranteed native earpiece/speaker routing there needs a Capacitor audio
  // plugin (AudioManager / AVAudioSession). Audio defaults to speaker on.
  const toggleSpeaker = useCallback(async () => {
    const next = !speakerOn
    setSpeakerOn(next)
    const el = remoteAudioRef.current
    if (!el || typeof el.setSinkId !== 'function') return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const outs = devices.filter((d) => d.kind === 'audiooutput')
      const target = next
        ? (outs.find((d) => d.deviceId === 'default') || outs[0])
        : (outs.find((d) => /ear|receiver|handset/i.test(d.label)) ||
           outs.find((d) => d.deviceId !== 'default') || outs[0])
      if (target) await el.setSinkId(target.deviceId)
    } catch { /* routing not available — visual toggle only */ }
  }, [speakerOn])

  // ── Incoming-call inbox: subscribe to the personal channel ────────────────────
  useEffect(() => {
    if (!enabled) return undefined
    const inbox = supabase.channel(`user-calls:${user.id}`)
    inbox.on('broadcast', { event: 'ring' }, ({ payload }) => {
      if (isLiveCall()) return // already on a call — ignore
      setCall({
        callId: payload.callId,
        peerId: payload.fromId,
        peerName: payload.fromName,
        orderId: payload.orderId,
        role: 'callee',
      })
      setCallState('incoming')
      joinCallChannel(payload.callId, 'callee')
    })
    inbox.subscribe()
    return () => supabase.removeChannel(inbox)
  }, [enabled, user?.id, joinCallChannel])

  // Stop any active call on logout.
  useEffect(() => {
    if (!user && callRef.current) cleanup('idle')
  }, [user, cleanup])

  // Unlock the ringtone's AudioContext on the first user gesture so an incoming
  // call can actually sound (browsers suspend audio until a gesture).
  useEffect(() => {
    if (!enabled) return undefined
    const prime = () => primeRingtone()
    window.addEventListener('pointerdown', prime, { once: true })
    return () => window.removeEventListener('pointerdown', prime)
  }, [enabled])

  // Ring (audible + vibrate) while a call is incoming; stop on answer/decline/end.
  useEffect(() => {
    if (callState === 'incoming') startRing()
    else stopRing()
    return () => stopRing()
  }, [callState])

  // Safety timeouts. Without these: an outgoing ring the callee never answers
  // rings forever; an incoming ring whose caller app died (no hangup broadcast
  // ever arrives — e.g. a stale notification tap) rings/vibrates forever; a
  // connect against a long-gone peer spins forever.
  useEffect(() => {
    if (!['ringing', 'incoming', 'connecting'].includes(callState)) return undefined
    const ms = callState === 'connecting' ? 30000 : 45000
    const timer = setTimeout(() => {
      const c = callRef.current
      if (c && callState === 'ringing') sendSignal(c.callId, 'hangup', {})
      cleanup(callState === 'connecting' ? 'failed' : 'ended')
    }, ms)
    return () => clearTimeout(timer)
  }, [callState, cleanup, sendSignal])

  // Tapping a backgrounded/closed incoming-call notification reconstructs the
  // call here — the original Realtime `ring` broadcast was missed while the app
  // was down. notifications.js dispatches 'mulu:incoming-call' on that tap.
  useEffect(() => {
    if (!enabled) return undefined
    const onIncoming = (e) => {
      const { callId, from, fromId } = e.detail || {}
      if (!callId || isLiveCall()) return
      setCall({ callId, peerId: fromId || null, peerName: from || '', orderId: null, role: 'callee' })
      setCallState('incoming')
      joinCallChannel(callId, 'callee')
    }
    window.addEventListener('mulu:incoming-call', onIncoming)
    return () => window.removeEventListener('mulu:incoming-call', onIncoming)
  }, [enabled, joinCallChannel])

  const value = { enabled, callState, call, muted, speakerOn, durationSec, startCall, accept, decline, hangup, toggleMute, toggleSpeaker }

  return (
    <CallContext.Provider value={value}>
      {children}
      {enabled && <audio ref={remoteAudioRef} autoPlay hidden />}
      {enabled && callState !== 'idle' && <CallSheet />}
    </CallContext.Provider>
  )
}

export function useCall() {
  const ctx = useContext(CallContext)
  // Safe no-op shape when the provider isn't mounted (flag off) so callers can
  // unconditionally call useCall() without crashing.
  if (!ctx) {
    return {
      enabled: false, callState: 'idle', call: null, muted: false, speakerOn: true, durationSec: 0,
      startCall: () => {}, accept: () => {}, decline: () => {}, hangup: () => {}, toggleMute: () => {}, toggleSpeaker: () => {},
    }
  }
  return ctx
}
