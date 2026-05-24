import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

// ── Hoisted mocks ─────────────────────────────────────────────────────────
const { mockUpload, mockCheckPermissions, mockRequestPermissions } = vi.hoisted(() => ({
  mockUpload:             vi.fn().mockResolvedValue({ error: null }),
  mockCheckPermissions:   vi.fn().mockResolvedValue({ camera: 'granted' }),
  mockRequestPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    storage: { from: () => ({ upload: mockUpload }) },
  },
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }))
vi.mock('@capacitor/camera', () => ({
  Camera: {
    checkPermissions:   mockCheckPermissions,
    requestPermissions: mockRequestPermissions,
  },
}))

// ── requestAnimationFrame control ─────────────────────────────────────────
const rafCallbacks = new Map()
let rafIdCounter = 0

beforeEach(() => {
  vi.clearAllMocks()
  rafCallbacks.clear()
  rafIdCounter = 0
  vi.stubGlobal('requestAnimationFrame', vi.fn(cb => {
    const id = ++rafIdCounter
    rafCallbacks.set(id, cb)
    return id
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn(id => { rafCallbacks.delete(id) }))
  vi.stubGlobal('performance', { now: () => Date.now() })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  rafCallbacks.clear()
})

async function driveOneTick() {
  if (rafCallbacks.size === 0) return
  const [[id, cb]] = rafCallbacks.entries()
  rafCallbacks.delete(id)
  await act(async () => { await cb(performance.now()) })
}

async function driveFrames(n) {
  for (let i = 0; i < n; i++) await driveOneTick()
}

// ── HTMLVideoElement stubs ─────────────────────────────────────────────────
function stubVideoElement() {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth',  { get: () => 640, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 480, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState',  { get: () => 4,   configurable: true })
  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(HTMLVideoElement.prototype, 'srcObject',
    { set: vi.fn(), get: () => null, configurable: true })
}

function makeStream() {
  const stop  = vi.fn()
  const track = { stop, kind: 'video' }
  return { stream: { getTracks: () => [track], active: true }, track, stop }
}

// A face box that evaluateFace(box, 640, 480) → 'good'
// cx=0.5, cy=0.5, area≈0.165 (all within bounds)
const GOOD_FACE = { x: 210, y: 125, width: 220, height: 230 }

// ── i18n ──────────────────────────────────────────────────────────────────
const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        'washerSignup.verify.sectionSelfie.title':            'Selfie verification',
        'washerSignup.verify.sectionSelfie.hint':             "We'll verify your face using your camera",
        'washerSignup.verify.sectionSelfie.start':            'Start verification',
        'washerSignup.verify.sectionSelfie.position':         'Position your face in the oval',
        'washerSignup.verify.sectionSelfie.fitInOval':        'Fit your whole face inside the oval',
        'washerSignup.verify.sectionSelfie.center':           'Center your face',
        'washerSignup.verify.sectionSelfie.closer':           'Move closer',
        'washerSignup.verify.sectionSelfie.farther':          'Move back',
        'washerSignup.verify.sectionSelfie.hold':             'Hold still...',
        'washerSignup.verify.sectionSelfie.captured':         'Captured',
        'washerSignup.verify.sectionSelfie.verified':         'Selfie verified',
        'washerSignup.verify.sectionSelfie.retake':           'Retake',
        'washerSignup.verify.sectionSelfie.permissionDenied': 'Camera access is required. Enable it in your device settings, then tap Try again.',
        'washerSignup.verify.sectionSelfie.noCameraFound':    'No camera found on this device.',
        'washerSignup.verify.sectionSelfie.unsupported':      'Camera not supported in this browser.',
        'washerSignup.verify.sectionSelfie.tryAgain':         'Try again',
        'washerSignup.verify.sectionSelfie.starting':         'Starting camera...',
        'washerSignup.verify.sectionSelfie.cancel':           'Cancel',
        'washerSignup.verify.submitError':                    'Submission failed.',
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

import SelfieVerificationModal, { evaluateFace } from '../components/washer/SelfieVerificationModal.jsx'
import { Capacitor } from '@capacitor/core'
import { Camera } from '@capacitor/camera'

function renderModal(props = {}) {
  const onCapture = props.onCapture ?? vi.fn()
  const onClose   = props.onClose   ?? vi.fn()
  return { onCapture, onClose, ...render(
    <SelfieVerificationModal userId="uid-123" onCapture={onCapture} onClose={onClose} />,
    { wrapper },
  )}
}

// ── evaluateFace unit tests ────────────────────────────────────────────────

describe('evaluateFace', () => {
  const vw = 640, vh = 480

  it('returns "none" when no box provided', () => {
    expect(evaluateFace(null, vw, vh)).toBe('none')
    expect(evaluateFace(undefined, vw, vh)).toBe('none')
  })

  it('returns "good" for a centered face with all corners inside oval', () => {
    // cx=0.5, cy=0.5, area≈0.165 — all 4 corners + center pass pointInOval
    expect(evaluateFace(GOOD_FACE, vw, vh)).toBe('good')
  })

  it('returns "too_far" when face area < 0.06', () => {
    // Small box: 100×100 = 10000 / 307200 ≈ 0.033
    expect(evaluateFace({ x: 270, y: 190, width: 100, height: 100 }, vw, vh)).toBe('too_far')
  })

  it('returns "too_close" when face area > 0.45', () => {
    // Large box: 500×400 = 200000 / 307200 ≈ 0.65
    expect(evaluateFace({ x: 70, y: 40, width: 500, height: 400 }, vw, vh)).toBe('too_close')
  })

  it('returns "off_center" when face is shifted far to the side', () => {
    // top-left corner at x1=0.016 is well outside oval (rx=0.38)
    expect(evaluateFace({ x: 10, y: 90, width: 300, height: 250 }, vw, vh)).toBe('off_center')
  })

  it('returns "off_center" when face is too high (top corners outside oval)', () => {
    // top corners at y1=0.010 are above oval top (cy-ry = 0.5-0.32 = 0.18)
    expect(evaluateFace({ x: 210, y: 5, width: 220, height: 230 }, vw, vh)).toBe('off_center')
  })

  it('returns "off_center" when one corner just exits the oval', () => {
    // x=10 shifts top-left corner outside — containment fails even though center is near oval
    expect(evaluateFace({ x: 10, y: 50, width: 280, height: 280 }, vw, vh)).toBe('off_center')
  })
})

// ── Modal lifecycle ────────────────────────────────────────────────────────

describe('SelfieVerificationModal — modal lifecycle', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
    const { stream } = makeStream()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    })
    delete window.FaceDetector
  })

  it('calls getUserMedia with front camera constraint on mount', async () => {
    renderModal()
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: 'user' } }) })
      )
    )
  })

  it('cancel button stops all tracks and calls onClose', async () => {
    const { stop } = makeStream()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop, kind: 'video' }],
      active: true,
    })
    const onClose = vi.fn()
    renderModal({ onClose })
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    await userEvent.setup().click(screen.getByLabelText('Cancel'))
    expect(stop).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('unmounting stops all camera tracks', async () => {
    const { stop, stream } = makeStream()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(stream)
    const { unmount } = renderModal()
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    unmount()
    expect(stop).toHaveBeenCalled()
  })
})

