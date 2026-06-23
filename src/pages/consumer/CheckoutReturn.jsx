import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { verifyPayment } from '../../lib/payments.js'

// YaadPay (Hyp) hosted page redirects here with the result params after a charge.
// Two cases:
//   • inside the checkout iframe → postMessage the result up to the Checkout page,
//     which re-verifies server-side and advances to tracking.
//   • as a top-level page (some flows redirect the whole window) → finalize here,
//     then route to tracking (success) or back to checkout (failure).
// Trusting nothing: the actual paid_at is set only by verify-payment server-side.
export default function CheckoutReturn() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = Object.fromEntries(new URLSearchParams(window.location.search))
    const inIframe = typeof window !== 'undefined' && window.parent && window.parent !== window
    if (inIframe) {
      window.parent.postMessage({ type: 'yaad-payment-result', params }, window.location.origin)
      return
    }
    const orderId = params.Order
    if (!orderId) { navigate('/home', { replace: true }); return }
    verifyPayment(orderId, params).then((res) => {
      navigate(res.ok ? `/order/${orderId}` : `/checkout/${orderId}`, { replace: true })
    })
  }, [navigate])

  return (
    <div className="min-h-[100dvh] flex items-center justify-center gap-2 text-ink-muted">
      <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
      <span className="text-sm">{t('consumer.checkout.finalizing')}</span>
    </div>
  )
}
