import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase.js'

const TOKEN_STORAGE_KEY = 'wash_push_token'

// Initialise from localStorage so cold-launch logouts can still clean up the
// token even if the FCM registration event hasn't fired in this session.
let currentToken = localStorage.getItem(TOKEN_STORAGE_KEY) ?? null

// Fallback routes used when data.route is absent from the notification payload.
// The trigger always pre-computes data.route, so this is defensive only.
const EVENT_ROUTE_FALLBACK = {
  order_accepted:     (d) => d.order_id ? `/order/${d.order_id}`      : '/home',
  washer_on_way:      (d) => d.order_id ? `/order/${d.order_id}`      : '/home',
  washer_arrived:     (d) => d.order_id ? `/order/${d.order_id}`      : '/home',
  wash_completed:     (d) => d.order_id ? `/order/${d.order_id}`      : '/home',
  order_approved:     (d) => d.order_id ? `/washer/job/${d.order_id}` : '/washer',
  order_cancelled:    (d) => d.order_id ? `/order/${d.order_id}`      : '/home',
  customer_cancelled: ()  => '/washer',
  new_chat_message:   (d) => d.order_id ? `/order/${d.order_id}`      : '/home',
  new_job_nearby:     ()  => '/washer',
}

// One channel per sound. createChannel is idempotent on Android — safe to call
// on every init. Channels must exist before FCM can route a notification to them.
// Existing channels with a different sound are NOT updated by Android; only new
// installs (or users who reinstall) get the new config automatically.
const CHANNELS = [
  { id: 'wash_chirp',  sound: 'chirp'  },
  { id: 'wash_chime',  sound: 'chime'  },
  { id: 'wash_bell',   sound: 'bell'   },
  { id: 'wash_gentle', sound: 'gentle' },
]

async function createChannels() {
  if (Capacitor.getPlatform() !== 'android') return
  for (const ch of CHANNELS) {
    try {
      await PushNotifications.createChannel({
        id:         ch.id,
        name:       `MULU notifications (${ch.sound})`,
        importance: 4,       // HIGH — heads-up banner + sound
        sound:      `${ch.sound}.mp3`,
        vibration:  true,
        lights:     true,
      })
    } catch (e) {
      console.warn(`[MULU-NOTIF] Failed to create channel ${ch.id}`, e)
    }
  }
}

/**
 * Called once when a logged-in user is confirmed (App mount effect).
 * No-ops on web / PWA — native only.
 */
export async function initNotifications({ navigate, showToast }) {
  console.log('[MULU-NOTIF] initNotifications called, platform=' + Capacitor.getPlatform())

  if (!Capacitor.isNativePlatform()) {
    console.debug('Notifications: web platform, skipping native push registration')
    return
  }

  console.log('[MULU-NOTIF] native platform confirmed')

  const permResult = await PushNotifications.requestPermissions()
  console.log('[MULU-NOTIF] Permission result: ' + JSON.stringify(permResult))

  const { receive } = permResult
  if (receive !== 'granted') {
    console.debug('Notifications: permission not granted:', receive)
    return
  }

  // ── Listeners must be registered BEFORE calling register() ───────────────
  // FCM may return a cached token synchronously; if register() fires the event
  // before addListener() is called, the token is lost.

  // ── Token registration ────────────────────────────────────────────────────
  PushNotifications.addListener('registration', async ({ value: token }) => {
    console.log('[MULU-NOTIF] Token received: ' + token.substring(0, 20) + '...')
    currentToken = token
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    const platform = Capacitor.getPlatform() // 'android' | 'ios'

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      console.warn('[MULU-NOTIF] registration event fired with no active session — token not saved')
      return
    }

    const userId = session.user.id
    console.log('[MULU-NOTIF] Upserting token for user: ' + userId + ' platform: ' + platform)

    const upsertResult = await supabase
      .from('device_tokens')
      .upsert(
        { user_id: userId, token, platform, last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id,token' }
      )

    console.log('[MULU-NOTIF] Upsert result: ' + JSON.stringify({ error: upsertResult.error ?? null, status: upsertResult.status }))
    if (upsertResult.error) console.error('[MULU-NOTIF] Upsert error detail:', upsertResult.error)
  })

  // ── Registration failure ──────────────────────────────────────────────────
  PushNotifications.addListener('registrationError', (err) => {
    console.error('[MULU-NOTIF] Registration error: ' + JSON.stringify(err))
    // Do not throw — app must keep functioning if FCM is unavailable.
  })

  await createChannels()
  console.log('[MULU-NOTIF] Calling PushNotifications.register()')
  await PushNotifications.register()

  // ── Foreground delivery (app is open) ────────────────────────────────────
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const message = notification.body || notification.title || 'New notification'
    showToast(message, 'success', 5000)
  })

  // ── Notification tap (app was backgrounded or closed) ────────────────────
  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const data = notification.data ?? {}

    // Primary: use pre-computed route from the trigger payload.
    if (data.route) {
      navigate(data.route)
      return
    }

    // Fallback: derive route from event_type.
    const fallback = EVENT_ROUTE_FALLBACK[data.event_type]
    if (fallback) {
      navigate(fallback(data))
      return
    }

    // Both absent — open home and log a warning.
    console.warn('Notifications: tap payload missing route and event_type', data)
    navigate('/home')
  })
}

/**
 * Called before supabase.auth.signOut() so the session is still valid
 * when the DELETE fires. Native only; no-ops on web.
 */
export async function unregisterToken() {
  if (!Capacitor.isNativePlatform()) return

  // Fall back to localStorage for cold-launch case where registration event
  // hasn't fired yet but a token was persisted from a previous session.
  const tokenToDelete = currentToken ?? localStorage.getItem(TOKEN_STORAGE_KEY)
  currentToken = null
  localStorage.removeItem(TOKEN_STORAGE_KEY)

  if (!tokenToDelete) return

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const { error } = await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', session.user.id)
      .eq('token', tokenToDelete)

    if (error) console.warn('Notifications: token cleanup failed (non-blocking):', error.message)
  } catch (e) {
    // Logout must never block on token cleanup.
    console.warn('Notifications: token cleanup threw (non-blocking):', e.message)
  }
}

/**
 * Returns the current OS permission state, or 'web' on non-native platforms.
 * @returns {'granted' | 'denied' | 'prompt' | 'web'}
 */
export async function getOsPermissionState() {
  if (!Capacitor.isNativePlatform()) return 'web'

  const { receive } = await PushNotifications.checkPermissions()
  // Capacitor returns 'granted' | 'denied' | 'prompt'
  return receive
}
