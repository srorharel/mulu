import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, useReducedMotion } from 'framer-motion'
import {
  LogOut, User, MessageCircle, Settings, FileText, Car, ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import PageShell from '../components/ui/PageShell.jsx'
import GlassCard from '../components/ui/GlassCard.jsx'
import LegalDocsSheet from '../components/legal/LegalDocsSheet.jsx'
import { useTheme } from '../hooks/useTheme.js'
import { toTitleCase } from '../lib/format.js'

const schema = z.object({
  full_name:       z.string().min(2),
  phone:           z.union([
    z.literal(''),
    z.string().refine(v => v.replace(/\D/g, '').length >= 9, { message: 'validation.invalidPhone' }),
  ]),
  equipment_notes: z.string().optional(),
})

// Rounded, tinted leading icon — accent for normal rows, danger for destructive.
// Dark-aware: this page is shared by consumers (light) and washers (dark).
function IconTile({ children, tone = 'accent' }) {
  const tones = {
    accent: 'bg-primary-100 text-primary-700 dark:bg-accent-muted dark:text-accent',
    danger: 'bg-danger-50 text-danger-500 dark:bg-danger-500/15 dark:text-danger-400',
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
        ${danger
          ? 'hover:bg-danger-50/60 active:bg-danger-50 dark:hover:bg-danger-500/10 dark:active:bg-danger-500/15'
          : 'hover:bg-black/[0.03] active:bg-black/[0.05] dark:hover:bg-white/[0.06] dark:active:bg-white/10'}
        ${divider ? 'border-t border-glass-border' : ''}`}
    >
      <IconTile tone={tone}>{icon}</IconTile>
      <span className={`flex-1 text-sm font-semibold ${danger ? 'text-danger-500 dark:text-danger-400' : 'text-ink'}`}>
        {label}
      </span>
      <ChevronRight className="h-4 w-4 text-ink-muted rtl:rotate-180 shrink-0" />
    </button>
  )
}

export default function Profile() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { isDark } = useTheme()
  const showToast = useToast()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [showLegal, setShowLegal] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name:       profile?.full_name       ?? '',
      phone:           profile?.phone           ?? '',
      equipment_notes: profile?.equipment_notes ?? '',
    },
  })

  async function onSubmit(data) {
    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', user.id)

    if (error) {
      // The phone unique index (migration 0124) also guards Profile edits — show
      // the friendly "phone in use" message instead of the raw 23505 violation.
      const dupPhone = error.code === '23505' || /profiles_phone_digits_uidx|duplicate key/i.test(error.message || '')
      showToast(dupPhone ? t('signup.errors.phoneInUse') : error.message, 'error')
      return
    }
    await refreshProfile()
    showToast(t('profile.updated'), 'success')
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  const role = profile?.role
  const name = toTitleCase(profile?.full_name)
  const initials = profile?.full_name?.trim()
    ? profile.full_name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()
  const isConsumer = role === 'consumer'
  const isWasher   = role === 'washer'

  // ── Entrance animation (reduced-motion aware) — mirrors consumer Settings ────
  const container = {
    hidden: {},
    show:   { transition: { staggerChildren: reduce ? 0 : 0.05 } },
  }
  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } } }

  return (
    <div className={`${isDark ? 'dark ' : ''}h-full`}>
      <PageShell>
        <div className={`${isDark ? 'bg-mesh-dark' : 'bg-mesh'} min-h-full flex flex-col`}>
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="px-5 pt-8 pb-1 shrink-0">
            <h1 className="text-[22px] font-extrabold text-ink tracking-[-0.5px] leading-tight">
              {t('profile.title')}
            </h1>
            <p className="text-sm text-ink-muted leading-tight mt-0.5">{t('profile.subtitle')}</p>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex-1 px-4 pb-8 flex flex-col gap-5 pt-3"
          >
            {/* ── Identity hero ──────────────────────────────────────────── */}
            <motion.div variants={item}>
              <GlassCard className="p-4 flex items-center gap-3.5">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                  style={{
                    background: 'radial-gradient(circle at 35% 30%, #B9E5CB, #26B55F)',
                    border: '2px solid rgba(255,255,255,0.6)',
                  }}
                  aria-hidden="true"
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-ink truncate">
                    {name || user?.email}
                  </p>
                  {name && (
                    <p className="text-xs text-ink-muted mt-0.5 truncate" dir="ltr">{user?.email}</p>
                  )}
                  {role && (
                    <span className="inline-flex items-center mt-2 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.5px]
                      bg-primary-50 text-primary-700 dark:bg-accent-muted dark:text-accent">
                      {t(`profile.roles.${role}`, { defaultValue: toTitleCase(role) })}
                    </span>
                  )}
                </div>
              </GlassCard>
            </motion.div>

            {/* ── Personal details (editable) ────────────────────────────── */}
            <motion.div variants={item}>
              <GlassCard className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <IconTile><User className="h-[18px] w-[18px]" /></IconTile>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{t('profile.detailsTitle')}</p>
                    <p className="text-xs text-ink-muted mt-0.5">{t('profile.detailsHelper')}</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                  <div>
                    <label className="label" htmlFor="full_name">{t('profile.fullName')}</label>
                    <input id="full_name" className="input" autoComplete="name" {...register('full_name')} />
                    {errors.full_name && <p className="field-error">{t('validation.tooShort', { count: 2, defaultValue: errors.full_name.message })}</p>}
                  </div>

                  <div>
                    <label className="label" htmlFor="phone">{t('profile.phone')}</label>
                    <input
                      id="phone"
                      className="input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder={t('profile.phonePlaceholder')}
                      {...register('phone')}
                    />
                    {errors.phone && <p className="field-error">{t(errors.phone.message, { defaultValue: errors.phone.message })}</p>}
                  </div>

                  {isWasher && (
                    <div>
                      <label className="label" htmlFor="equipment_notes">{t('profile.equipmentNotes')}</label>
                      <textarea
                        id="equipment_notes"
                        className="input min-h-[80px] resize-none"
                        placeholder={t('profile.equipmentNotesPlaceholder')}
                        {...register('equipment_notes')}
                      />
                    </div>
                  )}

                  <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                    {isSubmitting ? t('profile.saving') : t('profile.saveChanges')}
                  </button>
                </form>
              </GlassCard>
            </motion.div>

            {/* ── Account shortcuts (consumer only) ──────────────────────── */}
            {isConsumer && (
              <motion.div variants={item} className="flex flex-col gap-2">
                <GroupLabel>{t('profile.groups.account')}</GroupLabel>
                <GlassCard className="p-1.5">
                  <LinkRow
                    icon={<Car className="h-[18px] w-[18px]" />}
                    label={t('profile.vehicles')}
                    onClick={() => navigate('/profile/vehicles')}
                  />
                  <LinkRow
                    divider
                    icon={<Settings className="h-[18px] w-[18px]" />}
                    label={t('profile.settings')}
                    onClick={() => navigate('/profile/settings')}
                  />
                  <LinkRow
                    divider
                    icon={<MessageCircle className="h-[18px] w-[18px]" />}
                    label={t('support.title')}
                    onClick={() => navigate('/support')}
                  />
                </GlassCard>
              </motion.div>
            )}

            {/* ── Legal documents — opens a picker sheet (every role) ─────── */}
            <motion.div variants={item}>
              <GlassCard className="p-1.5">
                <LinkRow
                  icon={<FileText className="h-[18px] w-[18px]" />}
                  label={t('legal.links.section')}
                  onClick={() => setShowLegal(true)}
                />
              </GlassCard>
            </motion.div>

            {/* ── Sign out (separated) ───────────────────────────────────── */}
            <motion.div variants={item}>
              <GlassCard className="p-1.5">
                <LinkRow
                  icon={<LogOut className="h-[18px] w-[18px]" />}
                  tone="danger"
                  danger
                  label={t('profile.signOut')}
                  onClick={signOut}
                />
              </GlassCard>
            </motion.div>
          </motion.div>

          <LegalDocsSheet open={showLegal} onClose={() => setShowLegal(false)} />
        </div>
      </PageShell>
    </div>
  )
}
