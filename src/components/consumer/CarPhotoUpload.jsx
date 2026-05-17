import { useState, useRef } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { supabase } from '../../lib/supabase.js'
import { resizeToBlob, MAX_BYTES, MAX_EDGE_PX } from '../../lib/imageResize.js'

const BUCKET = 'car-photos'
const SLOTS  = ['front', 'back', 'driver', 'passenger']

function PhotoSlot({ slot, label, orderId, userId, photo, onUploaded, onRemoved }) {
  const { t }           = useTranslation()
  const inputRef        = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  async function uploadBlob(blob) {
    setErr('')
    if (blob.size > MAX_BYTES) { setErr(t('consumer.home.photos.tooLarge')); return }
    setBusy(true)

    let resized
    try {
      resized = await resizeToBlob(blob)
    } catch {
      setErr(t('consumer.home.photos.uploadFailed'))
      setBusy(false)
      return
    }

    const path = `${userId}/${orderId}/${slot}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, resized, { upsert: true, contentType: 'image/jpeg' })

    setBusy(false)
    if (uploadErr) { setErr(t('consumer.home.photos.uploadFailed')); return }
    onUploaded(slot, path, URL.createObjectURL(resized))
  }

  async function handleOpen() {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await NativeCamera.getPhoto({
          quality:            85,
          allowEditing:       false,
          resultType:         CameraResultType.DataUrl,
          source:             CameraSource.Camera,
          width:              MAX_EDGE_PX,
          height:             MAX_EDGE_PX,
          correctOrientation: true,
        })
        if (result.dataUrl) {
          const blob = await fetch(result.dataUrl).then(r => r.blob())
          await uploadBlob(blob)
        }
      } catch (e) {
        if (!e?.message?.toLowerCase().includes('cancel')) {
          setErr(t('consumer.home.photos.uploadFailed'))
        }
      }
    } else {
      inputRef.current?.click()
    }
  }

  async function handleRemove() {
    if (photo?.path) await supabase.storage.from(BUCKET).remove([photo.path])
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)
    onRemoved(slot)
  }

  if (photo) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-ink-muted text-center">{label}</span>
        <div className="relative aspect-square rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
          <img src={photo.previewUrl} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            aria-label={t('consumer.home.photos.removing')}
            className="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-muted text-center">{label}</span>
      <button
        type="button"
        disabled={busy}
        onClick={handleOpen}
        className="aspect-square rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 flex flex-col items-center justify-center gap-2 hover:border-primary-400 hover:bg-primary-50 transition-colors disabled:opacity-60"
      >
        {busy
          ? <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
          : <Camera className="h-6 w-6 text-neutral-400" />
        }
        <span className="text-xs text-neutral-500">
          {busy ? t('common.uploading') : t('consumer.home.photos.addPhoto')}
        </span>
      </button>
      {err && <p className="text-xs text-danger-500">{err}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={e => { if (e.target.files[0]) uploadBlob(e.target.files[0]); e.target.value = '' }}
      />
    </div>
  )
}

// onChange(photos, allUploaded)
// photos: { front, back, driver, passenger } — each value is { path, previewUrl } | null
// userId: consumer's auth.uid() — first path segment so consumer RLS policies apply
export default function CarPhotoUpload({ orderId, userId, onChange, showLabel = true }) {
  const { t } = useTranslation()
  const [photos, setPhotos] = useState({ front: null, back: null, driver: null, passenger: null })

  function handleUploaded(slot, path, previewUrl) {
    setPhotos(prev => {
      const next = { ...prev, [slot]: { path, previewUrl } }
      onChange(next, SLOTS.every(s => next[s] !== null))
      return next
    })
  }

  function handleRemoved(slot) {
    setPhotos(prev => {
      const next = { ...prev, [slot]: null }
      onChange(next, false)
      return next
    })
  }

  return (
    <div>
      {showLabel && (
        <div className="mb-2">
          <p className="label">{t('consumer.home.booking.carPhotos.title')}</p>
          <p className="text-xs text-ink-muted mt-0.5">{t('consumer.home.booking.carPhotos.subtitle')}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {SLOTS.map(slot => (
          <PhotoSlot
            key={slot}
            slot={slot}
            label={t(`washer.drawer.photoSlots.${slot}`)}
            orderId={orderId}
            userId={userId}
            photo={photos[slot]}
            onUploaded={handleUploaded}
            onRemoved={handleRemoved}
          />
        ))}
      </div>
    </div>
  )
}
