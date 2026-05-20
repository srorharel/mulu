import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { App } from '@capacitor/app'
import { Play } from 'lucide-react'
import { motion } from 'framer-motion'
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
          ${checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

export default function NotificationsSection() {
  const { user } = useAuth()
  const showToast = useToast()
  const { t } = useTranslation()

  const [osState, setOsState]           = useState(null)
  const [prefs, setPrefs]               = useState({ enabled: true, sound: 'chirp' })
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

  // ── Handlers — unchanged ─────────────────────────────────────────────────────

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
      .upsert(
        { user_id: user.id, enabled, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    if (error) {
      setPrefs(p => ({ ...p, enabled: prev }))
      showToast(t('common.error'), 'error')
    }
  }

  async function saveSound(sound) {
    setPrefs(p => ({ ...p, sound }))
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: user.id, sound, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    if (error) showToast(t('common.error'), 'error')
  }

  function playPreview(sound) {
    try {
      new Audio(`/sounds/${sound}.mp3`).play()
    } catch (_) {
      // Non-blocking — audio may be unavailable in some environments
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (osState === null) return null

  // Web / PWA — no native push support in v1
  if (osState === 'web') {
    return (
      <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold text-ink">{t('notifications.title')}</p>
        <p className="text-sm text-ink-muted">{t('notifications.webOnly')}</p>
      </section>
    )
  }

  const isGranted = osState === 'granted'

  return (
    <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-5 flex flex-col gap-3">
      <p className="text-sm font-semibold text-ink">{t('notifications.title')}</p>

      {/* ── OS denied — warning panel ────────────────────────────────── */}
      {osState === 'denied' && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 dark:border-edge dark:bg-surface-elevated p-3 flex flex-col gap-2">
          <p className="text-sm text-warning-800 dark:text-ink-muted">{t('notifications.osDenied')}</p>
          <button
            onClick={handleOpenSettings}
            className="btn-ghost self-start text-sm text-warning-700 dark:text-ink-muted"
          >
            {t('notifications.osDeniedAction')}
          </button>
        </div>
      )}

      {/* ── OS not yet asked — prompt panel ─────────────────────────── */}
      {osState === 'prompt' && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 dark:border-edge dark:bg-surface-elevated p-3 flex flex-col gap-2">
          <p className="text-sm text-ink-muted">{t('notifications.osPrompt')}</p>
          <button
            onClick={handleRequestPermission}
            className="btn-primary self-start text-sm"
          >
            {t('notifications.osPromptAction')}
          </button>
        </div>
      )}

      {/* ── Granted: master toggle + sound picker ───────────────────── */}
      {isGranted && !loadingPrefs && (
        <>
          {/* Master toggle — matches Appearance section pattern */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink flex-1 min-w-0 me-3">{t('notifications.masterToggle')}</p>
            <Toggle
              checked={prefs.enabled}
              onChange={saveEnabled}
              disabled={osState === 'denied'}
            />
          </div>

          {/* Sound picker */}
          {prefs.enabled && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-[0.4px]">
                {t('notifications.soundLabel')}
              </p>

              <div className="flex flex-col gap-1" role="radiogroup">
                {SOUNDS.map(sound => {
                  const isSelected = prefs.sound === sound
                  return (
                    <motion.div
                      key={sound}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => saveSound(sound)}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          saveSound(sound)
                        }
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl cursor-pointer transition-colors border-s-[3px] ${
                        isSelected
                          ? 'border-accent'
                          : 'border-transparent hover:bg-neutral-50 dark:hover:bg-surface-elevated'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink leading-snug">
                          {t(`notifications.sound.${sound}`)}
                        </p>
                        <p className="text-xs text-ink-subtle leading-snug">
                          {t(`settings.notifications.sound.${sound}.desc`)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); playPreview(sound) }}
                        aria-label={t('notifications.sound.preview')}
                        className="shrink-0 flex items-center justify-center rounded-lg text-ink-muted hover:text-accent hover:bg-accent-muted transition-colors"
                        style={{ minHeight: 44, minWidth: 44 }}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
