import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, CheckCircle } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera } from '@capacitor/camera'
import { supabase } from '../../lib/supabase.js'

const BUCKET        = 'washer-verification'
const FRAMES_NEEDED = 45   // ~1.5 s at 30 fps

// Detection states:
//   none       → no face found
//   off_center → face found but outside center zone
//   too_far    → face too small (far away)
//   too_close  → face too large (too close)
//   good       → properly positioned, countdown active
//
// Modal phases:
//   starting    → permission check + camera open + detector load
//   live        → camera running; detectionState tracks sub-state
//   uploading   → frame captured, uploading to storage
//   denied      → camera permission refused
//   no_camera   → no camera hardware
//   unsupported → getUserMedia / WebRTC / detectors all unavailable
//   error       → upload failed

const OVAL_STROKE = {
  none:       '#9ca3af',   // gray-400
  off_center: '#facc15',   // yellow-400
  too_far:    '#facc15',
  too_close:  '#facc15',
  good:       '#22c55e',   // green-500
}

// Exported so unit tests can exercise it directly.
export function evaluateFace(box, vw, vh) {
  if (!box) return 'none'
  const cx   = (box.x + box.width  / 2) / vw
  const cy   = (box.y + box.height / 2) / vh
  const area = (box.width * box.height) / (vw * vh)
  if (area < 0.08) return 'too_far'
  if (area > 0.45) return 'too_close'
  if (Math.abs(cx - 0.5) > 0.15 || Math.abs(cy - 0.5) > 0.20) return 'off_center'
  return 'good'
}

async function buildDetector() {
  if ('FaceDetector' in window) {
    try {
      const native = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
      console.log('[selfie] using native FaceDetector')
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
  console.log('[selfie] loading MediaPipe...')
  try {
    const vision = await import('@mediapipe/tasks-vision')
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    )
    const mp = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
    })
    console.log('[selfie] MediaPipe ready')
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
  } catch (err) {
    console.error('[selfie] MediaPipe failed to load', err)
  }
  return null
}

