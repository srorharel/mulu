import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Camera as CameraIcon, RefreshCw, Check, X } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera } from '@capacitor/camera'
import { App } from '@capacitor/app'
import { isIOSWeb, isIOSStandalone } from '../../lib/platform.js'

// ─────────────────────────────────────────────────────────────────────────────
// In-app camera (Amendment-13 / privacy compliance).
//
// Captures a frame from a live getUserMedia stream straight into an offscreen
// <canvas> → Blob held in RAM, and hands that Blob to the caller. It deliberately
// does NOT use @capacitor/camera Camera.getPhoto or <input capture>, because both
// route through the OS camera/file app and can leave a copy in the device gallery.
// Washers are legally forbidden from saving customer car photos / license plates
// to their personal device, so the legally-sensitive capture flows (evidence,
// car photos) must go through this component, never the gallery.
//
// Props:
//   onCapture(blob)  — called with the captured JPEG Blob (in-memory). The caller
//                      uploads it directly to Supabase Storage.
//   onClose()        — dismissed without capturing.
//   facingMode       — 'environment' (rear, default) | 'user' (front).
//   title            — optional heading shown above the viewfinder.
// ─────────────────────────────────────────────────────────────────────────────

const STATES = {
  IDLE:              'idle',      // iOS web: awaiting the tap that starts getUserMedia
  INIT:              'init',
  PERMISSION_DENIED: 'permission_denied',
  NO_CAMERA:         'no_camera',
  UNSUPPORTED:       'unsupported',
  READY:             'ready',     // live preview, awaiting shutter
  REVIEW:            'review',    // frame captured, awaiting retake/use
}

// iOS/WebKit only reliably shows the camera permission prompt when getUserMedia
// runs inside a user gesture — auto-starting from a mount effect often silently
// fails to prompt. On iOS web we therefore wait for an explicit "Start camera"
// tap. Native (Capacitor) and other browsers keep the instant auto-start.
const iosWebGesture = !Capacitor.isNativePlatform() && isIOSWeb()

const JPEG_QUALITY = 0.9

