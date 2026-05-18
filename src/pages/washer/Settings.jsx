import { useState, useEffect } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import PageShell from '../../components/ui/PageShell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { useTheme } from '../../hooks/useTheme.js'
import i18n from '../../i18n/index.js'
import NotificationsSection from '../../components/settings/NotificationsSection.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

// Horizontal pill selector
function PillRow({ groupId, options, value, onChange }) {
  return (
    <LayoutGroup id={groupId}>
      <div className="flex rounded-xl overflow-hidden border border-edge bg-surface">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="relative flex-1 py-3 text-sm font-medium transition-colors"
          >
            {value === opt.value && (
              <motion.div
                layoutId={`${groupId}-pill`}
                className="absolute inset-0 bg-accent-muted"
                transition={SPRING}
              />
            )}
            <span className={`relative z-10 ${value === opt.value ? 'text-accent' : 'text-ink-muted'}`}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

// 2×2 grid pill selector
function GridPill({ groupId, options, value, onChange }) {
  return (
    <LayoutGroup id={groupId}>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="relative rounded-xl py-3 px-3 text-sm font-medium border border-edge bg-surface transition-colors overflow-hidden"
          >
            {value === opt.value && (
              <motion.div
                layoutId={`${groupId}-pill`}
                className="absolute inset-0 bg-accent-muted"
                transition={SPRING}
              />
            )}
            <span className={`relative z-10 ${value === opt.value ? 'text-accent' : 'text-ink-muted'}`}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

export default function Settings() {
  const { profile, user, refreshProfile } = useAuth()
  const { setTheme } = useTheme()
  const showToast = useToast()
  const { t } = useTranslation()

  const RINGTONE_OPTIONS = [
    { value: 'default', label: t('washer.settings.ringtone.default') },
    { value: 'chime',   label: t('washer.settings.ringtone.chime')   },
    { value: 'bell',    label: t('washer.settings.ringtone.bell')    },
    { value: 'silent',  label: t('washer.settings.ringtone.silent')  },
  ]

  const DISPLAY_OPTIONS = [
    { value: 'dark',  label: t('washer.settings.display.dark')  },
    { value: 'light', label: t('washer.settings.display.light') },
  ]

  const NAV_OPTIONS = [
    { value: 'waze',   label: t('washer.settings.navigation.waze')   },
    { value: 'google', label: t('washer.settings.navigation.google') },
  ]

  // Language options use their own names (not translated)
  const LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'he', label: 'עברית'   },
  ]

  const [prefs, setPrefs] = useState({
    ringtone: 'default',
    display:  'dark',
    nav:      'waze',
    language: i18n.language === 'he' ? 'he' : 'en',
  })

  useEffect(() => {
    if (!profile) return
    setPrefs({
      ringtone: profile.ringtone_preference ?? 'default',
      display:  profile.display_preference  ?? 'dark',
      nav:      profile.nav_app_preference   ?? 'waze',
      language: profile.locale ?? (i18n.language === 'he' ? 'he' : 'en'),
    })
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(column, value) {
    setPrefs(p => ({ ...p, [column]: value }))
    const { error } = await supabase
      .from('profiles')
      .update({ [`${column}_preference`]: value })
      .eq('id', user.id)
    if (error) {
      showToast(error.message, 'error')
      return
    }
    await refreshProfile()
  }

  async function saveLanguage(lang) {
    setPrefs(p => ({ ...p, language: lang }))
    await i18n.changeLanguage(lang)
    const { error } = await supabase
      .from('profiles')
      .update({ locale: lang })
      .eq('id', user.id)
    if (error) showToast(error.message, 'error')
    else await refreshProfile()
  }

  return (
    <PageShell>
      <div className="px-4 pt-6 pb-8 flex flex-col gap-6">
        <h1 className="text-xl font-bold text-ink">{t('washer.settings.title')}</h1>

        {/* ── 1. Job alert sound (in-app ping) ──────────────────────── */}
        <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink">{t('washer.settings.ringtone.label')}</p>
          <GridPill
            groupId="ringtone"
            options={RINGTONE_OPTIONS}
            value={prefs.ringtone}
            onChange={v => save('ringtone', v)}
          />
          <p className="text-xs text-ink-muted/70">{t('washer.settings.ringtone.hint')}</p>
        </section>

        {/* ── 2. Display ────────────────────────────────────────────── */}
        <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink">{t('washer.settings.display.label')}</p>
          <PillRow
            groupId="display"
            options={DISPLAY_OPTIONS}
            value={prefs.display}
            onChange={async v => {
              setPrefs(p => ({ ...p, display: v }))
              const { error } = await setTheme(v)
              if (error) showToast(error.message, 'error')
            }}
          />
        </section>

        {/* ── 3. Navigation ─────────────────────────────────────────── */}
        <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink">{t('washer.settings.navigation.label')}</p>
          <PillRow
            groupId="nav"
            options={NAV_OPTIONS}
            value={prefs.nav}
            onChange={v => save('nav_app', v)}
          />
        </section>

        {/* ── 4. Language ───────────────────────────────────────────── */}
        <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink">{t('washer.settings.language.label')}</p>
          <PillRow
            groupId="language"
            options={LANGUAGE_OPTIONS}
            value={prefs.language}
            onChange={saveLanguage}
          />
        </section>

        {/* ── 5. Push notifications (OS-level sound, both roles) ────── */}
        <NotificationsSection />
      </div>
    </PageShell>
  )
}
