import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

// ── Hoisted mocks ─────────────────────────────────────────────────────────
const { mockUpload } = vi.hoisted(() => ({
  mockUpload: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    storage: { from: () => ({ upload: mockUpload }) },
  },
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/camera', () => ({
  Camera: { requestPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }) },
}))

// ── requestAnimationFrame control ─────────────────────────────────────────
// We store scheduled callbacks in a map so tests can drive the loop manually.
const rafCallbacks = new Map()
let rafIdCounter = 0

beforeEach(() => {
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

// Drive one pending rAF callback (the most-recently-added one)
async function driveOneTick() {
  if (rafCallbacks.size === 0) return
  const [[id, cb]] = rafCallbacks.entries()
  rafCallbacks.delete(id)
  await act(async () => { await cb(performance.now()) })
}

// Drive N ticks (each schedules the next automatically due to the loop)
async function driveFrames(n) {
  for (let i = 0; i < n; i++) {
    await driveOneTick()
  }
}

// ── HTMLVideoElement stubs ─────────────────────────────────────────────────
// jsdom doesn't implement camera APIs; stub the minimum needed.
function stubVideoElement() {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth',  { get: () => 640, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 480, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState',  { get: () => 4,   configurable: true })
  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(HTMLVideoElement.prototype, 'srcObject',
    { set: vi.fn(), get: () => null, configurable: true })
}

// ── Camera stream mock ─────────────────────────────────────────────────────
function makeStream() {
  const stop = vi.fn()
  const track = { stop, kind: 'video' }
  const stream = { getTracks: () => [track], stop }
  return { stream, track, stop }
}

// Face bounding box that passes isFaceGood for a 640×480 video:
// centre at (320, 240), area = 220×230 / (640×480) ≈ 16.4% ≥ 15%
const GOOD_FACE = { x: 210, y: 125, width: 220, height: 230 }

// ── i18n setup ─────────────────────────────────────────────────────────────
const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        'washerSignup.verify.sectionSelfie.title':           'Selfie verification',
        'washerSignup.verify.sectionSelfie.hint':            "We'll verify your face using your camera",
        'washerSignup.verify.sectionSelfie.start':           'Start verification',
        'washerSignup.verify.sectionSelfie.positioning':     'Position your face in the frame',
        'washerSignup.verify.sectionSelfie.hold':            'Hold still...',
        'washerSignup.verify.sectionSelfie.captured':        'Captured',
        'washerSignup.verify.sectionSelfie.verified':        'Selfie verified',
        'washerSignup.verify.sectionSelfie.retake':          'Retake',
        'washerSignup.verify.sectionSelfie.unsupported':     'Face verification not supported on this device.',
        'washerSignup.verify.sectionSelfie.permissionDenied':'Camera permission required',
        'washerSignup.verify.sectionSelfie.cancel':          'Cancel',
        'washerSignup.verify.submitError':                   'Submission failed.',
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

// ── Import after mocks are declared ───────────────────────────────────────
import SelfieVerificationModal from '../components/washer/SelfieVerificationModal.jsx'

// ── Helpers ────────────────────────────────────────────────────────────────
function renderModal(props = {}) {
  const onCapture = props.onCapture ?? vi.fn()
  const onClose   = props.onClose   ?? vi.fn()
  return { onCapture, onClose, ...render(
    <SelfieVerificationModal userId="uid-123" onCapture={onCapture} onClose={onClose} />,
    { wrapper },
  )}
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SelfieVerificationModal — modal lifecycle', () => {
  beforeEach(() => {
    stubVideoElement()
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
        expect.objectContaining({ video: expect.objectContaining({ facingMode: 'user' }) })
      )
    )
  })

  it('cancel button calls stopCamera (stops all tracks) and onClose', async () => {
    const { stop } = makeStream()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop, kind: 'video' }],
    })
    const onClose = vi.fn()
    renderModal({ onClose })

    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())

    await userEvent.setup().click(screen.getByLabelText('Cancel'))
    expect(stop).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('unmounting the component stops all camera tracks', async () => {
    const { stop, stream } = makeStream()
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(stream)
    const { unmount } = renderModal()
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    unmount()
    expect(stop).toHaveBeenCalled()
  })
})

describe('SelfieVerificationModal — detector fallback', () => {
  beforeEach(() => {
    stubVideoElement()
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
    // Give time for detector init to complete
    await waitFor(() => rafCallbacks.size > 0)
    expect(mediapipeImport).not.toHaveBeenCalled()
  })

  it('shows "not supported" when both FaceDetector and MediaPipe are unavailable', async () => {
    delete window.FaceDetector
    vi.doMock('@mediapipe/tasks-vision', () => { throw new Error('not available') })

    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/Face verification not supported/i)).toBeInTheDocument()
    )
  })
})

describe('SelfieVerificationModal — detection countdown', () => {
  let stopMock

  beforeEach(() => {
    stubVideoElement()
    stopMock = vi.fn()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopMock, kind: 'video' }] }),
      },
      configurable: true,
    })

    // Stub canvas toBlob so capture doesn't fail
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }))
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob(['img'], { type: 'image/jpeg' })))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test') })
  })

  it('counter resets to 0 when face is lost mid-countdown', async () => {
    let callCount = 0
    vi.stubGlobal('FaceDetector', class {
      detect() {
        callCount++
        // Return face for 20 frames, then nothing
        return Promise.resolve(callCount <= 20 ? [{ boundingBox: GOOD_FACE }] : [])
      }
    })

    renderModal()
    await waitFor(() => rafCallbacks.size > 0)

    // 20 frames with face → countdown shown
    await driveFrames(20)
    await waitFor(() => expect(screen.getByText(/Hold still/i)).toBeInTheDocument())

    // 5 more frames with no face → reset to "Position your face"
    await driveFrames(5)
    await waitFor(() =>
      expect(screen.getByText(/Position your face in the frame/i)).toBeInTheDocument()
    )
  })

  it('auto-captures and calls onCapture after FRAMES_NEEDED consecutive good frames', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([{ boundingBox: GOOD_FACE }]) }
    })

    const onCapture = vi.fn()
    renderModal({ onCapture })
    await waitFor(() => rafCallbacks.size > 0)

    // Drive 45+ frames — should trigger capture
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

    await driveFrames(60)
    expect(onCapture).not.toHaveBeenCalled()
  })
})

describe('SelfieVerificationModal — upload integration', () => {
  beforeEach(() => {
    stubVideoElement()
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), kind: 'video' }] }),
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

  it('keeps modal open and shows error message when upload fails', async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: 'Bucket not found' } })
    const onCapture = vi.fn()
    renderModal({ onCapture })
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(50)
    await waitFor(() => expect(screen.getByText('Bucket not found')).toBeInTheDocument())
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('calls onCapture with previewUrl and storagePath on successful upload', async () => {
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
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(50)
    await waitFor(() => expect(stop).toHaveBeenCalled())
  })
})
