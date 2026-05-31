// Detection of design-edit mode for the support-app.
//
// VENDORED COPY so the support-app builds standalone on Vercel (Root Directory =
// support-app). Canonical original: ../../../src/lib/designEditMode.js in the
// main app. Dependency-free — keep behaviourally in sync with the original.

const FLAG_KEY = 'wash-design-edit-mode'

function hasFlag() {
  try {
    return sessionStorage.getItem(FLAG_KEY) === '1'
  } catch { return false }
}

export function isDesignEditMode() {
  if (typeof window === 'undefined') return false
  if (hasFlag()) return true
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('design_edit') === '1') {
      sessionStorage.setItem(FLAG_KEY, '1')
      return true
    }
  } catch { /* noop */ }
  return false
}

export function exitDesignEditMode() {
  try { sessionStorage.removeItem(FLAG_KEY) } catch { /* noop */ }
}
