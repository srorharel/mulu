import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertCircle } from 'lucide-react'

const FACE_API_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js'
const MODEL_URL    = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'

const PROMPTS = ['straight', 'left', 'right', 'up']
const HOLD_MS = 500
const YAW_THRESHOLD  = 0.28
const PITCH_THRESHOLD = 0.25

function loadFaceApiScript() {
  if (window.faceapi) return Promise.resolve(window.faceapi)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${FACE_API_CDN}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.faceapi))
      return
    }
    const script = document.createElement('script')
    script.src = FACE_API_CDN
    script.crossOrigin = 'anonymous'
    script.onload  = () => resolve(window.faceapi)
    script.onerror = () => reject(new Error('face-api.js failed to load'))
    document.head.appendChild(script)
  })
}

function computeYawPitch(landmarks) {
  const pts = landmarks.positions

  const leftEyeOuter  = pts[36]
  const rightEyeOuter = pts[45]
  const noseTip       = pts[30]
  const chin          = pts[8]

  const faceWidth  = rightEyeOuter.x - leftEyeOuter.x
  const eyeCenterY = (leftEyeOuter.y + rightEyeOuter.y) / 2
  const faceHeight = chin.y - eyeCenterY

  if (faceWidth < 1 || faceHeight < 1) return { yaw: 0, relNoseY: 0.35 }

  // yaw: 0 = straight, positive = turning left (person's left), negative = right
  const relNoseX = (noseTip.x - leftEyeOuter.x) / faceWidth
  const yaw = relNoseX - 0.5

  // pitch: lower value = looking up
  const relNoseY = (noseTip.y - eyeCenterY) / faceHeight

  return { yaw, relNoseY }
}

function checkPrompt(id, yaw, relNoseY) {
  switch (id) {
    case 'straight': return Math.abs(yaw) < 0.12 && relNoseY > 0.28
    case 'left':     return yaw > YAW_THRESHOLD
    case 'right':    return yaw < -YAW_THRESHOLD
    case 'up':       return relNoseY < PITCH_THRESHOLD
    default:         return false
  }
}

