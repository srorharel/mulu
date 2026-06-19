import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowRight, MailCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation, Trans } from 'react-i18next'
import { useAuth } from '../context/AuthContext.jsx'
import GlassCard from '../components/ui/GlassCard.jsx'
import AuthWelcome from '../components/ui/AuthWelcome.jsx'
import MotionButton from '../components/ui/MotionButton.jsx'

const schema = z.object({
  email: z.string().email(),
})

// Sends a password-reset email. We always show the same neutral confirmation,
// regardless of whether the address has an account — this is the anti-enumeration
// path the project chose for email. The actual reset now happens on the marketing
// site's token-hash page (muluwash.com/auth/confirm?type=recovery).
export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const { t } = useTranslation()
  const [sentTo, setSentTo] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data) {
    // Ignore the result: surfacing "no such account" would leak registration
    // status. resetPasswordForEmail only errors on rate-limit / bad format here.
    await resetPassword(data.email).catch(() => {})
    setSentTo(data.email)
  }

  if (sentTo) {
    return (
      <div className="bg-mesh flex flex-col min-h-full px-5 py-10 items-center justify-center overflow-y-auto">
        <GlassCard className="p-8 flex flex-col items-center gap-6 text-center max-w-sm w-full">
          <div className="relative h-24 w-24">
            <div className="absolute -inset-1 rounded-full bg-primary-300/25 blur-2xl" aria-hidden="true" />
            <div className="absolute inset-0 rounded-full border border-primary-300/50" aria-hidden="true" />
            <div className="absolute inset-[18px] rounded-full bg-primary-50 flex items-center justify-center">
              <MailCheck className="h-10 w-10 text-primary-500" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">{t('forgot.sentTitle')}</h1>
            <p className="text-neutral-500 text-sm max-w-xs">
              <Trans
                i18nKey="forgot.sentBody"
                values={{ email: sentTo }}
                components={{ bold: <strong /> }}
              />
            </p>
          </div>
          <Link to="/login" className="text-primary-600 font-semibold text-sm">
            {t('signup.backToSignIn')}
          </Link>
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
        <AuthWelcome title={t('forgot.title')} subtitle={t('forgot.subtitle')} />

        <GlassCard className="p-6 flex flex-col gap-4">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div>
              <label className="label">{t('auth.email')}</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-300" />
                <input className="input ps-10" type="email" placeholder={t('auth.emailPlaceholder')} {...register('email')} />
              </div>
              {errors.email && <p className="field-error">{errors.email.message}</p>}
            </div>

            <MotionButton type="submit" disabled={isSubmitting} className="btn-primary mt-1">
              {isSubmitting ? t('forgot.sending') : t('forgot.submit')}
              {!isSubmitting && <ArrowRight className="h-4 w-4 rtl:rotate-180" />}
            </MotionButton>
          </form>
        </GlassCard>

        <p className="text-center text-sm text-neutral-500">
          <Link to="/login" className="text-primary-600 font-semibold">{t('signup.backToSignIn')}</Link>
        </p>
      </motion.div>
    </div>
  )
}
