import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Waves, CheckCircle, Upload, Camera as CameraIcon, Loader2 } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { resizeToBlob } from '../../lib/imageResize.js'
import { detectFaceInImage } from '../../lib/faceDetect.js'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'

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

function SectionError({ message }) {
  if (!message) return null
  return <p className="text-danger-500 text-sm rounded-lg bg-danger-50 p-3">{message}</p>
}

function FileUploadSlot({ label, hint, accept, onUploaded, uploaded, busy, changeLabel }) {
  const inputRef = useRef(null)

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
            {changeLabel}
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
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onUploaded(file, URL.createObjectURL(file))
        }}
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

  const [idFile, setIdFile]                 = useState(null)
  const [idPreview, setIdPreview]           = useState(null)
  const [idError, setIdError]               = useState('')

  const [selfieFile, setSelfieFile]         = useState(null)
  const [selfiePreview, setSelfiePreview]   = useState(null)
  const [selfieChecking, setSelfieChecking] = useState(false)
  const [selfieError, setSelfieError]       = useState('')

  const [licenseFile, setLicenseFile]       = useState(null)
  const [licensePreview, setLicensePreview] = useState(null)
  const [licenseError, setLicenseError]     = useState('')

  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState('')

  const selfieInputRef = useRef(null)

  const allDone = !!idFile && !!selfieFile && !!licenseFile

  // ── Selfie helpers ────────────────────────────────────────────────────────

  async function processSelfie(blob, previewUrl) {
    setSelfieError('')
    setSelfieChecking(true)
    try {
      const faceFound = await detectFaceInImage(previewUrl)
      if (!faceFound) {
        setSelfieError(t('washerSignup.verify.sectionSelfie.noFace'))
        return
      }
      setSelfieFile(blob)
      setSelfiePreview(previewUrl)
    } catch {
      setSelfieError(t('washerSignup.verify.sectionSelfie.checkUnavailable'))
    } finally {
      setSelfieChecking(false)
    }
  }

  async function handleSelfie() {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await NativeCamera.getPhoto({
          quality:            85,
          allowEditing:       false,
          resultType:         CameraResultType.DataUrl,
          source:             CameraSource.Camera,
          direction:          'FRONT',
          correctOrientation: true,
        })
        if (result.dataUrl) {
          const blob = await fetch(result.dataUrl).then(r => r.blob())
          await processSelfie(blob, result.dataUrl)
        }
      } catch (e) {
        if (!e?.message?.toLowerCase().includes('cancel')) {
          setSelfieError(t('washerSignup.verify.submitError'))
        }
      }
    } else {
      selfieInputRef.current?.click()
    }
  }

  async function handleSelfieFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    await processSelfie(file, URL.createObjectURL(file))
  }

  function retakeSelfie() {
    setSelfieFile(null)
    setSelfiePreview(null)
    setSelfieError('')
    setSelfieChecking(false)
    if (selfieInputRef.current) selfieInputRef.current.value = ''
  }

  // ── Upload helper ─────────────────────────────────────────────────────────

  async function uploadFile(file, path) {
    let blob = file
    if (file.type.startsWith('image/')) {
      try { blob = await resizeToBlob(file) } catch { /* use original */ }
    }
    const ext = (file.name ?? 'file').split('.').pop().toLowerCase()
    const finalPath = path.endsWith('.jpg') ? path : `${path}.${ext}`
    const { error: err } = await supabase.storage
      .from(BUCKET)
      .upload(finalPath, blob, { upsert: true, contentType: file.type || 'image/jpeg' })
    if (err) throw err
    return finalPath
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    if (!allDone || !user) return
    setSubmitting(true)
    setIdError(''); setSelfieError(''); setLicenseError(''); setSubmitError('')

    try {
      const uid = user.id

      let idPath
      try { idPath = await uploadFile(idFile, `${uid}/id_document.jpg`) }
      catch (err) { console.error('[washer-verify] upload failed', { section: 'id', error: err }); setIdError(err.message || t('washerSignup.verify.submitError')); return }

      let selfiePath
      try { selfiePath = await uploadFile(selfieFile, `${uid}/selfie.jpg`) }
      catch (err) { console.error('[washer-verify] upload failed', { section: 'selfie', error: err }); setSelfieError(err.message || t('washerSignup.verify.submitError')); return }

      const licenseExt = (licenseFile.name ?? 'file').split('.').pop().toLowerCase()
      let licensePath
      try { licensePath = await uploadFile(licenseFile, `${uid}/business_license.${licenseExt}`) }
      catch (err) { console.error('[washer-verify] upload failed', { section: 'license', error: err }); setLicenseError(err.message || t('washerSignup.verify.submitError')); return }

      const { error: insertErr } = await supabase.from('washer_verifications').insert({
        washer_id:             uid,
        dealer_number:         dealerNumber,
        service_areas:         serviceAreas,
        id_document_path:      idPath,
        selfie_path:           selfiePath,
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
      setSubmitError(err.message || t('washerSignup.verify.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

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

            {/* ── Section A: ID ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <SectionHeader number="A" title={t('washerSignup.verify.sectionId.title')} done={!!idFile} />
              <FileUploadSlot
                label={idFile ? t('washerSignup.verify.sectionId.uploaded') : t('washerSignup.verify.sectionId.upload')}
                hint={t('washerSignup.verify.sectionId.hint')}
                changeLabel={t('washerSignup.verify.sectionId.change')}
                accept="image/*"
                onUploaded={(file, preview) => { setIdFile(file); setIdPreview(preview); setIdError('') }}
                uploaded={!!idFile}
                busy={submitting}
              />
              {idPreview && (
                <img src={idPreview} alt="" className="h-24 w-auto rounded-lg object-cover border border-neutral-200" />
              )}
              <SectionError message={idError} />
            </div>

            <hr className="border-neutral-100" />

            {/* ── Section B: Selfie ─────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <SectionHeader number="B" title={t('washerSignup.verify.sectionSelfie.title')} done={!!selfieFile} />
              <p className="text-sm text-neutral-600">{t('washerSignup.verify.sectionSelfie.instruction')}</p>

              {selfieChecking ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('washerSignup.verify.sectionSelfie.checking')}
                </div>
              ) : selfieFile ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm text-success-600 font-medium">
                    <CheckCircle className="h-4 w-4" />
                    {t('washerSignup.verify.sectionSelfie.uploaded')}
                  </div>
                  {selfiePreview && (
                    <img src={selfiePreview} alt="" className="h-24 w-auto rounded-lg object-cover border border-neutral-200" />
                  )}
                  <button type="button" onClick={retakeSelfie} className="text-xs text-neutral-500 underline" disabled={submitting}>
                    {t('washerSignup.verify.sectionSelfie.retake')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSelfie}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-neutral-300 text-sm text-neutral-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
                >
                  <CameraIcon className="h-4 w-4" />
                  {t('washerSignup.verify.sectionSelfie.cta')}
                </button>
              )}

              <input
                ref={selfieInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="sr-only"
                onChange={handleSelfieFile}
              />
              <SectionError message={selfieError} />
            </div>

            <hr className="border-neutral-100" />

            {/* ── Section C: Business license ───────────────────────────── */}
            <div className="flex flex-col gap-3">
              <SectionHeader number="C" title={t('washerSignup.verify.sectionLicense.title')} done={!!licenseFile} />
              <FileUploadSlot
                label={licenseFile ? t('washerSignup.verify.sectionLicense.uploaded') : t('washerSignup.verify.sectionLicense.upload')}
                hint={t('washerSignup.verify.sectionLicense.hint')}
                changeLabel={t('washerSignup.verify.sectionLicense.change')}
                accept="image/*,application/pdf"
                onUploaded={(file, preview) => { setLicenseFile(file); setLicensePreview(preview); setLicenseError('') }}
                uploaded={!!licenseFile}
                busy={submitting}
              />
              {licensePreview && licenseFile?.type?.startsWith('image/') && (
                <img src={licensePreview} alt="" className="h-24 w-auto rounded-lg object-cover border border-neutral-200" />
              )}
              {licenseFile && !licenseFile.type?.startsWith('image/') && (
                <p className="text-xs text-neutral-500">{licenseFile.name}</p>
              )}
              <SectionError message={licenseError} />
            </div>

            {submitError && (
              <p className="text-danger-500 text-sm rounded-lg bg-danger-50 p-3">{submitError}</p>
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