export default function LivenessCapture({ onComplete }) {
  const { t } = useTranslation()
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const rafRef      = useRef(null)
  const holdTimer   = useRef(null)
  const streamRef   = useRef(null)

  const [phase, setPhase]               = useState('idle')  // idle | loading | active | done | error
  const [modelReady, setModelReady]     = useState(false)
  const [promptIdx, setPromptIdx]       = useState(0)
  const [holding, setHolding]           = useState(false)
  const [capturedFrames, setCapturedFrames] = useState([])
  const [errorMsg, setErrorMsg]         = useState('')

  const promptId = PROMPTS[promptIdx]

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(holdTimer.current)
      stopStream()
    }
  }, [])

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const captureFrame = useCallback(() => {
    const video  = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth  || 320
    canvas.height = video.videoHeight || 240
    canvas.getContext('2d').drawImage(video, 0, 0)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  }, [])

  const advance = useCallback(async (frames, idx) => {
    setHolding(false)
    const blob = await captureFrame()
    const nextFrames = [...frames, blob]
    setCapturedFrames(nextFrames)

    const next = idx + 1
    if (next >= PROMPTS.length) {
      stopStream()
      cancelAnimationFrame(rafRef.current)
      setPhase('done')
      onComplete(nextFrames)
    } else {
      setPromptIdx(next)
    }
  }, [captureFrame, onComplete])

  const runDetection = useCallback((faceapi, frames, idx) => {
    const detect = async () => {
      const video = videoRef.current
      if (!video || video.paused || video.ended) { rafRef.current = requestAnimationFrame(detect); return }

      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)

      if (!detection) {
        rafRef.current = requestAnimationFrame(detect)
        return
      }

      const { yaw, relNoseY } = computeYawPitch(detection.landmarks)
      const currentPrompt = PROMPTS[idx]

      if (checkPrompt(currentPrompt, yaw, relNoseY)) {
        if (!holdTimer.current) {
          setHolding(true)
          holdTimer.current = setTimeout(async () => {
            holdTimer.current = null
            await advance(frames, idx)
            // After advance, detection loop is restarted by the next render cycle
          }, HOLD_MS)
        }
      } else {
        if (holdTimer.current) {
          clearTimeout(holdTimer.current)
          holdTimer.current = null
          setHolding(false)
        }
      }

      rafRef.current = requestAnimationFrame(detect)
    }
    rafRef.current = requestAnimationFrame(detect)
  }, [advance])

  async function start() {
    setPhase('loading')
    setErrorMsg('')
    setCapturedFrames([])
    setPromptIdx(0)
    setHolding(false)

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase('error')
        setErrorMsg(t('washerSignup.verify.sectionLiveness.noCamera'))
        return
      }

      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      } catch {
        setPhase('error')
        setErrorMsg(t('washerSignup.verify.sectionLiveness.noCamera'))
        return
      }

      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      let faceapi = window.faceapi
      if (!faceapi || !modelReady) {
        faceapi = await loadFaceApiScript()
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        ])
        setModelReady(true)
      }

      setPhase('active')
      runDetection(faceapi, [], 0)
    } catch (err) {
      setPhase('error')
      setErrorMsg(err.message || t('washerSignup.verify.sectionLiveness.noCamera'))
    }
  }

  function retake() {
    cancelAnimationFrame(rafRef.current)
    clearTimeout(holdTimer.current)
    holdTimer.current = null
    stopStream()
    setCapturedFrames([])
    setPromptIdx(0)
    setHolding(false)
    setPhase('idle')
    onComplete(null)
  }

  // After promptIdx changes mid-detection we need to restart the loop with updated references
  useEffect(() => {
    if (phase !== 'active') return
    cancelAnimationFrame(rafRef.current)
    clearTimeout(holdTimer.current)
    holdTimer.current = null
    setHolding(false)
    const faceapi = window.faceapi
    if (faceapi) runDetection(faceapi, capturedFrames, promptIdx)
  }, [promptIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      {/* Video preview (hidden until active) */}
      <div className={`relative rounded-2xl overflow-hidden bg-neutral-900 ${phase === 'active' ? 'block' : 'hidden'}`} style={{ aspectRatio: '4/3', maxHeight: 280 }}>
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover mirror"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Oval overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full border-4 border-white/60" style={{ width: 140, height: 180 }} />
        </div>

        {/* Prompt label */}
        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-center py-3 px-4">
          <p className="text-white font-semibold text-sm">
            {t(`washerSignup.verify.sectionLiveness.prompt.${promptId}`)}
          </p>
          {holding && (
            <p className="text-primary-300 text-xs mt-0.5">{t('washerSignup.verify.sectionLiveness.hold')}</p>
          )}
          <p className="text-white/50 text-xs mt-1">
            {promptIdx + 1} / {PROMPTS.length}
          </p>
        </div>
      </div>

      {/* States */}
      {phase === 'idle' && (
        <button
          type="button"
          onClick={start}
          className="btn-primary"
        >
          {t('washerSignup.verify.sectionLiveness.start')}
        </button>
      )}

      {phase === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-neutral-500 py-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          {t('washerSignup.verify.sectionLiveness.loading')}
        </div>
      )}

      {phase === 'done' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-success-600 font-medium text-sm">
            <CheckCircle className="h-5 w-5" />
            {t('washerSignup.verify.sectionLiveness.done')}
          </div>
          <button type="button" onClick={retake} className="btn-ghost text-sm">
            {t('washerSignup.verify.sectionLiveness.retake')}
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2 text-danger-600 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>{errorMsg}</p>
          </div>
          <button type="button" onClick={start} className="btn-ghost text-sm">
            {t('washerSignup.verify.sectionLiveness.start')}
          </button>
        </div>
      )}

      {phase === 'active' && (
        <button type="button" onClick={retake} className="btn-ghost text-sm">
          {t('washerSignup.verify.sectionLiveness.retake')}
        </button>
      )}
    </div>
  )
}
