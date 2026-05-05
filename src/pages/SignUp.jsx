import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Droplets, Eye, EyeOff, MailCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import GlassCard from '../components/ui/GlassCard.jsx'
import MotionButton from '../components/ui/MotionButton.jsx'

const schema = z.object({
  fullName:        z.string().min(2, 'Name must be at least 2 characters'),
  email:           z.string().email('Enter a valid email'),
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  role:            z.enum(['consumer', 'washer']),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

const pageVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08 } },
}
const itemVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

export default function SignUp() {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const [showPw, setShowPw]           = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [serverError, setServerError] = useState('')
  const [emailSent, setEmailSent]     = useState(false)
  const [sentTo, setSentTo]           = useState('')

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { role: 'consumer' },
  })
  const selectedRole = watch('role')

  async function onSubmit(data) {
    setServerError('')
    const { data: result, error } = await signUp(data.email, data.password, {
      full_name: data.fullName,
      role:      data.role,
    })
    if (error) { setServerError(error.message); return }
    if (result?.session) {
      navigate(data.role === 'washer' ? '/washer' : '/home')
    } else {
      setSentTo(data.email)
      setEmailSent(true)
    }
  }

  if (emailSent) {
    return (
      <div className="bg-mesh flex flex-col min-h-full px-5 py-10 items-center justify-center overflow-y-auto">
        <GlassCard className="p-8 flex flex-col items-center gap-6 text-center max-w-sm w-full">
          <div className="rounded-2xl bg-primary-50 p-6">
            <MailCheck className="h-12 w-12 text-primary-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Check your email</h1>
            <p className="text-neutral-500 text-sm max-w-xs">
              We sent a confirmation link to <strong>{sentTo}</strong>.
              Click it to activate your account, then sign in.
            </p>
          </div>
          <Link to="/login" className="text-primary-600 font-medium text-sm">
            Back to sign in
          </Link>
        </GlassCard>
      </div>
    )
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
              <h1 className="text-2xl font-bold text-neutral-900">Create account</h1>
              <p className="text-neutral-500 text-sm mt-0.5">Join the SparkleGo network</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {/* Role picker with layoutId morphing pill */}
              <div>
                <label className="label">I am a…</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'consumer', label: "I'm a customer" },
                    { value: 'washer',   label: "I'm a washer"   },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setValue('role', opt.value, { shouldValidate: true })}
                      className="relative flex items-center gap-2 rounded-xl border border-neutral-200 p-3 cursor-pointer overflow-hidden text-left"
                      style={{ minHeight: 44 }}
                    >
                      {/* Morphing selection background */}
                      {selectedRole === opt.value && (
                        <motion.div
                          layoutId="role-selector-pill"
                          className="absolute inset-0 bg-primary-50 border-2 border-primary-500 rounded-xl"
                          transition={SPRING}
                        />
                      )}
                      <span className="relative z-10 text-sm font-medium text-neutral-800">
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
                {/* Hidden radio inputs keep react-hook-form registration intact */}
                <div className="sr-only">
                  <input type="radio" value="consumer" {...register('role')} />
                  <input type="radio" value="washer"   {...register('role')} />
                </div>
              </div>

              {/* Full name */}
              <div>
                <label className="label">Full name</label>
                <input className="input" placeholder="Avi Cohen" {...register('fullName')} />
                {errors.fullName && <p className="field-error">{errors.fullName.message}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="you@example.com" {...register('email')} />
                {errors.email && <p className="field-error">{errors.email.message}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPw ? 'text' : 'password'}
                    placeholder="8+ characters"
                    {...register('password')}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="field-error">{errors.password.message}</p>}
              </div>

              {/* Confirm password */}
              <div>
                <label className="label">Confirm password</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repeat your password"
                    {...register('confirmPassword')}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="field-error">{errors.confirmPassword.message}</p>}
              </div>

              {serverError && (
                <p className="text-danger-500 text-sm rounded-lg bg-danger-50 p-3">{serverError}</p>
              )}

              <MotionButton type="submit" disabled={isSubmitting} className="btn-primary mt-1">
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </MotionButton>
            </form>
          </GlassCard>
        </motion.div>

        <motion.p variants={itemVariants} className="text-center text-sm text-neutral-500">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 font-medium">Sign in</Link>
        </motion.p>
      </motion.div>
    </div>
  )
}