// ── Permission flow (native platform) ─────────────────────────────────────

describe('SelfieVerificationModal — permission flow', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(true)
    delete window.FaceDetector
  })

  it('proceeds straight to camera when checkPermissions returns granted', async () => {
    mockCheckPermissions.mockResolvedValue({ camera: 'granted' })
    const { stream } = makeStream()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    })
    renderModal()
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })

  it('requests permission when checkPermissions returns prompt, then opens camera', async () => {
    mockCheckPermissions.mockResolvedValue({ camera: 'prompt' })
    mockRequestPermissions.mockResolvedValue({ camera: 'granted' })
    const { stream } = makeStream()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    })
    renderModal()
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    expect(mockRequestPermissions).toHaveBeenCalledWith({ permissions: ['camera'] })
  })

  it('shows denied screen when requestPermissions returns denied', async () => {
    mockCheckPermissions.mockResolvedValue({ camera: 'prompt' })
    mockRequestPermissions.mockResolvedValue({ camera: 'denied' })
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    })
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/Camera access is required/i)).toBeInTheDocument()
    )
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })

  it('shows denied screen immediately when checkPermissions returns denied', async () => {
    mockCheckPermissions.mockResolvedValue({ camera: 'denied' })
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    })
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/Camera access is required/i)).toBeInTheDocument()
    )
    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })

  it('"Try again" button re-runs the permission check', async () => {
    mockCheckPermissions.mockResolvedValueOnce({ camera: 'denied' })
    mockCheckPermissions.mockResolvedValueOnce({ camera: 'granted' })
    const { stream } = makeStream()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    })
    renderModal()
    await waitFor(() => expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument())
    await userEvent.setup().click(screen.getByRole('button', { name: /Try again/i }))
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
  })
})