export default function InAppCamera({ onCapture, onClose, facingMode = 'environment', title }) {
  const { t } = useTranslation()

  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  // The captured frame lives only here, as an in-memory Blob + object URL — never
  // written to disk or the gallery. revokeObjectURL on retake/unmount frees it.
  const blobRef    = useRef(null)
  const startRef   = useRef(null)

  const [state,      setState]      = useState(STATES.INIT)
  const [previewUrl, setPreviewUrl] = useState(null)
  // Mirror for the unmount cleanup: the mount effect ([] deps) closes over the
  // FIRST render's previewUrl (null), so revoking via state there is a no-op
  // and the captured customer-photo blob would stay reachable until teardown.
  const previewUrlRef = useRef(null)
  previewUrlRef.current = previewUrl

  // Android hardware back closes the camera instead of navigating away.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined
    const listener = App.addListener('backButton', () => onClose())
    return () => { listener.then(l => l.remove()) }
  }, [onClose])

  function stopCamera() {
    streamRef.current?.getTracks().forEach(tr => tr.stop())
    streamRef.current = null
  }

  function clearPreview() {
    if (blobRef.current) { URL.revokeObjectURL(previewUrl); blobRef.current = null }
    setPreviewUrl(null)
  }

  async function start() {
    stopCamera()
    clearPreview()
    setState(STATES.INIT)

    // Native: ensure the OS camera permission is granted before opening the
    // stream (getUserMedia inside the Capacitor WebView needs it).
    if (Capacitor.isNativePlatform()) {
      let perm = await Camera.checkPermissions()
      if (perm.camera !== 'granted') {
        if (perm.camera === 'denied') { setState(STATES.PERMISSION_DENIED); return }
        perm = await Camera.requestPermissions({ permissions: ['camera'] })
        if (perm.camera !== 'granted') { setState(STATES.PERMISSION_DENIED); return }
      }
    }

    if (!navigator.mediaDevices?.getUserMedia) { setState(STATES.UNSUPPORTED); return }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') setState(STATES.PERMISSION_DENIED)
      else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') setState(STATES.NO_CAMERA)
      else setState(STATES.UNSUPPORTED)
      return
    }

    streamRef.current = stream
    const video = videoRef.current
    if (!video) { stopCamera(); return }
    video.srcObject = stream
    await video.play().catch(() => {})
    if (video.readyState < 2) {
      await new Promise(r => video.addEventListener('loadeddata', r, { once: true }))
    }
    setState(STATES.READY)
  }

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas  = document.createElement('canvas')
    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (!blob) return
      // Freeze the live stream the moment we have the frame — nothing more is
      // read from the camera until the user retakes.
      stopCamera()
      blobRef.current = blob
      setPreviewUrl(URL.createObjectURL(blob))
      setState(STATES.REVIEW)
    }, 'image/jpeg', JPEG_QUALITY)
  }

  function retake() { start() }

  function use() {
    const blob = blobRef.current
    if (!blob) return
    // Hand the in-memory Blob to the caller. Don't revoke the URL here — the
    // caller may still be showing the preview; unmount cleanup handles it.
    onCapture(blob)
  }

  useEffect(() => {
    startRef.current = start
    // iOS web: hold at IDLE until the user taps Start (gesture-initiated
    // getUserMedia). Everywhere else: open the camera immediately.
    if (iosWebGesture) setState(STATES.IDLE)
    else start()
    return () => { stopCamera(); if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const showVideo = state === STATES.INIT || state === STATES.READY

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 60, display: 'flex', flexDirection: 'column' }}
      role="dialog"
      aria-modal="true"
      dir="ltr"
    >
      {/* Top bar: title + close */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', minHeight: 52 }}>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{title || ''}</span>
        <button
          type="button"
          aria-label={t('camera.cancel')}
          onClick={() => { stopCamera(); onClose() }}
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', borderRadius: 20, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Viewfinder / review area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {showVideo && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: state === STATES.READY ? 1 : 0, transition: 'opacity 200ms' }}
          />
        )}

        {state === STATES.REVIEW && previewUrl && (
          <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        )}

        {state === STATES.INIT && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Loader2 size={38} color="#fff" className="animate-spin" />
            <span style={{ color: '#fff', fontSize: 14 }}>{t('camera.starting')}</span>
          </div>
        )}

        {state === STATES.IDLE && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: 32, textAlign: 'center' }}>
            <button
              type="button"
              onClick={start}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 26px', background: '#fff', color: '#000', borderRadius: 14, fontWeight: 700, fontSize: 15, border: 'none' }}
            >
              <CameraIcon size={20} /> {t('camera.startCamera')}
            </button>
            {isIOSStandalone() && (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 1.4, maxWidth: 280 }}>
                {t('camera.iosStandalone')}
              </p>
            )}
          </div>
        )}

        {(state === STATES.PERMISSION_DENIED || state === STATES.NO_CAMERA || state === STATES.UNSUPPORTED) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: 32, textAlign: 'center' }}>
            <p style={{ color: '#fff', fontSize: 15, lineHeight: 1.4 }}>
              {state === STATES.PERMISSION_DENIED ? t('camera.permissionDenied')
                : state === STATES.NO_CAMERA ? t('camera.noCamera')
                : t('camera.unsupported')}
            </p>
            {isIOSStandalone() && (state === STATES.UNSUPPORTED || state === STATES.PERMISSION_DENIED) && (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 1.4, maxWidth: 280 }}>
                {t('camera.iosStandalone')}
              </p>
            )}
            {state !== STATES.NO_CAMERA && (
              <button
                type="button"
                onClick={() => startRef.current?.()}
                style={{ padding: '12px 24px', background: '#fff', color: '#000', borderRadius: 12, fontWeight: 600, fontSize: 14, border: 'none' }}
              >
                {t('camera.tryAgain')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Privacy reassurance — only while live */}
      {state === STATES.READY && (
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, textAlign: 'center', padding: '0 24px 6px' }}>
          {t('camera.hint')}
        </p>
      )}

      {/* Controls */}
      <div style={{ padding: '14px 14px calc(14px + env(safe-area-inset-bottom, 0px))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, minHeight: 96 }}>
        {state === STATES.READY && (
          <button
            type="button"
            aria-label={t('camera.capture')}
            onClick={capture}
            style={{ width: 70, height: 70, borderRadius: 35, background: '#fff', border: '4px solid rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <CameraIcon size={26} color="#000" />
          </button>
        )}

        {state === STATES.REVIEW && (
          <>
            <button
              type="button"
              onClick={retake}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 22px', background: 'rgba(255,255,255,0.14)', color: '#fff', borderRadius: 14, border: 'none', fontWeight: 600, fontSize: 15 }}
            >
              <RefreshCw size={18} /> {t('camera.retake')}
            </button>
            <button
              type="button"
              onClick={use}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 26px', background: '#26B55F', color: '#fff', borderRadius: 14, border: 'none', fontWeight: 700, fontSize: 15 }}
            >
              <Check size={18} strokeWidth={3} /> {t('camera.use')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
