// Offline session-hydration cache (ADR-035 follow-up).
//
// Persists the few server objects the washer needs to keep operating an ACTIVE
// JOB with no reception (e.g. finishing a wash in an underground garage, or
// cold-starting the app down there): their profile, their active job, and the
// active order row. Without this, a cold start offline leaves `profile` null →
// RoleGuard shows an infinite spinner → the washer is locked out of the job they
// are physically standing next to.
//
// Distinct from the offline-capture queue (offlineSync/*): that stores photo
// Blobs in IndexedDB and replays them on reconnect. This is a tiny, plain-JSON
// localStorage mirror used ONLY as a read-through fallback when the network
// fetch fails. Online behaviour is never driven by it — fresh data always wins.
//
// Every read/write is best-effort and swallows errors (private browsing, quota,
// SSR) so the cache can never itself break the app.

const PROFILE_KEY    = (uid) => `mulu.cache.profile.${uid}`
const ACTIVE_JOB_KEY = (uid) => `mulu.cache.activeJob.${uid}`
const ORDER_KEY      = (oid) => `mulu.cache.order.${oid}`

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function write(key, val) {
  try {
    if (val == null) localStorage.removeItem(key)
    else             localStorage.setItem(key, JSON.stringify(val))
  } catch { /* private browsing / quota — ignore */ }
}

// ── Profile ─────────────────────────────────────────────────────────────────
export function cacheProfile(profile) {
  if (profile?.id) write(PROFILE_KEY(profile.id), profile)
}
export function readCachedProfile(uid) {
  return uid ? read(PROFILE_KEY(uid)) : null
}

// ── Active job (get_washer_active_job result) ─────────────────────────────────
// Pass null to clear (the server confirmed there is no active job).
export function cacheActiveJob(uid, job) {
  if (uid) write(ACTIVE_JOB_KEY(uid), job ?? null)
}
export function readCachedActiveJob(uid) {
  return uid ? read(ACTIVE_JOB_KEY(uid)) : null
}

// ── Active order row (full orders.* used by the active-job panel) ─────────────
export function cacheOrder(order) {
  if (order?.id) write(ORDER_KEY(order.id), order)
}
export function readCachedOrder(orderId) {
  return orderId ? read(ORDER_KEY(orderId)) : null
}
export function removeCachedOrder(orderId) {
  if (orderId) write(ORDER_KEY(orderId), null)
}

// Sign-out sweep: drop the per-user objects so the next account on this device
// never hydrates from a previous user's session. Order keys are id-scoped and
// only ever read while their active job is present, so they're left to be
// overwritten / terminal-cleared rather than enumerated here.
export function clearOfflineCache(uid) {
  if (!uid) return
  write(PROFILE_KEY(uid), null)
  write(ACTIVE_JOB_KEY(uid), null)
}
