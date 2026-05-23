import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, CheckCircle } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera } from '@capacitor/camera'
import { supabase } from '../../lib/supabase.js'

const BUCKET          = 'washer-verification'
const FRAMES_NEEDED   = 45    // ~1.5 s at 30 fps
const CENTER_TOL      = 0.35  // face centre ≤35% from frame centre
const MIN_AREA_RATIO  = 0.15  // face must cover ≥15% of frame area

function isFaceGood(face, vw, vh) {
  const cx = face.x + face.width  / 2
  const cy = face.y + face.height / 2
  return (
    Math.abs(cx - vw / 2) < vw * CENTER_TOL &&
    Math.abs(cy - vh / 2) < vh * CENTER_TOL &&
    (face.width * face.height) / (vw * vh) >= MIN_AREA_RATIO
  )
}

// Returns a normalised detector or null if nothing is available.
// Called once when the modal opens; result is stored in a ref.
async function buildDetector() {
  // Priority 1: native browser FaceDetector (Chrome Android)
  if ('FaceDetector' in window) {
    try {
      const native = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
      return {
        type: 'native',
        isAsync: true,
        run: (el) => native.detect(el).then(r =>
          r.map(f => ({ x: f.boundingBox.x, y: f.boundingBox.y,
                        width: f.boundingBox.width, height: f.boundingBox.height }))
        ),
      }
    } catch { /* fall through */ }
  }

  // Priority 2: MediaPipe Tasks Vision (lazy-loaded to avoid bundle bloat)
  try {
    const vision = await import('@mediapipe/tasks-vision')
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )
    const mp = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
    })
    return {
      type: 'mediapipe',
      isAsync: false,
      run: (el) => {
        const r = mp.detectForVideo(el, performance.now())
        return r.detections.map(d => ({
          x: d.boundingBox.originX, y: d.boundingBox.originY,
          width: d.boundingBox.width, height: d.boundingBox.height,
        }))
      },
    }
  } catch { /* fall through */ }

  return null
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SelfieVerificationModal({ userId, onCapture, onClose }) {
  const { t } = useTranslation()

  const [phase, setPhase]       = useState('starting')
  // phases: starting | detecting | countdown | uploading | error | unsupported
  const [countdown, setCountdown] = useState(3)
  const [errorMsg,  setErrorMsg]  = useState('')

  const videoRef       = useRef(null)
  const streamRef      = useRef(null)
  const detectorRef    = useRef(null)
  const rafRef         = useRef(null)
  const consecutiveRef = useRef(0)
  const capturedRef    = useRef(false)

  // ── stop camera ────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // Always stop the camera when the modal unmounts
  useEffect(() => () => stopCamera(), [stopCamera])

  // ── detection loop (defined before start so it can be called from start) ──
  const loop = useCallback(() => {
    const tick = async () => {
      if (capturedRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const { isAsync, run } = detectorRef.current
      let faces = []
      try {
        faces = isAsync ? await run(video) : run(video)
      } catch {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const vw = video.videoWidth  || video.clientWidth  || 1
      const vh = video.videoHeight || video.clientHeight || 1
      const good = faces.length > 0 && isFaceGood(faces[0], vw, vh)

      if (good) {
        consecutiveRef.current += 1
        const n = consecutiveRef.current
        const cd = n < FRAMES_NEEDED / 3 ? 3 : n < (2 * FRAMES_NEEDED) / 3 ? 2 : 1
        setPhase('countdown')
        setCountdown(cd)
        if (n >= FRAMES_NEEDED) {
          capturedRef.current = true
          await capture(video)
          return
        }
      } else {
        if (consecutiveRef.current > 0) {
          consecutiveRef.current = 0
          setCountdown(3)
          setPhase('detecting')
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── capture & upload ───────────────────────────────────────────────────────
  const capture = useCallback(async (video) => {
    stopCamera()
    setPhase('uploading')
    try {
      const canvas = document.createElement('canvas')
      canvas.width  = video.videoWidth  || 640
      canvas.height = video.videoHeight || 480
      canvas.getContext('2d').drawImage(video, 0, 0)
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
      const path = `${userId}/selfie.jpg`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr
      onCapture(URL.createObjectURL(blob), path)
    } catch (err) {
      console.error('[washer-verify] selfie upload failed', err)
      capturedRef.current = false
      setPhase('error')
      setErrorMsg(err.message || t('washerSignup.verify.submitError'))
    }
  }, [userId, onCapture, stopCamera, t])

  // ── start camera + init detector ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function start() {
      // On Capacitor Android, request camera permission explicitly
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await Camera.requestPermissions({ permissions: ['camera'] })
          if (perm.camera !== 'granted') {
            if (!cancelled) {
              setPhase('error')
              setErrorMsg(t('washerSignup.verify.sectionSelfie.permissionDenied'))
            }
            return
          }
        } catch { /* best-effort; getUserMedia will fail if denied */ }
      }

      // Open the front camera
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      } catch {
        if (!cancelled) {
          setPhase('error')
          setErrorMsg(t('washerSignup.verify.sectionSelfie.permissionDenied'))
        }
        return
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      // Initialise face detector (may lazy-load MediaPipe)
      const detector = await buildDetector()
      if (cancelled) return
      if (!detector) { setPhase('unsupported'); return }
      detectorRef.current = detector
      setPhase('detecting')
      loop()
    }

    start()
    return () => { cancelled = true }
  }, [loop, t])

  // ── retry after upload error ───────────────────────────────────────────────
  async function retry() {
    setErrorMsg('')
    consecutiveRef.current = 0
    capturedRef.current    = false
    setPhase('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setPhase('detecting')
      loop()
    } catch {
      setPhase('error')
      setErrorMsg(t('washerSignup.verify.sectionSelfie.permissionDenied'))
    }
  }

  // ── status text ────────────────────────────────────────────────────────────
  const statusText =
    phase === 'detecting'  ? t('washerSignup.verify.sectionSelfie.positioning')
    : phase === 'countdown' ? `${t('washerSignup.verify.sectionSelfie.hold')} ${countdown}…`
    : phase === 'uploading' ? t('washerSignup.verify.sectionSelfie.captured')
    : ''

  const showVideo = phase === 'starting' || phase === 'detecting' || phase === 'countdown'

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center" role="dialog" aria-modal="true">

      {/* Cancel / close button */}
      <button
        type="button"
        onClick={() => { stopCamera(); onClose() }}
        className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/40 z-10"
        aria-label={t('washerSignup.verify.sectionSelfie.cancel')}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Live camera + oval guide */}
      {showVideo && (
        <div className="relative w-full max-w-sm aspect-[3/4] overflow-hidden" dir="ltr">
          {/* Mirror the video horizontally so it feels like a mirror */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          {/* SVG overlay: dim everything outside the oval */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 300 400"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <defs>
              <mask id="face-oval-mask">
                <rect width="300" height="400" fill="white" />
                <ellipse cx="150" cy="185" rx="95" ry="125" fill="black" />
              </mask>
            </defs>
            <rect width="300" height="400" fill="rgba(0,0,0,0.45)" mask="url(#face-oval-mask)" />
            <ellipse
              cx="150" cy="185" rx="95" ry="125"
              fill="none"
              stroke={phase === 'countdown' ? '#22c55e' : 'rgba(255,255,255,0.85)'}
              strokeWidth="3"
            />
          </svg>
        </div>
      )}

      {/* Status text (detecting / countdown / uploading) */}
      {statusText ? (
        <p className="mt-6 text-white text-base font-medium text-center px-6">
          {statusText}
        </p>
      ) : null}

      {/* Upload success flash */}
      {phase === 'uploading' && (
        <div className="flex items-center gap-2 mt-4 text-green-400">
          <CheckCircle className="h-6 w-6" />
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-5 px-8 text-center">
          <p className="text-white text-base">{errorMsg}</p>
          <button
            type="button"
            onClick={retry}
            className="px-6 py-3 bg-white text-black rounded-xl font-semibold text-sm"
          >
            {t('washerSignup.verify.sectionSelfie.retake')}
          </button>
        </div>
      )}

      {/* Unsupported */}
      {phase === 'unsupported' && (
        <p className="px-8 text-white text-base text-center">
          {t('washerSignup.verify.sectionSelfie.unsupported')}
        </p>
      )}
    </div>
  )
}
