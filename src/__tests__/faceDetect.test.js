import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectFaceInImage } from '../lib/faceDetect.js'

// jsdom does not render images, so we stub Image to auto-fire onload.
class AutoImage {
  constructor() {
    this._src = ''
    this.width = 100
    this.height = 100
  }
  set src(val) {
    this._src = val
    Promise.resolve().then(() => this.onload?.())
  }
  get src() { return this._src }
}

beforeEach(() => {
  vi.stubGlobal('Image', AutoImage)
  delete window.FaceDetector
  delete window.faceapi
  // Remove any injected face-api script tags
  document.querySelectorAll('script[src*="face-api"]').forEach(s => s.remove())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('detectFaceInImage — native FaceDetector path', () => {
  it('returns true when FaceDetector finds a face', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([{ boundingBox: {} }]) }
    })
    expect(await detectFaceInImage('data:image/jpeg;base64,abc')).toBe(true)
  })

  it('returns false when FaceDetector finds no faces', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.resolve([]) }
    })
    expect(await detectFaceInImage('data:image/jpeg;base64,abc')).toBe(false)
  })

  it('falls through to face-api when FaceDetector throws', async () => {
    vi.stubGlobal('FaceDetector', class {
      detect() { return Promise.reject(new Error('unsupported')) }
    })
    // Simulate face-api already on window so we don't wait for script injection
    window.faceapi = {
      nets: { tinyFaceDetector: { isLoaded: true, loadFromUri: vi.fn() } },
      detectSingleFace: vi.fn().mockResolvedValue({ score: 0.9 }),
      TinyFaceDetectorOptions: vi.fn(),
    }
    const result = await detectFaceInImage('data:image/jpeg;base64,abc')
    expect(result).toBe(true)
    // Verify the fallback actually ran face-api detection
    expect(window.faceapi.detectSingleFace).toHaveBeenCalled()
  })
})

describe('detectFaceInImage — face-api fallback path', () => {
  it('returns true when face-api is already on window and detects a face', async () => {
    // Simulate face-api already loaded
    window.faceapi = {
      nets: {
        tinyFaceDetector: {
          isLoaded: true,
          loadFromUri: vi.fn(),
        },
      },
      detectSingleFace: vi.fn().mockReturnValue(Promise.resolve({ score: 0.9 })),
      TinyFaceDetectorOptions: vi.fn(),
    }
    expect(await detectFaceInImage('data:image/jpeg;base64,abc')).toBe(true)
  })

  it('returns false when face-api detects nothing', async () => {
    window.faceapi = {
      nets: { tinyFaceDetector: { isLoaded: true, loadFromUri: vi.fn() } },
      detectSingleFace: vi.fn().mockReturnValue(Promise.resolve(null)),
      TinyFaceDetectorOptions: vi.fn(),
    }
    expect(await detectFaceInImage('data:image/jpeg;base64,abc')).toBe(false)
  })

  it('throws face_check_unavailable when all paths fail', async () => {
    // No FaceDetector, face-api script will fail to load
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
      Promise.resolve().then(() => el.onerror?.(new Error('network')))
      return el
    })
    await expect(detectFaceInImage('data:image/jpeg;base64,abc')).rejects.toThrow('face_check_unavailable')
  })
})
