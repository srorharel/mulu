import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, MailCheck, X, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation, Trans } from 'react-i18next'
import { useAuth } from '../context/AuthContext.jsx'
import GlassCard from '../components/ui/GlassCard.jsx'
import WashMark from '../components/ui/WashMark.jsx'
import MotionButton from '../components/ui/MotionButton.jsx'

const CITY_SLUGS = ['holon', 'rishon_lezion', 'bat_yam']

const schema = z.object({
  fullName:        z.string().min(2),
  email:           z.string().email(),
  password:        z.string().min(8),
  confirmPassword: z.string(),
  role:            z.enum(['consumer', 'washer']),
  serviceAreas:    z.array(z.string()).optional(),
  dealerNumber:    z.string().optional(),
  acceptedTerms:   z.boolean(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'validation.passwordsDoNotMatch',
  path: ['confirmPassword'],
}).refine(d => {
  if (d.role !== 'washer') return true
  return (d.serviceAreas ?? []).length > 0
}, {
  message: 'washerSignup.serviceAreas.required',
  path: ['serviceAreas'],
}).refine(d => {
  if (d.role !== 'washer') return true
  return /^\d{7,9}$/.test(d.dealerNumber ?? '')
}, {
  message: 'washerSignup.dealerNumber.error',
  path: ['dealerNumber'],
}).refine(d => d.acceptedTerms === true, {
  message: 'signup.terms.required',
  path: ['acceptedTerms'],
})

const pageVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08 } },
}
const itemVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

