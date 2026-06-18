import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { usePhoneVerification } from '../../hooks/usePhoneVerification.js'
import { useToast } from '../ui/Toast.jsx'
import { modalBtn } from '../ui/Modal.jsx'

// Global phone-verification gate (Feature 1). Mounted once at the router level.
// Renders nothing unless usePhoneVerification().needed — which is false whenever
// the VITE_ENABLE_PHONE_VERIFY flag is off — so this is invisible until enabled.
//
// On first appearance it auto-sends a code to the registered number, then asks
// for the 6 digits. There is no dismiss: like LegalUpdateModal, verification is
// the only exit (the consumer/washer can't proceed unverified).

// Mask all but the last 3 digits: "050-123 4567" → "•••••••4567".
function maskPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 4) return phone || ''
  return '•'.repeat(Math.max(0, digits.length - 3)) + digits.slice(-3)
}

export default function PhoneVerifyModal() {
  const { t, i18n } = useTranslation()
  const showToast = useToast()
  const { needed, phone, sendCode, verifyCode, sending, verifying } = usePhoneVerification()

  const [code, setCode]         = useState('')
  const [cooldown, setCooldown] = useState(0)
  const sentOnce = useRef(false)
  const dir = i18n.language === 'he' ? 'rtl' : 'ltr'

  // Auto-send a first code when the gate appears (once per mount).
  useEffect(() => {
    if (!needed || sentOnce.current) return
    sentOnce.current = true
    doSend()
  }, [needed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  if (!needed) return null

  async function doSend() {
    const res = await sendCode()
    if (res?.error || res?.ok === false) {
      if (res?.error === 'cooldown') setCooldown(res.retry_after_s ?? 60)
      else if (res?.error === 'rate_limited') showToast(t('phoneVerify.errors.rateLimited'), 'error')
      else if (res?.error === 'sms_failed') showToast(t('phoneVerify.errors.smsFailed'), 'error')
      else if (res?.error) showToast(t('phoneVerify.errors.generic'), 'error')
      return
    }
    if (res?.already_verified) return // profile refresh will close the gate
    setCooldown(60)
  }

  async function doVerify() {
    const res = await verifyCode(code)
    if (res?.verified) {
      showToast(t('phoneVerify.success'), 'success')
      return // refreshProfile (in the hook) flips `needed` → gate unmounts
    }
    if (res?.error === 'wrong_code') {
      showToast(t('phoneVerify.errors.wrongCode', { count: res.attempts_left ?? 0 }), 'error')
    } else if (res?.error === 'locked') {
      showToast(t('phoneVerify.errors.locked'), 'error')
    } else if (res?.error === 'expired') {
      showToast(t('phoneVerify.errors.expired'), 'error')
    } else {
      showToast(t('phoneVerify.errors.generic'), 'error')
    }
    setCode('')
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-black/60">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        dir={dir}
        role="dialog"
        aria-modal="true"
        aria-label={t('phoneVerify.title')}
        className="w-full max-w-md bg-white dark:bg-surface-elevated rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-6 pt-6 pb-3 shrink-0 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-accent-muted flex items-center justify-center mb-3">
            <ShieldCheck className="h-6 w-6 text-primary-600 dark:text-accent" />
          </div>
          <p className="text-[18px] font-bold text-ink leading-tight">{t('phoneVerify.title')}</p>
          <p className="text-sm text-ink-muted mt-1">
            {t('phoneVerify.subtitle')} <span dir="ltr" className="font-semibold text-ink">{maskPhone(phone)}</span>
          </p>
        </div>

        <div className="px-6 pb-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            dir="ltr"
            aria-label={t('phoneVerify.codeLabel')}
            className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 rounded-xl border border-edge bg-surface focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>

        <div className="px-6 pb-6 pt-3 shrink-0 flex flex-col gap-2">
          <button
            onClick={doVerify}
            disabled={verifying || code.length !== 6}
            className={modalBtn.primary}
          >
            {verifying ? '…' : t('phoneVerify.verify')}
          </button>
          <button
            onClick={doSend}
            disabled={sending || cooldown > 0}
            className="w-full py-2.5 text-sm font-medium text-primary-700 dark:text-accent disabled:opacity-50"
          >
            {cooldown > 0
              ? t('phoneVerify.resendIn', { seconds: cooldown })
              : sending ? '…' : t('phoneVerify.resend')}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}
