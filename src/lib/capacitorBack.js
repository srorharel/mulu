import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

// Wire up the Android hardware/gesture back button only on native builds.
// On web/PWA the browser handles back-gesture → popstate natively,
// which Fixes A and B already intercept.
//
// Defers to the history stack built by those fixes:
//   - overlays have pushed entries → canGoBack is true → history.back() fires
//     the overlay's popstate handler → overlay closes
//   - sentinel is behind the dashboard → canGoBack is true → history.back()
//     fires the sentinel handler → user stays in the app
//   - genuinely nothing to go back to → App.exitApp()
if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      App.exitApp()
    }
  })
}