// Registration is split per role: /signup/customer renders this with
// role="consumer", /signup/washer with role="washer". The role is fixed by the
// route (chosen in the landing "about us" modal) — there is no in-page toggle.
export default function SignUp({ role = 'consumer' }) {
  const navigate = useNavigate()
  const { signUp } = useAuth()
  const { t } = useTranslation()
  const isWasher = role === 'washer'
  const [showPw, setShowPw]           = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [serverError, setServerError] = useState('')
  const [emailSent, setEmailSent]     = useState(false)
  const [sentTo, setSentTo]           = useState('')

  const [areaSheetOpen, setAreaSheetOpen] = useState(false)

  const savedDraft = (() => {
    try { return JSON.parse(sessionStorage.getItem('washer_signup_draft') ?? 'null') } catch { return null }
  })()

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      role:         role,
      fullName:     savedDraft?.fullName ?? '',
      email:        savedDraft?.email ?? '',
      password:     '',
      confirmPassword: '',
      serviceAreas: savedDraft?.serviceAreas ?? [],
      dealerNumber: savedDraft?.dealerNumber ?? '',
      acceptedTerms: false,
    },
  })
  const selectedRole  = isWasher ? 'washer' : 'consumer'
  const rawAreas      = watch('serviceAreas')
  const serviceAreas  = rawAreas ?? []
  const watchedName   = watch('fullName')
  const watchedEmail  = watch('email')
  const watchedDealer = watch('dealerNumber')

  useEffect(() => {
    sessionStorage.setItem('washer_signup_draft', JSON.stringify({
      role: selectedRole,
      fullName: watchedName,
      email: watchedEmail,
      serviceAreas: rawAreas ?? [],
      dealerNumber: watchedDealer,
    }))
  }, [selectedRole, watchedName, watchedEmail, rawAreas, watchedDealer])

  function toggleArea(slug) {
    const next = serviceAreas.includes(slug)
      ? serviceAreas.filter(s => s !== slug)
      : [...serviceAreas, slug]
    setValue('serviceAreas', next, { shouldValidate: true })
  }

  async function onSubmit(data) {
    setServerError('')
    const { data: result, error } = await signUp(data.email, data.password, {
      full_name: data.fullName,
      role:      role,
      // Consent given here (the form gates submit on it). handle_new_user reads
      // this flag and records the Terms+Privacy acknowledgment at account
      // creation, so the user is NOT re-prompted by LegalUpdateModal right after
      // registering — it reappears only when a doc version is published.
      accepted_legal: data.acceptedTerms === true,
    })
    if (error) { setServerError(error.message); return }

    if (isWasher) {
      sessionStorage.setItem('washer_signup_areas', JSON.stringify(data.serviceAreas ?? []))
      sessionStorage.setItem('washer_signup_dealer', data.dealerNumber ?? '')
    }

    sessionStorage.removeItem('washer_signup_draft')

    if (result?.session) {
      if (isWasher) {
        navigate('/signup/washer/verify', {
          state: { serviceAreas: data.serviceAreas, dealerNumber: data.dealerNumber },
        })
      } else {
        navigate('/home')
      }
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
            <h1 className="text-2xl font-bold mb-2">{t('signup.checkEmail')}</h1>
            <p className="text-neutral-500 text-sm max-w-xs">
              <Trans
                i18nKey="signup.confirmationSent"
                values={{ email: sentTo }}
                components={{ bold: <strong /> }}
              />
            </p>
          </div>
          <Link to="/login" className="text-primary-600 font-medium text-sm">
            {t('signup.backToSignIn')}
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
        <motion.div variants={itemVariants} className="flex items-center">
          <WashMark size={44} />
        </motion.div>

        {/* Glass form card */}
        <motion.div variants={itemVariants}>
          <GlassCard className="p-6 flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">
                {isWasher ? t('signup.washerTitle') : t('signup.customerTitle')}
              </h1>
              <p className="text-neutral-500 text-sm mt-0.5">
                {isWasher ? t('signup.washerSubtitle') : t('signup.customerSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {/* Role is fixed by the route (split registration); kept in form
                  state for the schema refinements + signUp metadata. */}
              <input type="hidden" {...register('role')} />

              {/* Washer-only fields */}
              <AnimatePresence initial={false}>
                {selectedRole === 'washer' && (
                  <motion.div
                    key="washer-fields"
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: 'easeInOut' }}
                    className="overflow-hidden flex flex-col gap-4"
                  >
                    {/* Service areas */}
                    <div>
                      <label className="label">{t('washerSignup.serviceAreas.label')}</label>
                      <button
                        type="button"
                        onClick={() => setAreaSheetOpen(v => !v)}
                        className="input flex items-center justify-between text-start w-full"
                      >
                        <span className={serviceAreas.length === 0 ? 'text-neutral-400' : 'text-neutral-900'}>
                          {serviceAreas.length === 0
                            ? t('washerSignup.serviceAreas.placeholder')
                            : serviceAreas.map(s => t(`washerSignup.serviceAreas.cities.${s}`)).join(', ')}
                        </span>
                        <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0" />
                      </button>

                      <AnimatePresence>
                        {areaSheetOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15 }}
                            className="mt-1 rounded-xl border border-neutral-200 bg-white shadow-md overflow-hidden"
                          >
                            {CITY_SLUGS.map(slug => {
                              const selected = serviceAreas.includes(slug)
                              return (
                                <button
                                  key={slug}
                                  type="button"
                                  onClick={() => toggleArea(slug)}
                                  className={`w-full text-start px-4 py-3 text-sm font-medium flex items-center justify-between border-b last:border-0 border-neutral-100 transition-colors ${selected ? 'bg-primary-50 text-primary-700' : 'hover:bg-neutral-50 text-neutral-800'}`}
                                >
                                  {t(`washerSignup.serviceAreas.cities.${slug}`)}
                                  {selected && (
                                    <span className="h-4 w-4 rounded-full bg-primary-500 flex items-center justify-center">
                                      <span className="block h-2 w-2 rounded-full bg-white" />
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {serviceAreas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {serviceAreas.map(slug => (
                            <span
                              key={slug}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-700"
                            >
                              {t(`washerSignup.serviceAreas.cities.${slug}`)}
                              <button
                                type="button"
                                onClick={() => toggleArea(slug)}
                                className="hover:text-primary-900"
                                aria-label={`Remove ${slug}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {errors.serviceAreas && (
                        <p className="field-error">{t(errors.serviceAreas.message)}</p>
                      )}
                    </div>

                    {/* Dealer / company number */}
                    <div>
                      <label className="label">{t('washerSignup.dealerNumber.label')}</label>
                      <input
                        className="input"
                        inputMode="numeric"
                        placeholder={t('washerSignup.dealerNumber.placeholder')}
                        {...register('dealerNumber')}
                      />
                      {errors.dealerNumber && (
                        <p className="field-error">{t(errors.dealerNumber.message)}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Full name */}
              <div>
                <label className="label">{t('signup.fullName')}</label>
                <input className="input" placeholder={t('signup.fullNamePlaceholder')} {...register('fullName')} />
                {errors.fullName && <p className="field-error">{errors.fullName.message}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="label">{t('auth.email')}</label>
                <input className="input" type="email" placeholder={t('auth.emailPlaceholder')} {...register('email')} />
                {errors.email && <p className="field-error">{errors.email.message}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="label">{t('auth.password')}</label>
                <div className="relative">
                  <input
                    className="input pe-10"
                    type={showPw ? 'text' : 'password'}
                    placeholder={t('signup.passwordPlaceholder')}
                    {...register('password')}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="field-error">{errors.password.message}</p>}
              </div>

              {/* Confirm password */}
              <div>
                <label className="label">{t('signup.confirmPassword')}</label>
                <div className="relative">
                  <input
                    className="input pe-10"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder={t('signup.confirmPasswordPlaceholder')}
                    {...register('confirmPassword')}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="field-error">{errors.confirmPassword.message}</p>}
              </div>

              {/* Terms & privacy consent — required before account creation */}
              <div>
                <div className="flex items-start gap-2.5">
                  <input
                    id="acceptedTerms"
                    type="checkbox"
                    {...register('acceptedTerms')}
                    aria-label={t('signup.terms.aria')}
                    className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-neutral-300 cursor-pointer accent-primary-600"
                  />
                  <span className="text-[13px] leading-snug text-neutral-600">
                    {/* Terms of Use + Privacy Policy apply to BOTH roles (a washer is
                        also a platform user). The washer contract (חוזה לשוטף) is
                        separate and acknowledged post-approval — see migration 0118 +
                        LegalUpdateModal — so it is NOT linked here. */}
                    <Trans
                      i18nKey="signup.terms.label"
                      components={{
                        terms:   <Link to="/legal/terms" className="text-primary-600 font-medium underline" />,
                        privacy: <Link to="/legal/privacy" className="text-primary-600 font-medium underline" />,
                      }}
                    />
                  </span>
                </div>
                {errors.acceptedTerms && (
                  <p className="field-error mt-1">{t(errors.acceptedTerms.message)}</p>
                )}
              </div>

              {serverError && (
                <p className="text-danger-500 text-sm rounded-lg bg-danger-50 p-3">{serverError}</p>
              )}

              <MotionButton type="submit" disabled={isSubmitting} className="btn-primary mt-1">
                {isSubmitting ? t('signup.creatingAccount') : t('signup.title')}
              </MotionButton>
            </form>
          </GlassCard>
        </motion.div>

        {/* Cross-link to the other registration flow */}
        <motion.p variants={itemVariants} className="text-center text-sm text-neutral-500">
          {isWasher ? t('signup.switch.toCustomerPrompt') : t('signup.switch.toWasherPrompt')}{' '}
          <Link
            to={isWasher ? '/signup/customer' : '/signup/washer'}
            className="text-primary-600 font-medium"
          >
            {isWasher ? t('signup.switch.toCustomerLink') : t('signup.switch.toWasherLink')}
          </Link>
        </motion.p>

        <motion.p variants={itemVariants} className="text-center text-sm text-neutral-500">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login" className="text-primary-600 font-medium">{t('auth.signIn')}</Link>
        </motion.p>
      </motion.div>
    </div>
  )
}
