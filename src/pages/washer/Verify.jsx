import { useState, useRef, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Waves, CheckCircle, Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { resizeToBlob } from '../../lib/imageResize.js'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'

const LivenessCapture = lazy(() => import('./LivenessCapture.jsx'))

const BUCKET = 'washer-verification'

function SectionHeader({ number, title, done }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${done ? 'bg-primary-500 text-white' : 'bg-neutral-200 text-neutral-600'}`}>
        {done ? <CheckCircle className="h-4 w-4" /> : number}
      </div>
      <h2 className="font-semibold text-neutral-900">{title}</h2>
    </div>
  )
}

function FileUploadSlot({ label, hint, accept, onUploaded, uploaded, busy }) {
  const { t } = useTranslation()
  const inputRef = useRef(null)

  async function handleFile(file) {
    if (!file) return
    onUploaded(file, URL.createObjectURL(file))
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-600">{hint}</p>
      {uploaded ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-success-600 font-medium">
            <CheckCircle className="h-4 w-4" />
            {label}
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs text-neutral-500 underline"
            disabled={busy}
          >
            {t('washerSignup.verify.sectionId.change')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-neutral-300 text-sm text-neutral-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
        >
          <Upload className="h-4 w-4" />
          {label}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={e => handleFile(e.target.files?.[0])}
      />
    </div>
  )
}

export default function Verify() {
  const { t } = useTranslation()
  const { user, refreshProfile } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const serviceAreas = location.state?.serviceAreas ??
    JSON.parse(sessionStorage.getItem('washer_signup_areas') ?? '[]')
  const dealerNumber = location.state?.dealerNumber ??
    (sessionStorage.getItem('washer_signup_dealer') ?? '')

  const [idFile, setIdFile]               = useState(null)
  const [idPreview, setIdPreview]         = useState(null)
  const [livenessBlobs, setLivenessBlobs] = useState(null)
  const [licenseFile, setLicenseFile]     = useState(null)
  const [licensePreview, setLicensePreview] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')

  const allDone = !!idFile && !!livenessBlobs && !!licenseFile

  async function uploadFile(file, path) {
    let blob = file
    if (file.type.startsWith('image/')) {
      try { blob = await resizeToBlob(file) } catch { /* use original */ }
    }
    const ext = file.name.split('.').pop().toLowerCase()
    const finalPath = path.endsWith('.jpg') ? path : `${path}.${ext}`
    const { error: err } = await supabase.storage
      .from(BUCKET)
      .upload(finalPath, blob, { upsert: true, contentType: file.type || 'application/octet-stream' })
    if (err) throw err
    return finalPath
  }

  async function uploadBlob(blob, path) {
    const { error: err } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (err) throw err
    return path
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!allDone || !user) return
    setSubmitting(true)
    setError('')

    try {
      const uid = user.id

      const idPath = await uploadFile(idFile, `${uid}/id_document.jpg`)

      const livenessPaths = await Promise.all(
        livenessBlobs.map((blob, i) => uploadBlob(blob, `${uid}/liveness_${i + 1}.jpg`))
      )

      const licenseExt  = licenseFile.name.split('.').pop().toLowerCase()
      const licensePath = await uploadFile(licenseFile, `${uid}/business_license.${licenseExt}`)

      const { error: insertErr } = await supabase.from('washer_verifications').insert({
        washer_id:             uid,
        dealer_number:         dealerNumber,
        service_areas:         serviceAreas,
        id_document_path:      idPath,
        liveness_paths:        livenessPaths,
        business_license_path: licensePath,
      })
      if (insertErr) throw insertErr

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          washer_verification_status: 'pending_review',
          washer_service_areas:       serviceAreas,
          washer_dealer_number:       dealerNumber,
        })
        .eq('id', uid)
      if (profileErr) throw profileErr

      sessionStorage.removeItem('washer_signup_areas')
      sessionStorage.removeItem('washer_signup_dealer')

      await refreshProfile()
      navigate('/signup/washer/pending', { replace: true })
    } catch (err) {
      setError(err.message || t('washerSignup.verify.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-mesh flex flex-col min-h-full px-5 py-10 overflow-y-auto">
      <div className="flex flex-col gap-6 max-w-sm mx-auto w-full">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-primary-500 p-2">
            <Waves className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-primary-600">Wash</span>
        </div>

        <GlassCard className="p-6 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">{t('washerSignup.verify.title')}</h1>
            <p className="text-neutral-500 text-sm mt-0.5">{t('washerSignup.verify.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Section A: ID */}
            <div className="flex flex-col gap-3">
              <SectionHeader number="A" title={t('washerSignup.verify.sectionId.title')} done={!!idFile} />
              <FileUploadSlot
                label={idFile ? t('washerSignup.verify.sectionId.uploaded') : t('washerSignup.verify.sectionId.upload')}
                hint={t('washerSignup.verify.sectionId.hint')}
                accept="image/*"
                onUploaded={(file, preview) => { setIdFile(file); setIdPreview(preview) }}
                uploaded={!!idFile}
              />
              {idPreview && (
                <img src={idPreview} alt="" className="h-24 w-auto rounded-lg object-cover border border-neutral-200" />
              )}
            </div>

            <hr className="border-neutral-100" />

            {/* Section B: Liveness */}
            <div className="flex flex-col gap-3">
              <SectionHeader number="B" title={t('washerSignup.verify.sectionLiveness.title')} done={!!livenessBlobs} />
              <Suspense fallback={
                <div className="text-sm text-neutral-500">{t('washerSignup.verify.sectionLiveness.modelLoading')}</div>
              }>
                <LivenessCapture onComplete={blobs => setLivenessBlobs(blobs || null)} />
              </Suspense>
            </div>

            <hr className="border-neutral-100" />

            {/* Section C: Business license */}
            <div className="flex flex-col gap-3">
              <SectionHeader number="C" title={t('washerSignup.verify.sectionLicense.title')} done={!!licenseFile} />
              <FileUploadSlot
                label={licenseFile ? t('washerSignup.verify.sectionLicense.uploaded') : t('washerSignup.verify.sectionLicense.upload')}
                hint={t('washerSignup.verify.sectionLicense.hint')}
                accept="image/*,application/pdf"
                onUploaded={(file, preview) => { setLicenseFile(file); setLicensePreview(preview) }}
                uploaded={!!licenseFile}
              />
              {licensePreview && licenseFile?.type?.startsWith('image/') && (
                <img src={licensePreview} alt="" className="h-24 w-auto rounded-lg object-cover border border-neutral-200" />
              )}
              {licenseFile && !licenseFile.type?.startsWith('image/') && (
                <p className="text-xs text-neutral-500">{licenseFile.name}</p>
              )}
            </div>

            {error && (
              <p className="text-danger-500 text-sm rounded-lg bg-danger-50 p-3">{error}</p>
            )}

            <MotionButton
              type="submit"
              disabled={!allDone || submitting}
              className="btn-primary mt-1"
            >
              {submitting ? t('washerSignup.verify.submitting') : t('washerSignup.verify.submit')}
            </MotionButton>
          </form>
        </GlassCard>
      </div>
    </div>
  )
}
