// Connectivity layer for the underground offline-sync engine (ADR-035).
//
// Implemented on `navigator.onLine` + the DOM `online`/`offline` events, which
// fire in the browser AND inside the Capacitor Android WebView. Either signal
// flipping re-triggers replay; duplicate "online" pings are harmless because
// replay coalesces concurrent calls.
//
// We deliberately avoid a hard dependency on @capacitor/network here: it could
// not be installed in this environment (npm registry TLS failure), and the DOM
// signals are sufficient to drive replay. If richer NATIVE connectivity
// detection is wanted later, add @capacitor/network and prefer
// `Network.addListener('networkStatusChange', …)` — note that pulls in a native
// plugin and requires `npx cap sync android` to link it on device.

export function isOnlineSync() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

// Kept async so callers needn't change if a native (Promise-based) source is
// layered on later.
export async function getOnlineStatus() {
  return isOnlineSync()
}

// Subscribe to connectivity changes. cb(isOnline: boolean). Returns unsubscribe.
export function subscribeOnline(cb) {
  let active = true
  const onOnline  = () => { if (active) cb(true) }
  const onOffline = () => { if (active) cb(false) }
  if (typeof window !== 'undefined') {
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
  }
  return () => {
    active = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }
}
