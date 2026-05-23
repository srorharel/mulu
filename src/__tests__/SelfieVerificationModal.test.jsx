import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

// ── Hoisted mocks ─────────────────────────────────────────────────────────
const { mockUpload, mockCheckPermissions, mockRequestPermissions } = vi.hoisted(() => ({
  mockUpload:            vi.fn().mockResolvedValue({ error: null }),
  mockCheckPermissions:  vi.fn().mockResolvedValue({ camera: 'granted' }),
  mockRequestPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    storage: { from: () => ({ upload: mockUpload }) },
  },
}))

// isNativePlatform is overridden per-test in the permission suite
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }))
vi.mock('@capacitor/camera', () => ({
  Camera: {
    checkPermissions:  mockCheckPermissions,
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
  return { stream: { getTracks: () => [track] }, track, stop }
}

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
        'washerSignup.verify.sectionSelfie.positioning':      'Position your face in the frame',
        'washerSignup.verify.sectionSelfie.hold':             'Hold still...',
        'washerSignup.verify.sectionSelfie.captured':         'Captured',
        'washerSignup.verify.sectionSelfie.verified':         'Selfie verified',
        'washerSignup.verify.sectionSelfie.retake':           'Retake',
        'washerSignup.verify.sectionSelfie.permissionDenied': 'Camera access is required. Enable it in your device settings, then tap Try again.',
        'washerSignup.verify.sectionSelfie.noCameraFound':    'No camera found on this device.',
        'washerSignup.verify.sectionSelfie.unsupported':      'Camera not supported in this browser.',
        'washerSignup.verify.sectionSelfie.tryAgain':         'Try again',
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

import SelfieVerificationModal from '../components/washer/SelfieVerificationModal.jsx'
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

// ── Detection countdown ────────────────────────────────────────────────────

describe('SelfieVerificationModal — detection countdown', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn(), kind: 'video' }] }),
      },
      configurable: true,
    })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }))
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob(['img'], { type: 'image/jpeg' })))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test') })
  })

  it('resets counter when face is lost mid-countdown', async () => {
    let callCount = 0
    vi.stubGlobal('FaceDetector', class {
      detect() {
        callCount++
        return Promise.resolve(callCount <= 20 ? [{ boundingBox: GOOD_FACE }] : [])
      }
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(20)
    await waitFor(() => expect(screen.getByText(/Hold still/i)).toBeInTheDocument())
    await driveFrames(5)
    await waitFor(() =>
      expect(screen.getByText(/Position your face in the frame/i)).toBeInTheDocument()
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
    await driveFrames(60)
    expect(onCapture).not.toHaveBeenCalled()
  })
})

// ── Upload integration ─────────────────────────────────────────────────────

describe('SelfieVerificationModal — upload integration', () => {
  beforeEach(() => {
    stubVideoElement()
    Capacitor.isNativePlatform.mockReturnValue(false)
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
    })
    renderModal()
    await waitFor(() => rafCallbacks.size > 0)
    await driveFrames(50)
    await waitFor(() => expect(stop).toHaveBeenCalled())
  })
})