// ── getUserMedia error states ──────────────────────────────────────────────

describe('SelfieVerificationModal — getUserMedia error states', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
    delete window.FaceDetector
  })

  function gumError(name) {
    const err = new Error(name)
    err.name = name
    return err
  }

  it('shows denied screen on NotAllowedError', async () => {
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(gumError('NotAllowedError')) },
      configurable: true,
    })
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/Camera access is required/i)).toBeInTheDocument()
    )
  })

  it('shows denied screen on PermissionDeniedError', async () => {
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(gumError('PermissionDeniedError')) },
      configurable: true,
    })
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/Camera access is required/i)).toBeInTheDocument()
    )
  })

  it('shows no-camera screen on NotFoundError', async () => {
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(gumError('NotFoundError')) },
      configurable: true,
    })
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/No camera found/i)).toBeInTheDocument()
    )
  })

  it('shows unsupported screen on NotSupportedError', async () => {
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(gumError('NotSupportedError')) },
      configurable: true,
    })
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/Camera not supported/i)).toBeInTheDocument()
    )
  })
})

// ── Detector fallback ──────────────────────────────────────────────────────

describe('SelfieVerificationModal — detector fallback', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
    const { stream } = makeStream()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    })
  })

  it('uses native FaceDetector when available, without importing MediaPipe', async () => {
    const mediapipeImport = vi.fn()
    vi.doMock('@mediapipe/tasks-vision', () => { mediapipeImport(); return {} })
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([]) }
    })
    renderModal()
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    await waitFor(() => rafCallbacks.size > 0)
    expect(mediapipeImport).not.toHaveBeenCalled()
  })

  it('shows unsupported when both FaceDetector and MediaPipe are unavailable', async () => {
    delete window.FaceDetector
    vi.doMock('@mediapipe/tasks-vision', () => { throw new Error('not available') })
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/Camera not supported/i)).toBeInTheDocument()
    )
  })
})

// ── Video loadeddata ───────────────────────────────────────────────────────

describe('SelfieVerificationModal — video loadeddata', () => {
  it('starts detection loop immediately when readyState >= 2', async () => {
    stubVideoElement() // readyState = 4
    Capacitor.isNativePlatform.mockReturnValue(false)
    delete window.FaceDetector
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([]) }
    })
    const { stream } = makeStream()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    })
    renderModal()
    // Loop should start (rAF scheduled) without needing a loadeddata event
    await waitFor(() => expect(rafCallbacks.size).toBeGreaterThan(0))
  })

  it('waits for loadeddata when readyState is 0', async () => {
    // Override readyState to 0 (no data yet)
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth',  { get: () => 640, configurable: true })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 480, configurable: true })
    Object.defineProperty(HTMLVideoElement.prototype, 'readyState',  { get: () => 0, configurable: true })
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(HTMLVideoElement.prototype, 'srcObject',
      { set: vi.fn(), get: () => null, configurable: true })
    Capacitor.isNativePlatform.mockReturnValue(false)
    delete window.FaceDetector
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([]) }
    })
    const { stream } = makeStream()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    })
    renderModal()
    // Wait for camera to open + detector to load (async)
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    // rAF should NOT be scheduled yet because readyState=0 and loadeddata not fired
    expect(rafCallbacks.size).toBe(0)
  })
})

