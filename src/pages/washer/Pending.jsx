import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clock, CheckCircle, XCircle, Waves } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'

export default function Pending() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const status         = profile?.washer_verification_status
  const [reason, setReason] = useState(null)

  // Block Android hardware back — pending screen is terminal
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = App.addListener('backButton', () => {})
    return () => { listener.then(l => l.remove()) }
  }, [])

  // Fetch rejection reason from latest verification row
  useEffect(() => {
    if (status !== 'rejected' || !profile?.id) return
    supabase
      .from('washer_verifications')
      .select('rejection_reason')
      .eq('washer_id', profile.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => { if (data?.rejection_reason) setReason(data.rejection_reason) })
  }, [status, profile?.id])

  // Subscribe to profile changes — auto-navigate when approved
  useEffect(() => {
    if (!profile?.id) return
    const ch = supabase
      .channel(`pending-washer-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${profile.id}`,
      }, payload => {
        if (payload.new?.washer_verification_status === 'approved') {
          navigate('/washer', { replace: true })
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [profile?.id, navigate])

  const isRejected = status === 'rejected'

  return (
    <div className="bg-mesh flex flex-col min-h-full px-5 py-10 items-center justify-center">
      <div className="flex flex-col gap-6 max-w-sm w-full">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center">
          <div className="rounded-xl bg-primary-500 p-2">
            <Waves className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-primary-600">Wash</span>
        </div>

        <GlassCard className="p-8 flex flex-col items-center gap-6 text-center">
          {isRejected ? (
            <div className="rounded-2xl bg-danger-50 p-6">
              <XCircle className="h-12 w-12 text-danger-500" />
            </div>
          ) : (
            <div className="rounded-2xl bg-primary-50 p-6">
              <Clock className="h-12 w-12 text-primary-500" />
            </div>
          )}

          <div>
            {isRejected ? (
              <>
                <h1 className="text-2xl font-bold text-neutral-900">
                  {t('washerSignup.pending.rejected.title')}
                </h1>
                {reason && (
                  <p className="text-neutral-600 text-sm mt-2">
                    {t('washerSignup.pending.rejected.reason', { reason })}
                  </p>
                )}
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-neutral-900">
                  {t('washerSignup.pending.title')}
                </h1>
                <p className="text-neutral-500 text-sm mt-2">
                  {t('washerSignup.pending.body')}
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 w-full">
            {isRejected && (
              <MotionButton
                type="button"
                onClick={() => navigate('/signup/washer/verify')}
                className="btn-primary"
              >
                {t('washerSignup.pending.rejected.resubmit')}
              </MotionButton>
            )}
            <button
              type="button"
              onClick={signOut}
              className="text-sm text-neutral-500 hover:text-neutral-700"
            >
              {t('washerSignup.pending.signOut')}
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
