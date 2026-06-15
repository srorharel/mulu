import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogOut, User, MessageCircle, Settings, FileText, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import PageShell from '../components/ui/PageShell.jsx'
import { useTheme } from '../hooks/useTheme.js'
import Badge from '../components/ui/Badge.jsx'
import { toTitleCase } from '../lib/format.js'

const schema = z.object({
  full_name:       z.string().min(2),
  phone:           z.union([
    z.literal(''),
    z.string().refine(v => v.replace(/\D/g, '').length >= 9, { message: 'validation.invalidPhone' }),
  ]),
  equipment_notes: z.string().optional(),
})

export default function Profile() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { isDark } = useTheme()
  const showToast = useToast()
  const { t } = useTranslation()
  const navigate = useNavigate()

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

  return (
    <div className={`${isDark ? 'dark ' : ''}h-full bg-surface`}>
      <PageShell>
        <div className="px-5 pt-10 pb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="rounded-full bg-primary-100 dark:bg-accent-muted p-3">
              <User className="h-6 w-6 text-primary-600 dark:text-accent" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate dark:text-ink">{toTitleCase(profile?.full_name) || t('profile.title')}</h1>
              <Badge variant="default" className="uppercase tracking-wide text-primary-600 dark:text-accent bg-primary-50 dark:bg-accent-muted">
                {profile?.role}
              </Badge>
            </div>
          </div>

          <div className="mb-4">
            <p className="label">{t('profile.email')}</p>
            <p className="input bg-neutral-50 dark:bg-surface text-neutral-500 dark:text-ink-muted flex items-center truncate">{user?.email}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div>
              <label className="label">{t('profile.fullName')}</label>
              <input className="input" {...register('full_name')} />
              {errors.full_name && <p className="field-error">{errors.full_name.message}</p>}
            </div>

            <div>
              <label className="label">{t('profile.phone')}</label>
              <input className="input" type="tel" placeholder={t('profile.phonePlaceholder')} {...register('phone')} />
              {errors.phone && <p className="field-error">{errors.phone.message}</p>}
            </div>

            {profile?.role === 'washer' && (
              <div>
                <label className="label">{t('profile.equipmentNotes')}</label>
                <textarea
                  className="input min-h-[80px] resize-none"
                  placeholder={t('profile.equipmentNotesPlaceholder')}
                  {...register('equipment_notes')}
                />
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? t('profile.saving') : t('profile.saveChanges')}
            </button>
          </form>

          {profile?.role === 'consumer' && (
            <>
              <button
                onClick={() => navigate('/profile/settings')}
                className="btn-ghost w-full mt-4"
              >
                <Settings className="h-4 w-4" />
                {t('profile.settings')}
              </button>
              <button
                onClick={() => navigate('/support')}
                className="btn-ghost w-full mt-2"
              >
                <MessageCircle className="h-4 w-4" />
                {t('support.title')}
              </button>
            </>
          )}

          {/* Legal documents — available to every role */}
          <button onClick={() => navigate('/legal/terms')} className="btn-ghost w-full mt-2">
            <FileText className="h-4 w-4" />
            {t('legal.links.terms')}
          </button>
          {profile?.role === 'washer' && (
            <button onClick={() => navigate('/legal/washer-terms')} className="btn-ghost w-full mt-2">
              <FileText className="h-4 w-4" />
              {t('legal.links.washerTerms')}
            </button>
          )}
          <button onClick={() => navigate('/legal/privacy')} className="btn-ghost w-full mt-2">
            <Shield className="h-4 w-4" />
            {t('legal.links.privacy')}
          </button>

          <button onClick={signOut} className="btn-ghost w-full mt-2 text-danger-500 hover:bg-danger-50">
            <LogOut className="h-4 w-4" />
            {t('profile.signOut')}
          </button>
        </div>

      </PageShell>
    </div>
  )
}
