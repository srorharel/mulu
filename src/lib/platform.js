// Lightweight browser platform detection, used for camera quirks that only
// affect mobile WebKit. Kept dependency-free and SSR/test-safe (guards navigator).

// True on iPhone/iPod/iPad Safari (and other iOS browsers, which are all WebKit).
// iPadOS 13+ masquerades as desktop Safari, so we also sniff touch-capable Mac.
export function isIOSWeb() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iP(hone|od|ad)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// True when running as an installed (standalone) iOS home-screen web app. On
// older iOS, getUserMedia is unavailable in standalone mode — the camera only
// works in the Safari tab — so the UI nudges the user to open it in Safari.
export function isIOSStandalone() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  if (!isIOSWeb()) return false
  const mql = window.matchMedia && window.matchMedia('(display-mode: standalone)')
  return navigator.standalone === true || (mql && mql.matches === true)
}
