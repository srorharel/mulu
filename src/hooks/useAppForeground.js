import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

// Calls `onForeground` whenever the app/tab returns to the foreground — the web
// Page Visibility 'visible' transition and, on native, Capacitor's
// appStateChange → isActive.
//
// WHY: Supabase Realtime websockets disconnect while the app is backgrounded and
// do NOT replay events missed during that window on reconnect. So any DB change
// made by another actor while the app was closed (e.g. an agent approving or
// declining a wash) is silently lost — the client stays stale until something
// re-fetches. Re-fetching on foreground is that self-heal.
//
// Pass a STABLE callback (wrap in useCallback) so the listeners aren't town down
// and re-added on every render.
export function useAppForeground(onForeground) {
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') onForeground() }
    document.addEventListener('visibilitychange', onVisible)

    // addListener resolves async — if the effect cleans up before it resolves,
    // the handle lands after cleanup and would leak (firing a stale callback on
    // every foregrounding). Same race useGeolocation guards against.
    let appListener
    let cleanedUp = false
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => { if (isActive) onForeground() })
        .then(l => { if (cleanedUp) l.remove(); else appListener = l })
    }

    return () => {
      cleanedUp = true
      document.removeEventListener('visibilitychange', onVisible)
      appListener?.remove()
    }
  }, [onForeground])
}
