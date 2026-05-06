import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, XCircle, Loader2, Key, Video, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useRealtimeOrder } from '../../hooks/useRealtimeOrder.js'
import { useToast } from '../../components/ui/Toast.jsx'
import StatusTimeline from '../../components/StatusTimeline.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import i18n from '../../i18n/index.js'

// Translation key maps — evaluated at call time so language switches take effect.
const TRANSITION_KEYS = {
  accepted:    { next: 'en_route',    key: 'washer.activeJob.transitions.startHeading' },
  en_route:    { next: 'arrived',     key: 'washer.activeJob.transitions.arrived' },
  arrived:     { next: 'in_progress', key: 'washer.activeJob.transitions.startWashing' },
  in_progress: { next: 'completed',   key: 'washer.activeJob.transitions.markCompleted' },
}

const ADVANCE_TOAST_KEYS = {
  en_route:    'washer.activeJob.toasts.enRoute',
  arrived:     'washer.activeJob.toasts.arrived',
  in_progress: 'washer.activeJob.toasts.inProgress',
}

function checkVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve(video.duration > 30 ? i18n.t('washer.activeJob.videoTooLong') : null)
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      resolve(i18n.t('washer.activeJob.videoReadError'))
    }
    video.src = URL.createObjectURL(file)
  })
}

