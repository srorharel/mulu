import { useState, useRef } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera'
import { supabase } from '../../lib/supabase.js'
import { resizeToBlob, MAX_BYTES } from '../../lib/imageResize.js'

const BUCKET = 'car-photos'

function PhotoSlot({ index, orderId, userId, photo, onUploaded, onRemoved }) {
  const { t }             = useTranslation()
  const inputRef          = useRef(null)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

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

    const path = `${userId}/${orderId}/${index}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, resized, { upsert: true, contentType: 'image/jpeg' })

    setBusy(false)
    if (uploadErr) { setErr(t('consumer.home.photos.uploadFailed')); return }
    onUploaded(index, path, URL.createObjectURL(resized))
  }

  async function handleOpen() {
    if (Capacitor.isNativePlatform()) {
      // Native: hard-lock to camera — no gallery option shown to the user
      try {
        const photo = await NativeCamera.getPhoto({
          quality:           85,
          allowEditing:      false,
          resultType:        CameraResultType.DataUrl,
          source:            CameraSource.Camera,
          width:             MAX_EDGE_PX,
          height:            MAX_EDGE_PX,
          correctOrientation: true,
        })
        if (photo.dataUrl) {
          const blob = await fetch(photo.dataUrl).then(r => r.blob())
          await uploadBlob(blob)
        }
      } catch (e) {
        // User cancelled — silently ignore; any other error shows the upload failed message
        if (!e?.message?.toLowerCase().includes('cancel')) {
          setErr(t('consumer.home.photos.uploadFailed'))
        }
      }
    } else {
      // Web / dev browser: file input with capture hint (best-effort camera on mobile browsers)
      inputRef.current?.click()
    }
  }

  async function handleRemove() {
    if (photo?.path) await supabase.storage.from(BUCKET).remove([photo.path])
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)
    onRemoved(index)
  }

  if (photo) {
    return (
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
    )
  }

  return (
    <div className="flex flex-col gap-1">
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
      {/* File input used only in web/browser; native path goes through NativeCamera above */}
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

// onChange(photos, bothUploaded)
// photos: [{ path, previewUrl } | null, { path, previewUrl } | null]
// showLabel: pass false when the parent card already provides a header.
// userId: the authenticated consumer's user ID — used as the first path segment
//         so RLS can verify ownership via (storage.foldername(name))[1] = auth.uid()::text
export default function CarPhotoUpload({ orderId, userId, onChange, showLabel = true }) {
  const { t }    = useTranslation()
  const [photos, setPhotos] = useState([null, null])

  function handleUploaded(index, path, previewUrl) {
    setPhotos(prev => {
      const next = [...prev]
      next[index] = { path, previewUrl }
      onChange(next, next[0] !== null && next[1] !== null)
      return next
    })
  }

  function handleRemoved(index) {
    setPhotos(prev => {
      const next = [...prev]
      next[index] = null
      onChange(next, false)
      return next
    })
  }

  return (
    <div>
      {showLabel && <p className="label mb-2">{t('consumer.home.photos.title')}</p>}
      <div className="grid grid-cols-2 gap-3">
        {photos.map((photo, i) => (
          <PhotoSlot
            key={i}
            index={i}
            orderId={orderId}
            userId={userId}
            photo={photo}
            onUploaded={handleUploaded}
            onRemoved={handleRemoved}
          />
        ))}
      </div>
    </div>
  )
}