// ── Detection countdown ────────────────────────────────────────────────────

describe('SelfieVerificationModal — detection countdown', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), kind: 'video' }], active: true }),
      },
      configurable: true,
    })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }))
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob(['img'], { type: 'image/jpeg' })))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test') })
  })

  it('shows "Hold still" text when face is good', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([{ boundingBox: GOOD_FACE }]) }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(5)
    await waitFor(() => expect(screen.getByText(/Hold still/i)).toBeInTheDocument())
  })

  it('shows "Position your face in the oval" when no face', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([]) }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(3)
    await waitFor(() =>
      expect(screen.getByText(/Position your face in the oval/i)).toBeInTheDocument()
    )
  })

  it('resets counter when face is lost mid-countdown', async () => {
    let callCount = 0
    vi.stubGlobal('FaceDetector', class {
      detect() {
        callCount++
        // call 1 is the loadDetector smoke-test; loop frames start at call 2
        return Promise.resolve(callCount <= 21 ? [{ boundingBox: GOOD_FACE }] : [])
      }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(20)
    await waitFor(() => expect(screen.getByText(/Hold still/i)).toBeInTheDocument())
    await driveFrames(5)
    await waitFor(() =>
      expect(screen.getByText(/Position your face in the oval/i)).toBeInTheDocument()
    )
  })

  it('auto-captures after FRAMES_NEEDED consecutive good frames', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([{ boundingBox: GOOD_FACE }]) }
    })
    const onCapture = vi.fn()
    renderModal({ onCapture })
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(50)
    await waitFor(() => expect(onCapture).toHaveBeenCalled())
    expect(onCapture).toHaveBeenCalledWith('blob:test', 'uid-123/selfie.jpg')
  })

  it('never captures when no face is detected', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([]) }
    })
    const onCapture = vi.fn()
    renderModal({ onCapture })
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(100)
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('shows "Move closer" text when face is too far away', async () => {
    // Small box: area ≈ 0.033 < 0.06 → too_far
    vi.stubGlobal('FaceDetector', class {
      detect() {
        return Promise.resolve([{ boundingBox: { x: 270, y: 190, width: 100, height: 100 } }])
      }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(3)
    await waitFor(() => expect(screen.getByText(/Move closer/i)).toBeInTheDocument())
  })

  it('shows "Fit your whole face inside the oval" text when face is partially outside oval', async () => {
    // Top-left corner at x=10 exits oval → off_center containment check
    vi.stubGlobal('FaceDetector', class {
      detect() {
        return Promise.resolve([{ boundingBox: { x: 10, y: 90, width: 300, height: 250 } }])
      }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(3)
    await waitFor(() => expect(screen.getByText(/Fit your whole face inside the oval/i)).toBeInTheDocument())
  })

  it('capture fires at exactly 30 consecutive good frames', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([{ boundingBox: GOOD_FACE }]) }
    })
    const onCapture = vi.fn()
    renderModal({ onCapture })
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(29)
    expect(onCapture).not.toHaveBeenCalled()
    await driveFrames(1)
    await waitFor(() => expect(onCapture).toHaveBeenCalled())
  })

  it('resets counter on a non-good frame at frame 30 and does not capture', async () => {
    let callCount = 0
    vi.stubGlobal('FaceDetector', class {
      detect() {
        callCount++
        // Good for frames 1-29, bad at frame 30, good again 31-35
        return Promise.resolve(callCount === 30 ? [] : [{ boundingBox: GOOD_FACE }])
      }
    })
    const onCapture = vi.fn()
    renderModal({ onCapture })
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(35)
    expect(onCapture).not.toHaveBeenCalled()
  })
})

// ── Oval stroke color binding ──────────────────────────────────────────────

