import { useState, useEffect } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, FileText, Shield, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageShell from '../../components/ui/PageShell.jsx'
import DeleteAccountModal from '../../components/account/DeleteAccountModal.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { useTheme } from '../../hooks/useTheme.js'
import { useLocale } from '../../hooks/useLocale.js'
import NotificationsSection from '../../components/settings/NotificationsSection.jsx'
import PillRow from '../../components/settings/PillRow.jsx'
import Editable from '../../components/editable/Editable.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

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
  const { locale, setLocale } = useLocale()
  const showToast = useToast()
  const { t } = useTranslation()
  const navigate = useNavigate()

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
  })
  const [showDelete, setShowDelete] = useState(false)

  useEffect(() => {
    if (!profile) return
    setPrefs({
      ringtone: profile.ringtone_preference ?? 'default',
      display:  profile.display_preference  ?? 'dark',
      nav:      profile.nav_app_preference   ?? 'waze',
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

  return (
    <PageShell>
      <div className="px-4 pt-6 pb-8 flex flex-col gap-6">
        <h1 className="text-xl font-bold text-ink">{t('washer.settings.title')}</h1>

        {/* ── 1. Job alert sound (in-app ping) ──────────────────────── */}
        <Editable id="washer.settings.section">
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
        </Editable>

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
          <p className="text-sm font-semibold text-ink">{t('settings.language.label')}</p>
          <p className="text-sm text-ink-muted">{t('settings.language.helper')}</p>
          <PillRow
            groupId="washer-language"
            options={LANGUAGE_OPTIONS}
            value={locale}
            onChange={async (lang) => {
              const { error } = await setLocale(lang)
              if (error) showToast(error.message, 'error')
              else showToast(t('toasts.languageChanged'))
            }}
          />
        </section>

        {/* ── 5. Push notifications (OS-level sound, both roles) ────── */}
        <NotificationsSection />

        {/* ── 6. Legal documents ────────────────────────────────────── */}
        <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-2 flex flex-col">
          <button
            onClick={() => navigate('/legal/washer-terms')}
            className="w-full flex items-center gap-3 px-3 py-3 text-start rounded-xl hover:bg-surface/50"
          >
            <FileText className="h-[18px] w-[18px] text-ink-muted shrink-0" />
            <span className="flex-1 text-sm font-semibold text-ink">{t('legal.links.washerTerms')}</span>
            <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
          </button>
          <button
            onClick={() => navigate('/legal/privacy')}
            className="w-full flex items-center gap-3 px-3 py-3 text-start rounded-xl hover:bg-surface/50"
          >
            <Shield className="h-[18px] w-[18px] text-ink-muted shrink-0" />
            <span className="flex-1 text-sm font-semibold text-ink">{t('legal.links.privacy')}</span>
            <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
          </button>
        </section>

        {/* ── 7. Danger zone — account deletion ─────────────────────── */}
        <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-2">
          <button
            onClick={() => setShowDelete(true)}
            className="w-full flex items-center gap-3 px-3 py-3 text-start rounded-xl hover:bg-danger-50/50"
          >
            <Trash2 className="h-[18px] w-[18px] text-danger-500 shrink-0" />
            <span className="flex-1 text-sm font-semibold text-danger-500">{t('account.delete.title')}</span>
            <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
          </button>
        </section>
      </div>

      {showDelete && <DeleteAccountModal onClose={() => setShowDelete(false)} />}
    </PageShell>
  )
}
