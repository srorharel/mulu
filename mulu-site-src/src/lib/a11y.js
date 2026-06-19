// Accessibility (נגישות) settings — persistence + apply logic for the floating
// accessibility menu. Settings are stored in localStorage and re-applied on every
// load (the pre-paint inline script in index.html applies the text/layout subset
// before first paint to avoid a flash; this module re-applies everything, including
// the visual filter modes, after React mounts).

export const STORAGE_KEY = 'mulu-a11y'

// Discrete root-font-size steps (1 = browser default). Scaling the <html>
// font-size scales every rem-based size on the site proportionally.
export const FONT_STEPS = [1, 1.15, 1.3, 1.45, 1.6]

export const DEFAULTS = {
  fontScale: 1,
  // Visual filter modes (applied to the #mulu-content wrapper, never the menu)
  contrast: false,
  invert: false,
  grayscale: false,
  // Text / layout modes (applied as classes on <html>)
  readableFont: false,
  spacing: false,
  links: false,
  headings: false,
  noMotion: false,
  bigCursor: false,
}

// Classes toggled on <html>. These are safe to apply pre-paint (they don't
// create a containing block, so they never disturb fixed/sticky positioning).
export const HTML_CLASSES = {
  readableFont: 'a11y-readable-font',
  spacing: 'a11y-spacing',
  links: 'a11y-links',
  headings: 'a11y-headings',
  noMotion: 'a11y-no-motion',
  bigCursor: 'a11y-big-cursor',
}

// Visual filters are composed into a single CSS `filter` string so they combine
// (multiple `filter` CSS rules would not stack — only the last would win).
function filterString(s) {
  const parts = []
  if (s.contrast) parts.push('contrast(1.35)')
  if (s.grayscale) parts.push('grayscale(1)')
  if (s.invert) parts.push('invert(1) hue-rotate(180deg)')
  return parts.join(' ')
}

export function loadSettings() {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* storage may be unavailable (private mode) — settings just won't persist */
  }
}

export function applySettings(s) {
  if (typeof document === 'undefined') return
  const html = document.documentElement

  // Root font-size (empty string = fall back to browser default)
  html.style.fontSize = s.fontScale && s.fontScale !== 1 ? `${Math.round(s.fontScale * 100)}%` : ''

  // Text / layout classes on <html>
  for (const key of Object.keys(HTML_CLASSES)) {
    html.classList.toggle(HTML_CLASSES[key], !!s[key])
  }

  // Visual filter modes on the content wrapper (kept off the menu itself)
  const wrapper = document.getElementById('mulu-content')
  if (wrapper) wrapper.style.filter = filterString(s)
}