async function ensureCameraPermission() {
  if (!Capacitor.isNativePlatform()) return 'granted'
  try {
    let status = await Camera.checkPermissions()
    console.log('[selfie] checkPermissions:', status.camera)
    if (status.camera === 'granted') return 'granted'
    if (status.camera === 'denied')  return 'denied'
    status = await Camera.requestPermissions({ permissions: ['camera'] })
    console.log('[selfie] requestPermissions result:', status.camera)
    return status.camera === 'granted' ? 'granted' : 'denied'
  } catch (err) {
    console.error('[selfie] permission check error', err)
    return 'granted'
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SelfieVerificationModal({ userId, onCapture, onClose }) {
  const { t } = useTranslation()

  const [phase,          setPhase]          = useState('starting')
  const [detectionState, setDetectionState] = useState('none')
  const [countdown,      setCountdown]      = useState(3)
  const [errorMsg,       setErrorMsg]       = useState('')

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
    streamRef.current?.getTracks().forEach(tr => tr.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  // ── capture & upload ───────────────────────────────────────────────────────
  const capture = useCallback(async (video) => {
    stopCamera()
    setPhase('uploading')
    try {
      const canvas  = document.createElement('canvas')
      canvas.width  = video.videoWidth  || 640
      canvas.height = video.videoHeight || 480
      // Draw without mirroring — save the raw camera frame (un-mirrored)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
      const path = `${userId}/selfie.jpg`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr
      onCapture(URL.createObjectURL(blob), path)
    } catch (err) {
      console.error('[selfie] upload failed', err)
      capturedRef.current = false
      setPhase('error')
      setErrorMsg(err.message || t('washerSignup.verify.submitError'))
    }
  }, [userId, onCapture, stopCamera, t])

  // ── detection loop ─────────────────────────────────────────────────────────
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
      const vw    = video.videoWidth  || video.clientWidth  || 1
      const vh    = video.videoHeight || video.clientHeight || 1
      const box   = faces.length > 0 ? faces[0] : null
      const state = evaluateFace(box, vw, vh)

      console.log('[selfie] detect tick', { state, faces: faces.length, box })

      if (state === 'good') {
        consecutiveRef.current += 1
        const n  = consecutiveRef.current
        const cd = n < FRAMES_NEEDED / 3 ? 3 : n < (2 * FRAMES_NEEDED) / 3 ? 2 : 1
        setDetectionState('good')
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
        }
        setDetectionState(state)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [capture])

  // ── start (permission → camera → detector → loop) ─────────────────────────
  const startCamera = useCallback(async () => {
    stopCamera()
    consecutiveRef.current = 0
    capturedRef.current    = false
    setPhase('starting')
    setDetectionState('none')
    setErrorMsg('')

    console.log('[selfie] startCamera called')
    console.log('[selfie] FaceDetector available?', 'FaceDetector' in window)

    const permResult = await ensureCameraPermission()
    if (permResult === 'denied') {
      console.error('[selfie] camera permission denied')
      setPhase('denied')
      return
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width:      { ideal: 1280 },
          height:     { ideal: 720 },
        },
        audio: false,
      })
    } catch (err) {
      console.error('[selfie] getUserMedia failed', err.name, err.message)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPhase('denied')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPhase('no_camera')
      } else {
        setPhase('unsupported')
      }
      return
    }

    streamRef.current = stream
    console.log('[selfie] stream active?', stream.active, 'tracks:', stream.getTracks().length)

    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play().catch(() => {})
    }

    const detector = await buildDetector()
    console.log('[selfie] detector type:', detector?.type ?? 'none')
    if (!detector) { setPhase('unsupported'); return }
    detectorRef.current = detector
    setPhase('live')

    const video = videoRef.current
    if (!video) return

    const startLoop = () => {
      console.log('[selfie] starting detection loop. dims:', video.videoWidth, 'x', video.videoHeight)
      loop()
    }

    if (video.readyState >= 1) {
      startLoop()
    } else {
      video.addEventListener('loadedmetadata', startLoop, { once: true })
    }
  }, [stopCamera, loop])

  useEffect(() => { startCamera() }, [startCamera])

  // ── derived UI ─────────────────────────────────────────────────────────────
  const selfieT   = useCallback((key) => t(`washerSignup.verify.sectionSelfie.${key}`), [t])
  const showVideo = phase === 'starting' || phase === 'live' || phase === 'uploading'

  const ovalStroke = phase === 'uploading'
    ? '#16a34a'
    : (OVAL_STROKE[detectionState] ?? '#9ca3af')

  const statusText = (() => {
    if (phase === 'live') {
      if (detectionState === 'good')       return `${selfieT('hold')} ${countdown}…`
      if (detectionState === 'off_center') return selfieT('center')
      if (detectionState === 'too_far')    return selfieT('closer')
      if (detectionState === 'too_close')  return selfieT('farther')
      return selfieT('position')
    }
    if (phase === 'uploading') return selfieT('captured')
    return ''
  })()

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center" role="dialog" aria-modal="true">

      {/* Cancel / close button */}
      <button
        type="button"
        onClick={() => { stopCamera(); onClose() }}
        className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/40 z-10"
        aria-label={selfieT('cancel')}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Live camera + oval guide */}
      {showVideo && (
        <div className="relative w-full max-w-sm aspect-[3/4] overflow-hidden" dir="ltr">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
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
              stroke={ovalStroke}
              strokeWidth="4"
              style={{ transition: 'stroke 150ms' }}
            />
          </svg>
        </div>
      )}

      {/* Status text */}
      {statusText ? (
        <p className="mt-6 text-white text-base font-medium text-center px-6">{statusText}</p>
      ) : null}

      {/* Upload flash */}
      {phase === 'uploading' && (
        <div className="flex items-center gap-2 mt-4 text-green-400">
          <CheckCircle className="h-6 w-6" />
        </div>
      )}

      {/* Permission denied */}
      {phase === 'denied' && (
        <div className="flex flex-col items-center gap-5 px-8 text-center">
          <p className="text-white text-base">{selfieT('permissionDenied')}</p>
          <button
            type="button"
            onClick={startCamera}
            className="px-6 py-3 bg-white text-black rounded-xl font-semibold text-sm"
          >
            {selfieT('tryAgain')}
          </button>
        </div>
      )}

      {/* No camera hardware */}
      {phase === 'no_camera' && (
        <p className="px-8 text-white text-base text-center">
          {selfieT('noCameraFound')}
        </p>
      )}

      {/* Unsupported browser / WebRTC unavailable */}
      {phase === 'unsupported' && (
        <p className="px-8 text-white text-base text-center">
          {selfieT('unsupported')}
        </p>
      )}

      {/* Upload error */}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-5 px-8 text-center">
          <p className="text-white text-base">{errorMsg}</p>
          <button
            type="button"
            onClick={startCamera}
            className="px-6 py-3 bg-white text-black rounded-xl font-semibold text-sm"
          >
            {selfieT('retake')}
          </button>
        </div>
      )}
    </div>
  )
}