describe('SelfieVerificationModal — oval stroke color', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }], active: true }),
      },
      configurable: true,
    })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }))
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob(['img'], { type: 'image/jpeg' })))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test') })
  })

  function getOvalStroke() {
    const ellipse = document.querySelector('ellipse[stroke-width="4"]')
    return ellipse?.getAttribute('stroke')
  }

  it('oval stroke is gray when no face detected', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([]) }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(3)
    await waitFor(() => expect(getOvalStroke()).toBe('#9ca3af'))
  })

  it('oval stroke is yellow when face is off-center', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() {
        return Promise.resolve([{ boundingBox: { x: 10, y: 90, width: 300, height: 250 } }])
      }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(3)
    await waitFor(() => expect(getOvalStroke()).toBe('#facc15'))
  })

  it('oval stroke is green when face is good', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([{ boundingBox: GOOD_FACE }]) }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(5)
    await waitFor(() => expect(getOvalStroke()).toBe('#22c55e'))
  })
})

// ── Upload integration ─────────────────────────────────────────────────────

describe('SelfieVerificationModal — upload integration', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), kind: 'video' }], active: true }),
      },
      configurable: true,
    })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }))
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob(['img'], { type: 'image/jpeg' })))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview') })
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([{ boundingBox: GOOD_FACE }]) }
    })
  })

  it('uploads blob to washer-verification/{userId}/selfie.jpg on capture', async () => {
    const onCapture = vi.fn()
    renderModal({ onCapture })
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(50)
    await waitFor(() => expect(mockUpload).toHaveBeenCalled())
    expect(mockUpload).toHaveBeenCalledWith(
      'uid-123/selfie.jpg',
      expect.any(Blob),
      expect.objectContaining({ upsert: true }),
    )
  })

  it('keeps modal open with error message when upload fails', async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: 'Bucket not found' } })
    const onCapture = vi.fn()
    renderModal({ onCapture })
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(50)
    await waitFor(() => expect(screen.getByText('Bucket not found')).toBeInTheDocument())
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('calls onCapture with previewUrl and storagePath on success', async () => {
    const onCapture = vi.fn()
    renderModal({ onCapture })
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(50)
    await waitFor(() => expect(onCapture).toHaveBeenCalled())
    const [previewUrl, storagePath] = onCapture.mock.calls[0]
    expect(previewUrl).toBe('blob:preview')
    expect(storagePath).toBe('uid-123/selfie.jpg')
  })

  it('stops camera tracks after successful capture', async () => {
    const stop = vi.fn()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop, kind: 'video' }],
      active: true,
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(50)
    await waitFor(() => expect(stop).toHaveBeenCalled())
  })
})

// ── Camera preview visibility ──────────────────────────────────────────────

describe('SelfieVerificationModal — camera preview visibility', () => {
  it('video starts with opacity 0 and shows spinner + starting text during INIT', async () => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
    // Block getUserMedia so modal stays in INIT state
    let resolveGum
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(() => new Promise(r => { resolveGum = r })) },
      configurable: true,
    })
    delete window.FaceDetector
    renderModal()
    // In INIT state: video should be hidden, spinner + text visible
    const video = document.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video.style.opacity).toBe('0')
    expect(screen.getByText('Starting camera...')).toBeInTheDocument()
    // unblock to avoid resource leak
    resolveGum({ getTracks: () => [{ stop: vi.fn(), kind: 'video' }] })
  })

  it('video becomes visible (opacity 1) after reaching READY state', async () => {
    stubVideoElement() // readyState = 4
    Capacitor.isNativePlatform.mockReturnValue(false)
    const { stream } = makeStream()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    })
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([]) }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    const video = document.querySelector('video')
    expect(video.style.opacity).toBe('1')
  })
})

// ── Debug overlay gating ───────────────────────────────────────────────────

describe('SelfieVerificationModal — debug overlay', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), kind: 'video' }], active: true }),
      },
      configurable: true,
    })
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([]) }
    })
  })

  it('renders both debug overlays when import.meta.env.DEV is true (test env default)', async () => {
    // Vitest runs with DEV=true by default — verify overlays are present.
    renderModal()
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    expect(screen.getByText(/BUILD:/)).toBeInTheDocument()
    expect(screen.getByText(/state:.*face:.*frames:/)).toBeInTheDocument()
  })
})
