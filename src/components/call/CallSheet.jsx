import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react'
import { useCall } from '../../context/CallContext.jsx'

// In-call / incoming-call overlay (Feature 2). Rendered by CallProvider only
// while a call is active, so it never appears when the feature is off.

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function CallSheet() {
  const { t } = useTranslation()
  const { callState, call, muted, durationSec, accept, decline, hangup, toggleMute } = useCall()

  if (callState === 'idle' || !call) return null

  const statusLabel = {
    ringing:    t('call.ringing'),
    incoming:   t('call.incoming'),
    connecting: t('call.connecting'),
    connected:  fmt(durationSec),
    ended:      t('call.ended'),
    failed:     t('call.failed'),
  }[callState] ?? ''

  const isIncoming = callState === 'incoming'
  const initials = (call.peerName || '?').trim().charAt(0).toUpperCase()

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        role="dialog"
        aria-modal="true"
        aria-label={t('call.incoming')}
        className="w-full max-w-xs flex flex-col items-center text-center text-white"
      >
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold border-4 border-white/20 shadow-xl"
          style={{ background: 'linear-gradient(135deg, #9CDEB6, #26B55F)' }}
        >
          {initials}
        </div>
        <p className="mt-5 text-xl font-bold">{call.peerName || t('call.incoming')}</p>
        <p className="mt-1 text-sm text-white/70">{statusLabel}</p>

        {isIncoming ? (
          <div className="mt-10 flex items-center justify-center gap-12">
            <button
              onClick={decline}
              aria-label={t('call.decline')}
              className="w-16 h-16 rounded-full bg-danger-500 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              onClick={accept}
              aria-label={t('call.accept')}
              className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <Phone className="h-7 w-7" />
            </button>
          </div>
        ) : (
          <div className="mt-10 flex items-center justify-center gap-8">
            <button
              onClick={toggleMute}
              aria-label={muted ? t('call.unmute') : t('call.mute')}
              className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center active:scale-95 transition-transform"
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            <button
              onClick={hangup}
              aria-label={t('call.end')}
              className="w-16 h-16 rounded-full bg-danger-500 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
          </div>
        )}
      </motion.div>
    </div>,
    document.body,
  )
}
