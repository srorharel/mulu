import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

export function initBackButton(navigate) {
  if (!Capacitor.isNativePlatform()) return

  let lastBack = 0

  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      const now = Date.now()
      if (now - lastBack < 2000) {
        App.exitApp()
      } else {
        lastBack = now
      }
    }
  })
}
