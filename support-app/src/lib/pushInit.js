import { Capacitor } from '@capacitor/core'

const PUSH_INIT_TIMEOUT_MS = 5000

export async function registerAgentPush(userId) {
  if (!Capacitor.isNativePlatform()) return null

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    return await Promise.race([
      doRegister(PushNotifications, userId),
      new Promise((resolve) =>
        setTimeout(() => {
          console.warn('[pushInit] registration timed out after 5s, skipping')
          resolve(null)
        }, PUSH_INIT_TIMEOUT_MS)
      ),
    ])
  } catch (err) {
    console.warn('[pushInit] failed, continuing without push:', err?.message ?? err)
    return null
  }
}

async function doRegister(PushNotifications, userId) {
  try {
    const permStatus = await PushNotifications.checkPermissions()
    let receive = permStatus.receive
    if (receive === 'prompt') {
      const req = await PushNotifications.requestPermissions()
      receive = req.receive
    }
    if (receive !== 'granted') {
      console.info('[pushInit] permission not granted, skipping')
      return null
    }

    const token = await new Promise((resolve, reject) => {
      const cleanup = () => {
        PushNotifications.removeAllListeners()
      }
      PushNotifications.addListener('registration', (t) => {
        cleanup()
        resolve(t.value)
      })
      PushNotifications.addListener('registrationError', (e) => {
        cleanup()
        reject(new Error(e.error ?? 'registration error'))
      })
      PushNotifications.register().catch(reject)
    })

    if (!token || !userId) return null

    try {
      const { supabase } = await import('./supabase')
      await supabase.from('device_tokens').upsert(
        { user_id: userId, token, platform: 'android', last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id,token' }
      )
    } catch (dbErr) {
      console.warn('[pushInit] device_tokens upsert failed:', dbErr?.message)
    }

    return token
  } catch (err) {
    console.warn('[pushInit] doRegister failed:', err?.message ?? err)
    return null
  }
}

export async function unregisterAgentToken(userId) {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { supabase } = await import('./supabase')
    await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'android')
  } catch (err) {
    console.warn('[pushInit] failed to remove token:', err?.message)
  }
}
