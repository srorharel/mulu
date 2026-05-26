import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

export async function registerAgentPush(userId) {
  if (!Capacitor.isNativePlatform()) return null

  try {
    const { receive } = await PushNotifications.requestPermissions()
    if (receive !== 'granted') return null

    await PushNotifications.register()

    return new Promise((resolve) => {
      PushNotifications.addListener('registration', async ({ value: token }) => {
        try {
          await supabase.from('device_tokens').upsert(
            { user_id: userId, token, platform: 'android', last_seen_at: new Date().toISOString() },
            { onConflict: 'user_id,token' }
          )
        } catch (err) {
          console.error('[push] failed to save token:', err)
        }
        resolve(token)
      })

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[push] registration failed:', err)
        resolve(null)
      })
    })
  } catch (err) {
    console.error('[push] init error:', err)
    return null
  }
}

export async function unregisterAgentToken(userId) {
  if (!Capacitor.isNativePlatform()) return

  try {
    await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'android')
  } catch (err) {
    console.error('[push] failed to remove token:', err)
  }
}
