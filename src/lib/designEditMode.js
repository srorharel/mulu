// Detection of design-edit mode for the main + support apps.
//
// Edit mode is enabled when the URL contains ?design_edit=1 AND the URL
// also carries an admin-issued token (verified server-side; here we just
// look for the query param). To prevent normal users from poking the flag,
// the actual writes to design_overrides are guarded by the super_admin
// RLS write policy + the bound-validating RPC. The flag's only job is to
// flip the visual affordance.

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