function EvidenceCard({ label, path, uploading, error, onRecord }) {
  const { t } = useTranslation()
  const inputRef = useRef(null)

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        {path
          ? <span className="flex items-center gap-1 text-success-600 text-xs font-medium">
              <CheckCircle className="h-4 w-4" /> {t('washer.activeJob.uploaded')}
            </span>
          : <span className="text-xs text-danger-500 font-medium">{t('washer.activeJob.required')}</span>
        }
      </div>

      {error && <p className="text-danger-500 text-xs -mt-1">{error}</p>}

      {uploading && (
        <div className="h-1.5 bg-neutral-100 dark:bg-edge rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 rounded-full w-3/5 animate-pulse" />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={e => { if (e.target.files[0]) onRecord(e.target.files[0]) }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`w-full ${path ? 'btn-ghost text-sm' : 'btn-outline text-sm'}`}
      >
        <Video className="h-4 w-4" />
        {uploading ? t('washer.activeJob.uploading') : path ? t('washer.activeJob.replaceVideo') : t('washer.activeJob.recordVideo')}
      </button>
    </div>
  )
}

export default function ActiveJob() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { order, loading } = useRealtimeOrder(id)
  const showToast = useToast()
  const { t } = useTranslation()
  const [advancing, setAdvancing]     = useState(false)
  const [cancelling, setCancelling]   = useState(false)
  const advancingRef                  = useRef(false)
  const cancellingRef                 = useRef(false)
  const [uploading, setUploading]     = useState({})
  const [uploadErrors, setUploadErrors] = useState({})

  const FILE_NAMES = { wash: 'wash.mp4', wiper_fluid: 'wiper_fluid.mp4', tire_pressure: 'tire_pressure.mp4' }
  const COLUMNS    = { wash: 'evidence_wash_path', wiper_fluid: 'evidence_wiper_fluid_path', tire_pressure: 'evidence_tire_pressure_path' }

  async function uploadEvidence(type, file) {
    if (file.size > 50 * 1024 * 1024) {
      setUploadErrors(e => ({ ...e, [type]: t('washer.activeJob.videoTooLarge') }))
      return
    }
    const durationError = await checkVideoDuration(file)
    if (durationError) {
      setUploadErrors(e => ({ ...e, [type]: durationError }))
      return
    }

    setUploading(u => ({ ...u, [type]: true }))
    setUploadErrors(e => ({ ...e, [type]: '' }))

    const path = `${id}/${FILE_NAMES[type]}`
    const { error: uploadError } = await supabase.storage
      .from('job-evidence')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setUploadErrors(e => ({ ...e, [type]: uploadError.message }))
      setUploading(u => ({ ...u, [type]: false }))
      return
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ [COLUMNS[type]]: path })
      .eq('id', id)

    if (updateError) setUploadErrors(e => ({ ...e, [type]: updateError.message }))
    setUploading(u => ({ ...u, [type]: false }))
  }

  async function advanceStatus() {
    if (advancingRef.current) return
    const trans = order ? TRANSITION_KEYS[order.status] : null
    if (!trans) return
    advancingRef.current = true
    setAdvancing(true)
    const { error } = await supabase.rpc('transition_order_status', { order_id: id, new_status: trans.next })
    advancingRef.current = false
    setAdvancing(false)
    if (error) {
      if (error.message?.match(/Invalid transition: (\S+) → \1/)) return
      showToast(error.message, 'error')
      return
    }
    if (trans.next === 'completed') {
      navigate('/washer')
    } else {
      const toastKey = ADVANCE_TOAST_KEYS[trans.next]
      showToast(toastKey ? t(toastKey) : t('washer.activeJob.statusUpdated'), 'success')
    }
  }

  async function cancelJob() {
    if (cancellingRef.current) return
    cancellingRef.current = true
    setCancelling(true)
    const { error } = await supabase.rpc('transition_order_status', { order_id: id, new_status: 'cancelled' })
    cancellingRef.current = false
    setCancelling(false)
    if (error) { showToast(error.message, 'error'); return }
    navigate('/washer')
  }

  if (loading) return (
    <PageShell noNav>
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    </PageShell>
  )

  const trans = order ? TRANSITION_KEYS[order.status] : null
  const isCompleting = trans?.next === 'completed'

  const canComplete = order && (
    order.evidence_wash_path != null &&
    (!order.addon_wiper_fluid   || order.evidence_wiper_fluid_path  != null) &&
    (!order.addon_tire_pressure || order.evidence_tire_pressure_path != null)
  )

  const missingEvidence = order ? [
    !order.evidence_wash_path                                             && 'wash video',
    order.addon_wiper_fluid   && !order.evidence_wiper_fluid_path         && 'wiper fluid video',
    order.addon_tire_pressure && !order.evidence_tire_pressure_path       && 'tire pressure video',
  ].filter(Boolean) : []

  return (
    <PageShell noNav>
      <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
        <button onClick={() => navigate('/washer')} className="flex items-center gap-2 text-ink-muted text-sm -ms-1">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('washer.activeJob.back')}
        </button>

        <div>
          <h1 className="text-xl font-bold">{t('washer.activeJob.title')}</h1>
          <p className="text-xs text-ink-muted mt-0.5">#{id?.slice(0, 8)}</p>
        </div>

        {/* Access instructions */}
        {order && (
          order.key_location
            ? (
              <div className="card bg-primary-50 dark:bg-accent-muted border border-primary-200 dark:border-accent/20">
                <div className="flex items-center gap-2 mb-1">
                  <Key className="h-4 w-4 text-primary-500 dark:text-accent" />
                  <p className="text-sm font-semibold text-primary-700 dark:text-accent">{t('washer.activeJob.accessInstructions')}</p>
                </div>
                <p className="text-sm text-primary-800 dark:text-ink">{order.key_location}</p>
              </div>
            )
            : (
              <div className="card dark:bg-surface-elevated">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-neutral-300 dark:text-edge" />
                  <p className="text-sm text-neutral-400 dark:text-ink-muted">{t('washer.activeJob.noAccessNotes')}</p>
                </div>
              </div>
            )
        )}

        {/* Status timeline */}
        {order && (
          <div className="card">
            <StatusTimeline status={order.status} />
          </div>
        )}

        {/* Evidence section — only shown when in_progress */}
        {order?.status === 'in_progress' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-ink">{t('washer.activeJob.uploadEvidence')}</p>

            <EvidenceCard
              label={t('washer.activeJob.washVideo')}
              path={order.evidence_wash_path}
              uploading={!!uploading.wash}
              error={uploadErrors.wash}
              onRecord={file => uploadEvidence('wash', file)}
            />

            {order.addon_wiper_fluid && (
              <EvidenceCard
                label={t('washer.activeJob.wiperFluidEvidence')}
                path={order.evidence_wiper_fluid_path}
                uploading={!!uploading.wiper_fluid}
                error={uploadErrors.wiper_fluid}
                onRecord={file => uploadEvidence('wiper_fluid', file)}
              />
            )}

            {order.addon_tire_pressure && (
              <EvidenceCard
                label={t('washer.activeJob.tirePressureEvidence')}
                path={order.evidence_tire_pressure_path}
                uploading={!!uploading.tire_pressure}
                error={uploadErrors.tire_pressure}
                onRecord={file => uploadEvidence('tire_pressure', file)}
              />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-auto">
          {trans && (
            <>
              <button
                onClick={advanceStatus}
                disabled={advancing || (isCompleting && !canComplete)}
                className="btn-primary"
              >
                {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
                {advancing ? t('washer.activeJob.updating') : t(trans.key)}
              </button>

              {isCompleting && !canComplete && (
                <p className="text-xs text-center text-ink-muted px-2">
                  {t('washer.activeJob.uploadRequired', { items: missingEvidence.join(', ') })}
                </p>
              )}
            </>
          )}

          {order?.status === 'accepted' && (
            <button onClick={cancelJob} disabled={cancelling} className="btn-ghost text-danger-500 hover:bg-danger-50">
              <XCircle className="h-4 w-4" />
              {cancelling ? t('washer.activeJob.cancelling') : t('washer.activeJob.cancelJob')}
            </button>
          )}

          {order?.status === 'completed' && (
            <div className="card bg-success-50 border-success-500 text-center">
              <p className="font-semibold text-success-600">{t('washer.activeJob.completed')}</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
