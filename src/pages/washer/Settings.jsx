import { useState, useEffect } from 'react'
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, FileText, Shield, Trash2,
  Moon, Navigation, Languages, BellRing,
} from 'lucide-react'
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

// ── Small building blocks ───────────────────────────────────────────────────

// Rounded, tinted leading icon. `tone` keeps preference rows (accent),
// navigation rows (neutral) and destructive rows (danger) visually distinct.
function IconTile({ children, tone = 'accent' }) {
  const tones = {
    accent:  'bg-accent-muted text-accent',
    neutral: 'bg-surface-elevated text-ink-muted border border-edge',
    danger:  'bg-danger-50 text-danger-500 dark:bg-danger-500/10',
  }
  return (
    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
      {children}
    </div>
  )
}

// Section heading that sits on the page background, above a grouped card.
function GroupLabel({ children }) {
  return (
    <p className="px-1.5 text-[11px] font-bold uppercase tracking-[0.6px] text-ink-muted">
      {children}
    </p>
  )
}

// A preference: leading icon + label (+ hint) on top, full-width control below.
function PrefBlock({ icon, label, hint, children, divider }) {
  return (
    <div className={`flex flex-col gap-3 px-3 py-4 ${divider ? 'border-t border-edge/60' : ''}`}>
      <div className="flex items-center gap-3">
        <IconTile>{icon}</IconTile>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">{label}</p>
          {hint && <p className="text-xs text-ink-muted mt-0.5 leading-snug">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

// A tappable navigation/action row (legal links, delete account).
function LinkRow({ icon, tone = 'neutral', label, danger, onClick, divider }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 min-h-[56px] text-start rounded-xl
        transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
        ${danger ? 'hover:bg-danger-50/60 dark:hover:bg-danger-500/10' : 'hover:bg-surface/60'}
        ${divider ? 'border-t border-edge/60' : ''}`}
    >
      <IconTile tone={tone}>{icon}</IconTile>
      <span className={`flex-1 text-sm font-semibold ${danger ? 'text-danger-500' : 'text-ink'}`}>
        {label}
      </span>
      <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
    </button>
  )
}

// 2×2 grid pill selector (job-alert sound — 4 options).
function GridPill({ groupId, options, value, onChange }) {
  return (
    <LayoutGroup id={groupId}>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <motion.button
            key={opt.value}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(opt.value)}
            className="relative rounded-xl py-3 px-3 text-sm font-medium border border-edge bg-surface
              transition-colors overflow-hidden cursor-pointer
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
          </motion.button>
        ))}
      </div>
    </LayoutGroup>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { profile, user, refreshProfile } = useAuth()
  const { setTheme } = useTheme()
  const { locale, setLocale } = useLocale()
  const showToast = useToast()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()

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

  // ── Identity header data ──────────────────────────────────────────────────
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()
  const displayName = profile?.full_name || user?.email || ''
  const tier   = profile?.current_tier
  const rating = profile?.current_rating
  const isRated = tier != null && rating != null
  const ratingLine = isRated
    ? t('washer.tier.heading.rated', { stars: tier, average: Number(rating).toFixed(2) })
    : t('washer.tier.heading.unrated')

  // ── Entrance animation (reduced-motion aware) ─────────────────────────────
  const container = {
    hidden: {},
    show:   { transition: { staggerChildren: reduce ? 0 : 0.05 } },
  }
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } } }

  const cardCls = 'bg-glass border border-glass-border backdrop-blur-xl rounded-2xl shadow-glass dark:shadow-glass-dark'

  return (
    <PageShell>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="px-4 pt-6 pb-10 flex flex-col gap-6"
      >
        {/* ── Title ──────────────────────────────────────────────────────── */}
        <motion.div variants={item}>
          <h1 className="text-2xl font-bold text-ink tracking-tight">{t('washer.settings.title')}</h1>
          <p className="text-sm text-ink-muted mt-0.5">{t('washer.settings.subtitle')}</p>
        </motion.div>

        {/* ── Identity header ────────────────────────────────────────────── */}
        <motion.section variants={item} className={`${cardCls} p-4 flex items-center gap-4`}>
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{
              background: 'radial-gradient(circle at 35% 30%, #B9E5CB, #26B55F)',
              border: '2px solid rgba(255,255,255,0.15)',
            }}
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-ink truncate">{displayName}</p>
            <p className="text-xs text-ink-muted mt-0.5 truncate" dir="auto">{ratingLine}</p>
          </div>
        </motion.section>

        {/* ── Preferences group ──────────────────────────────────────────── */}
        <motion.div variants={item} className="flex flex-col gap-2">
          <GroupLabel>{t('washer.settings.groups.preferences')}</GroupLabel>
          <section className={cardCls}>
            <PrefBlock icon={<Moon className="h-[18px] w-[18px]" />} label={t('washer.settings.display.label')}>
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
            </PrefBlock>

            <PrefBlock divider icon={<Navigation className="h-[18px] w-[18px]" />} label={t('washer.settings.navigation.label')}>
              <PillRow
                groupId="nav"
                options={NAV_OPTIONS}
                value={prefs.nav}
                onChange={v => save('nav_app', v)}
              />
            </PrefBlock>

            <PrefBlock
              divider
              icon={<Languages className="h-[18px] w-[18px]" />}
              label={t('settings.language.label')}
              hint={t('settings.language.helper')}
            >
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
            </PrefBlock>
          </section>
        </motion.div>

        {/* ── Alerts & sounds group ──────────────────────────────────────── */}
        <motion.div variants={item} className="flex flex-col gap-2">
          <GroupLabel>{t('washer.settings.groups.alerts')}</GroupLabel>

          {/* Job alert sound (in-app ping) */}
          <Editable id="washer.settings.section">
            <section className={cardCls}>
              <PrefBlock
                icon={<BellRing className="h-[18px] w-[18px]" />}
                label={t('washer.settings.ringtone.label')}
                hint={t('washer.settings.ringtone.hint')}
              >
                <GridPill
                  groupId="ringtone"
                  options={RINGTONE_OPTIONS}
                  value={prefs.ringtone}
                  onChange={v => save('ringtone', v)}
                />
              </PrefBlock>
            </section>
          </Editable>

          {/* Push notifications (OS-level, both roles) */}
          <NotificationsSection />
        </motion.div>

        {/* ── Legal documents ────────────────────────────────────────────── */}
        <motion.div variants={item} className="flex flex-col gap-2">
          <GroupLabel>{t('legal.links.section')}</GroupLabel>
          <section className={`${cardCls} p-1.5`}>
            <LinkRow
              icon={<FileText className="h-[18px] w-[18px]" />}
              label={t('legal.links.washerTerms')}
              onClick={() => navigate('/legal/washer-terms')}
            />
            <LinkRow
              divider
              icon={<Shield className="h-[18px] w-[18px]" />}
              label={t('legal.links.privacy')}
              onClick={() => navigate('/legal/privacy')}
            />
          </section>
        </motion.div>

        {/* ── Danger zone — account deletion ─────────────────────────────── */}
        <motion.section variants={item} className={`${cardCls} p-1.5`}>
          <LinkRow
            icon={<Trash2 className="h-[18px] w-[18px]" />}
            tone="danger"
            danger
            label={t('account.delete.title')}
            onClick={() => setShowDelete(true)}
          />
        </motion.section>
      </motion.div>

      {showDelete && <DeleteAccountModal onClose={() => setShowDelete(false)} />}
    </PageShell>
  )
}
