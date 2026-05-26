import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

export async function initCapacitor() {
  if (!Capacitor.isNativePlatform()) return

  try {
    await StatusBar.setStyle({ style: Style.Dark })
  } catch (_) { /* plugin not available */ }

  try {
    await StatusBar.setBackgroundColor({ color: '#0c0d12' })
  } catch (_) { /* plugin not available */ }

  try {
    await SplashScreen.hide()
  } catch (_) { /* plugin not available */ }
}
