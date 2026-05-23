const FACE_API_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js'
const MODEL_URL    = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'

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
    script.onerror = () => reject(new Error('face-api load failed'))
    document.head.appendChild(script)
  })
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/**
 * Returns true if at least one face is detected in the image at `imageUrl`.
 * Returns false if detection ran but found no face.
 * Throws Error('face_check_unavailable') if all detection paths fail.
 */
export async function detectFaceInImage(imageUrl) {
  const img = await loadImage(imageUrl)

  // Prefer the native browser FaceDetector API (available in Chrome on Android)
  if ('FaceDetector' in window) {
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
      const faces = await detector.detect(img)
      return faces.length > 0
    } catch { /* fall through to face-api */ }
  }

  // Fallback: lazy-load face-api.js from CDN (only on first call)
  try {
    const faceapi = await loadFaceApiScript()
    if (!faceapi.nets.tinyFaceDetector.isLoaded) {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
    }
    const det = await faceapi.detectSingleFace(
      img,
      new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 })
    )
    return !!det
  } catch {
    throw new Error('face_check_unavailable')
  }
}
