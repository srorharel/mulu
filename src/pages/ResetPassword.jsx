import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Lock, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext.jsx'
import GlassCard from '../components/ui/GlassCard.jsx'
import AuthWelcome from '../components/ui/AuthWelcome.jsx'
import MotionButton from '../components/ui/MotionButton.jsx'

const schema = z.object({
  password:        z.string().min(8, { message: 'reset.tooShort' }),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'validation.passwordsDoNotMatch',
  path: ['confirmPassword'],
})

// The password-reset email lands here with a recovery token in the URL. The
// Supabase client (detectSessionInUrl) parses it and AuthContext picks up the
// resulting session — so a present `user` means the recovery link was valid.
// This route is intentionally NOT wrapped in AuthRedirect (the recovery session
// would otherwise bounce the user away before they can set a new password).
export default function ResetPassword() {
  const { user, loading, updatePassword } = useAuth()
  const { t } = useTranslation()
  const [showPw, setShowPw]           = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [serverError, setServerError] = useState('')
  const [done, setDone]               = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data) {
    setServerError('')
    const { error } = await updatePassword(data.password)
    if (error) { setServerError(t('reset.error')); return }
    setDone(true)
  }

  if (loading) {
    return (
      <div className="bg-mesh flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  // Valid recovery link establishes a session → `user` is set. No session means
  // the link was missing, already used, or expired.
  if (!user && !done) {
    return (
      <div className="bg-mesh flex flex-col min-h-full px-5 py-10 items-center justify-center overflow-y-auto">
        <GlassCard className="p-8 flex flex-col items-center gap-6 text-center max-w-sm w-full">
          <div className="rounded-full bg-danger-50 p-4">
            <AlertTriangle className="h-9 w-9 text-danger-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">{t('reset.invalidTitle')}</h1>
            <p className="text-neutral-500 text-sm max-w-xs">{t('reset.invalidBody')}</p>
          </div>
          <Link to="/forgot-password" className="btn-primary">{t('reset.requestNew')}</Link>
        </GlassCard>
      </div>
    )
  }

  if (done) {
    return (
      <div className="bg-mesh flex flex-col min-h-full px-5 py-10 items-center justify-center overflow-y-auto">
        <GlassCard className="p-8 flex flex-col items-center gap-6 text-center max-w-sm w-full">
          <div className="rounded-full bg-primary-50 p-4">
            <CheckCircle2 className="h-9 w-9 text-primary-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">{t('reset.doneTitle')}</h1>
            <p className="text-neutral-500 text-sm max-w-xs">{t('reset.doneBody')}</p>
          </div>
          {/* Logged in via the recovery session — '/' routes to the role home. */}
          <Link to="/" className="btn-primary">{t('reset.continue')}</Link>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="bg-mesh flex flex-col min-h-full px-5 py-10 overflow-y-auto">
      <motion.div
        className="flex flex-col gap-6 max-w-sm mx-auto w-full flex-1 justify-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <AuthWelcome title={t('reset.title')} subtitle={t('reset.subtitle')} />

        <GlassCard className="p-6 flex flex-col gap-4">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div>
              <label className="label">{t('reset.newPassword')}</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-300" />
                <input
                  className="input ps-10 pe-10"
                  type={showPw ? 'text' : 'password'}
                  placeholder={t('signup.passwordPlaceholder')}
                  {...register('password')}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="field-error">{t(errors.password.message)}</p>}
            </div>

            <div>
              <label className="label">{t('signup.confirmPassword')}</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-300" />
                <input
                  className="input ps-10 pe-10"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder={t('signup.confirmPasswordPlaceholder')}
                  {...register('confirmPassword')}
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="field-error">{t(errors.confirmPassword.message)}</p>}
            </div>

            {serverError && (
              <p className="text-danger-500 text-sm rounded-lg bg-danger-50 p-3">{serverError}</p>
            )}

            <MotionButton type="submit" disabled={isSubmitting} className="btn-primary mt-1">
              {isSubmitting ? t('reset.saving') : t('reset.submit')}
              {!isSubmitting && <ArrowRight className="h-4 w-4 rtl:rotate-180" />}
            </MotionButton>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  )
}
