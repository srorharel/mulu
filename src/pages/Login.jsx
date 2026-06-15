import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Mail, Lock, ArrowRight, ShieldCheck, Zap, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import { homeForRole } from '../lib/roleHome.js'
import GlassCard from '../components/ui/GlassCard.jsx'
import AuthWelcome from '../components/ui/AuthWelcome.jsx'
import MotionButton from '../components/ui/MotionButton.jsx'

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

const pageVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08 } },
}
const itemVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

const TRUST = [
  { icon: ShieldCheck, key: 'secure' },
  { icon: Zap,         key: 'fast' },
  { icon: MapPin,      key: 'toYourCar' },
]

export default function Login() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const { t } = useTranslation()
  const [showPw, setShowPw]           = useState(false)
  const [serverError, setServerError] = useState('')
  const [showReset, setShowReset]     = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  function friendlyError(msg) {
    const m = msg.toLowerCase()
    if (m.includes('invalid login credentials') || m.includes('invalid email or password')) {
      return t('auth.errors.invalidCredentials')
    }
    if (m.includes('email not confirmed')) {
      return t('auth.errors.emailNotConfirmed')
    }
    if (m.includes('network') || m.includes('fetch')) {
      return t('auth.errors.networkError')
    }
    return msg
  }

  async function onSubmit(data) {
    setServerError('')
    setShowReset(false)
    const { data: result, error } = await signIn(data.email, data.password)
    if (error) {
      const m = error.message.toLowerCase()
      // Supabase returns one generic error for both a wrong password and an
      // unknown email (anti-enumeration) — so we keep the message generic but
      // always offer a reset path, which is what a wrong-password user needs.
      const isCredentialError =
        m.includes('invalid login credentials') || m.includes('invalid email or password')
      setServerError(friendlyError(error.message))
      setShowReset(isCredentialError)
      return
    }
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', result.user.id).single()
    const role = prof?.role ?? result.user?.user_metadata?.role ?? 'consumer'
    navigate(homeForRole(role), { replace: true })
  }

  return (
    <div className="bg-mesh flex flex-col min-h-full px-5 py-10 overflow-y-auto">
      <motion.div
        className="flex flex-col gap-6 max-w-sm mx-auto w-full flex-1 justify-center"
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Spotlight welcome header */}
        <motion.div variants={itemVariants}>
          <AuthWelcome title={t('auth.welcomeBack')} subtitle={t('auth.welcomeBackSub')} />
        </motion.div>

        {/* Glass form card */}
        <motion.div variants={itemVariants}>
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

              <div>
                <label className="label">{t('auth.password')}</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-300" />
                  <input
                    className="input ps-10 pe-10"
                    type={showPw ? 'text' : 'password'}
                    placeholder={t('auth.passwordPlaceholder')}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="field-error">{errors.password.message}</p>}
                <p className="text-end mt-1.5">
                  <Link to="/forgot-password" className="text-xs text-primary-600 font-medium">
                    {t('auth.forgotPassword')}
                  </Link>
                </p>
              </div>

              {serverError && (
                <div className="text-danger-500 text-sm rounded-lg bg-danger-50 p-3">
                  <p>{serverError}</p>
                  {showReset && (
                    <Link to="/forgot-password" className="mt-1.5 inline-block font-medium underline">
                      {t('auth.resetPasswordCta')}
                    </Link>
                  )}
                </div>
              )}

              <MotionButton type="submit" disabled={isSubmitting} className="btn-primary mt-1">
                {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
                {!isSubmitting && <ArrowRight className="h-4 w-4 rtl:rotate-180" />}
              </MotionButton>
            </form>

            {/* Trust strip */}
            <div className="flex items-center justify-center gap-5 pt-1 text-[11px] text-neutral-500">
              {TRUST.map(({ icon: Icon, key }) => (
                <span key={key} className="inline-flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5 text-primary-500" />
                  {t(`auth.trust.${key}`)}
                </span>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        <motion.p variants={itemVariants} className="text-center text-sm text-neutral-500">
          {t('auth.newToWash')}{' '}
          <Link to="/signup/customer" className="text-primary-600 font-semibold">{t('auth.createAccount')}</Link>
        </motion.p>
      </motion.div>
    </div>
  )
}
