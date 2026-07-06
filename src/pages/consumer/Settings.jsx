import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Car, CreditCard, Trash2, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FEATURES } from '../../lib/featureFlags.js'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import NotificationsSection from '../../components/settings/NotificationsSection.jsx'
import PillRow from '../../components/settings/PillRow.jsx'
import { useLocale } from '../../hooks/useLocale.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import Editable from '../../components/editable/Editable.jsx'
import DeleteAccountModal from '../../components/account/DeleteAccountModal.jsx'

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'he', label: 'עברית'   },
]

// Rounded, tinted leading icon — accent for normal rows, danger for destructive.
function IconTile({ children, tone = 'accent' }) {
  const tones = {
    accent: 'bg-primary-100 text-primary-700',
    danger: 'bg-danger-50 text-danger-500',
  }
  return (
    <div className={`w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0 ${tones[tone]}`}>
      {children}
    </div>
  )
}

// Section heading on the page background, above a grouped card.
function GroupLabel({ children }) {
  return (
    <p className="px-1.5 text-[11px] font-bold uppercase tracking-[0.6px] text-ink-muted">
      {children}
    </p>
  )
}

// Tappable navigation/action row inside a grouped card.
function LinkRow({ icon, tone = 'accent', label, danger, onClick, divider }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 min-h-[56px] text-start rounded-[14px]
        transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
        ${danger ? 'hover:bg-danger-50/60 active:bg-danger-50' : 'hover:bg-surface/60 active:bg-surface'}
        ${divider ? 'border-t border-glass-border' : ''}`}
    >
      <IconTile tone={tone}>{icon}</IconTile>
      <span className={`flex-1 text-sm font-semibold ${danger ? 'text-danger-500' : 'text-ink'}`}>
        {label}
      </span>
      <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
    </button>
  )
}

export default function ConsumerSettings() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const { profile, user } = useAuth()
  const showToast = useToast()
  const reduce = useReducedMotion()
  const [showDelete, setShowDelete] = useState(false)

  // ── Account hero ────────────────────────────────────────────────────────
  const name = profile?.full_name?.trim()
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()
  const primaryLine = name || user?.email || ''
  const secondaryLine = name ? user?.email : null

  // ── Entrance animation (reduced-motion aware) ─────────────────────────────
  const container = {
    hidden: {},
    show:   { transition: { staggerChildren: reduce ? 0 : 0.05 } },
  }
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } } }

  return (
    <PageShell>
      <div className="bg-mesh min-h-full flex flex-col">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-1 flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate(-1)}
            aria-label={t('common.back')}
            className="w-10 h-10 rounded-[14px] bg-glass backdrop-blur-xl border border-glass-border flex items-center justify-center text-ink shadow-sm shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold text-ink tracking-[-0.5px] leading-tight">
              {t('consumer.settings.title')}
            </h1>
            <p className="text-sm text-ink-muted leading-tight">{t('consumer.settings.subtitle')}</p>
          </div>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex-1 px-4 pb-8 flex flex-col gap-5 pt-3"
        >
          {/* ── Account hero row → profile ───────────────────────────────── */}
          <motion.div variants={item}>
            <GlassCard
              as="button"
              onClick={() => navigate('/profile')}
              className="w-full p-3.5 flex items-center gap-3.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                style={{
                  background: 'radial-gradient(circle at 35% 30%, #B9E5CB, #26B55F)',
                  border: '2px solid rgba(255,255,255,0.6)',
                }}
                aria-hidden="true"
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-ink truncate">{primaryLine}</p>
                {secondaryLine && (
                  <p className="text-xs text-ink-muted mt-0.5 truncate" dir="ltr">{secondaryLine}</p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
            </GlassCard>
          </motion.div>

          {/* ── Preferences group ────────────────────────────────────────── */}
          <motion.div variants={item} className="flex flex-col gap-2">
            <GroupLabel>{t('consumer.settings.groups.preferences')}</GroupLabel>

            <NotificationsSection />

            {/* No AppearanceSection here: consumer routes are always light
                (ADR-044) — dark mode is a washer-only opt-in. */}

            <Editable id="consumer.settings.section">
              <section className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <IconTile><Languages className="h-[18px] w-[18px]" /></IconTile>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">{t('settings.language.label')}</p>
                    <p className="text-xs text-ink-muted mt-0.5">{t('settings.language.helper')}</p>
                  </div>
                </div>
                <PillRow
                  groupId="consumer-language"
                  options={LANGUAGE_OPTIONS}
                  value={locale}
                  onChange={async (lang) => {
                    const { error } = await setLocale(lang)
                    if (error) showToast(error.message, 'error')
                    else showToast(t('toasts.languageChanged'))
                  }}
                />
              </section>
            </Editable>
          </motion.div>

          {/* ── Account group ────────────────────────────────────────────── */}
          <motion.div variants={item} className="flex flex-col gap-2">
            <GroupLabel>{t('consumer.settings.groups.account')}</GroupLabel>
            <GlassCard className="p-1.5">
              <LinkRow
                icon={<Car className="h-[18px] w-[18px]" />}
                label={t('profile.vehicles')}
                onClick={() => navigate('/profile/vehicles')}
              />
              {FEATURES.payments && (
                <LinkRow
                  divider
                  icon={<CreditCard className="h-[18px] w-[18px]" />}
                  label={t('consumer.payment.title')}
                  onClick={() => navigate('/profile/payment-methods')}
                />
              )}
            </GlassCard>
          </motion.div>

          {/* ── Danger zone — account deletion ───────────────────────────── */}
          <motion.div variants={item}>
            <GlassCard className="p-1.5">
              <LinkRow
                icon={<Trash2 className="h-[18px] w-[18px]" />}
                tone="danger"
                danger
                label={t('account.delete.title')}
                onClick={() => setShowDelete(true)}
              />
            </GlassCard>
          </motion.div>
        </motion.div>

        {showDelete && <DeleteAccountModal onClose={() => setShowDelete(false)} />}
      </div>
    </PageShell>
  )
}
