import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Droplets, Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext.jsx'
import GlassCard from '../components/ui/GlassCard.jsx'
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

export default function Login() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const { t } = useTranslation()
  const [showPw, setShowPw]           = useState(false)
  const [serverError, setServerError] = useState('')

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
    const { data: result, error } = await signIn(data.email, data.password)
    if (error) { setServerError(friendlyError(error.message)); return }
    const role = result.user?.user_metadata?.role ?? 'consumer'
    navigate(role === 'washer' ? '/washer' : '/home', { replace: true })
  }

  return (
    <div className="bg-mesh flex flex-col min-h-full px-5 py-10 overflow-y-auto">
      <motion.div
        className="flex flex-col gap-6 max-w-sm mx-auto w-full flex-1"
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Logo */}
        <motion.div variants={itemVariants} className="flex items-center gap-2">
          <div className="rounded-xl bg-primary-500 p-2">
            <Droplets className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-primary-600">SparkleGo</span>
        </motion.div>

        {/* Glass form card */}
        <motion.div variants={itemVariants}>
          <GlassCard className="p-6 flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">{t('auth.welcomeBack')}</h1>
              <p className="text-neutral-500 text-sm mt-0.5">{t('auth.signInToAccount')}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <div>
                <label className="label">{t('auth.email')}</label>
                <input className="input" type="email" placeholder={t('auth.emailPlaceholder')} {...register('email')} />
                {errors.email && <p className="field-error">{errors.email.message}</p>}
              </div>

              <div>
                <label className="label">{t('auth.password')}</label>
                <div className="relative">
                  <input
                    className="input pe-10"
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
              </div>

              {serverError && (
                <p className="text-danger-500 text-sm rounded-lg bg-danger-50 p-3">{serverError}</p>
              )}

              <MotionButton type="submit" disabled={isSubmitting} className="btn-primary mt-1">
                {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
              </MotionButton>
            </form>

            <p className="text-center text-sm text-neutral-400">
              {t('auth.forgotPassword')}{' '}
              <span className="cursor-default">{t('auth.forgotPasswordSoon')}</span>
            </p>
          </GlassCard>
        </motion.div>

        <motion.p variants={itemVariants} className="text-center text-sm text-neutral-500">
          {t('auth.newToSparkleGo')}{' '}
          <Link to="/signup" className="text-primary-600 font-medium">{t('auth.createAccount')}</Link>
        </motion.p>
      </motion.div>
    </div>
  )
}
