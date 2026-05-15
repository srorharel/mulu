import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

// photos: array of URL strings
// initialIndex: which photo to start on
export default function PhotoLightbox({ photos, initialIndex = 0, onClose }) {
  const [idx, setIdx]     = useState(initialIndex)
  const [startX, setStartX] = useState(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowLeft')   setIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight')  setIdx(i => Math.min(photos.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos.length, onClose])

  function handleTouchStart(e) { setStartX(e.touches[0].clientX) }
  function handleTouchEnd(e) {
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    if (Math.abs(dx) > 50) {
      if (dx < 0) setIdx(i => Math.min(photos.length - 1, i + 1))
      else        setIdx(i => Math.max(0, i - 1))
    }
    setStartX(null)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {photos.length > 1 && idx > 0 && (
        <button
          type="button"
          onClick={() => setIdx(i => i - 1)}
          className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <img
        src={photos[idx]}
        alt=""
        className="max-w-full object-contain"
        style={{ maxHeight: '90vh' }}
      />

      {photos.length > 1 && idx < photos.length - 1 && (
        <button
          type="button"
          onClick={() => setIdx(i => i + 1)}
          className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {photos.length > 1 && (
        <div className="absolute bottom-6 flex gap-2">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`w-2 h-2 rounded-full transition-colors ${i === idx ? 'bg-white' : 'bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}
