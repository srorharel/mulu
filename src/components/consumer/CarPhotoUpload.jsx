import { useState, useRef } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'

const MAX_BYTES   = 5 * 1024 * 1024 // 5 MB
const MAX_EDGE_PX = 1600
const BUCKET      = 'car-photos'

async function resizeToBlob(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > MAX_EDGE_PX || h > MAX_EDGE_PX) {
        if (w >= h) { h = Math.round(h * MAX_EDGE_PX / w); w = MAX_EDGE_PX }
        else        { w = Math.round(w * MAX_EDGE_PX / h); h = MAX_EDGE_PX }
      }
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('toBlob failed')),
        'image/jpeg',
        0.85
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')) }
    img.src = url
  })
}

function PhotoSlot({ index, orderId, userId, photo, onUploaded, onRemoved }) {
  const { t }       = useTranslation()
  const inputRef    = useRef(null)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

  async function handleFile(file) {
    setErr('')
    if (file.size > MAX_BYTES) { setErr(t('consumer.home.photos.tooLarge')); return }
    setBusy(true)

    let blob
    try {
      blob = await resizeToBlob(file)
    } catch {
      setErr(t('consumer.home.photos.uploadFailed'))
      setBusy(false)
      return
    }

    const path = `${userId}/${orderId}/${index}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })

    setBusy(false)
    if (uploadErr) { setErr(t('consumer.home.photos.uploadFailed')); return }

    onUploaded(index, path, URL.createObjectURL(blob))
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
        onClick={() => inputRef.current?.click()}
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
        onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = '' }}
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
