import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { App } from '@capacitor/app'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../ui/Toast.jsx'
import { getOsPermissionState } from '../../lib/notifications.js'

const SOUNDS = ['chirp', 'chime', 'bell', 'gentle']

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
        ${checked ? 'bg-accent' : 'bg-edge'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

export default function NotificationsSection() {
  const { user } = useAuth()
  const showToast = useToast()
  const { t } = useTranslation()

  const [osState, setOsState]       = useState(null)   // null = loading
  const [prefs, setPrefs]           = useState({ enabled: true, sound: 'chirp' })
  const [loadingPrefs, setLoadingPrefs] = useState(true)

  useEffect(() => {
    getOsPermissionState().then(setOsState)
    if (!user) return
    supabase
      .from('notification_preferences')
      .select('enabled, sound')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setPrefs({ enabled: data.enabled, sound: data.sound })
        setLoadingPrefs(false)
      })
  }, [user])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRequestPermission() {
    const { receive } = await PushNotifications.requestPermissions()
    if (receive === 'granted') {
      await PushNotifications.register()
    }
    setOsState(receive)
  }

  async function handleOpenSettings() {
    const url = Capacitor.getPlatform() === 'android'
      ? 'package:com.sparklego.app'
      : 'app-settings:'
    await App.openUrl({ url })
  }

  async function saveEnabled(enabled) {
    const prev = prefs.enabled
    setPrefs(p => ({ ...p, enabled }))
    const { error } = await supabase
      .from('notification_preferences')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
    if (error) {
      setPrefs(p => ({ ...p, enabled: prev }))
      showToast(t('common.error'), 'error')
    }
  }

  async function saveSound(sound) {
    setPrefs(p => ({ ...p, sound }))
    const { error } = await supabase
      .from('notification_preferences')
      .update({ sound, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
    if (error) showToast(t('common.error'), 'error')
  }

  function playPreview(sound) {
    try {
      new Audio(`/sounds/${sound}.mp3`).play()
    } catch (_) {
      // Non-blocking — audio may be unavailable in some environments
    }
  }

  // Still detecting OS permission state
  if (osState === null) return null

  // Web / PWA — no native push support in v1
  if (osState === 'web') {
    return (
      <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-5">
        <p className="text-sm font-semibold text-ink mb-2">{t('notifications.title')}</p>
        <p className="text-sm text-ink-muted">{t('notifications.webOnly')}</p>
      </section>
    )
  }

  const isGranted = osState === 'granted'

  return (
    <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-4">
      <p className="text-sm font-semibold text-ink">{t('notifications.title')}</p>

      {/* ── OS denied ───────────────────────────────────────────────── */}
      {osState === 'denied' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">{t('notifications.osDenied')}</p>
          <button onClick={handleOpenSettings} className="btn-ghost self-start text-sm">
            {t('notifications.osDeniedAction')}
          </button>
        </div>
      )}

      {/* ── OS not yet asked ────────────────────────────────────────── */}
      {osState === 'prompt' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">{t('notifications.osPrompt')}</p>
          <button onClick={handleRequestPermission} className="btn-primary self-start text-sm">
            {t('notifications.osPromptAction')}
          </button>
        </div>
      )}

      {/* ── Granted: master toggle + sound picker ───────────────────── */}
      {isGranted && !loadingPrefs && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">{t('notifications.masterToggle')}</span>
            <Toggle
              checked={prefs.enabled}
              onChange={saveEnabled}
              disabled={osState === 'denied'}
            />
          </div>

          {prefs.enabled && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                {t('notifications.soundLabel')}
              </p>
              {SOUNDS.map(sound => (
                <div key={sound} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                    <input
                      type="radio"
                      name="notif-sound"
                      value={sound}
                      checked={prefs.sound === sound}
                      onChange={() => saveSound(sound)}
                      className="accent-accent shrink-0"
                    />
                    <span className="text-sm text-ink truncate">
                      {t(`notifications.sound.${sound}`)}
                    </span>
                  </label>
                  <button
                    onClick={() => playPreview(sound)}
                    className="shrink-0 text-xs text-accent border border-edge rounded-lg px-2.5 py-1 hover:bg-accent-muted transition-colors"
                  >
                    {t('notifications.sound.preview')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
