import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export default function PhotoLightbox({ photos, index, onClose, onNavigate }) {
  const isOpen = index !== null && index !== undefined
  const current = isOpen ? photos[index] : null

  const handleKey = useCallback((e) => {
    if (!isOpen) return
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowRight' && onNavigate) onNavigate(Math.min(index + 1, photos.length - 1))
    if (e.key === 'ArrowLeft' && onNavigate) onNavigate(Math.max(index - 1, 0))
  }, [isOpen, index, photos, onClose, onNavigate])

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prev
    }
  }, [isOpen, handleKey])

  useEffect(() => {
    if (!isOpen) return
    let removeListener
    ;(async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return
        const { App } = await import('@capacitor/app')
        const handle = await App.addListener('backButton', () => { onClose() })
        removeListener = () => handle.remove()
      } catch { /* not native */ }
    })()
    return () => { removeListener?.() }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 bg-black/95 flex items-center justify-center"
        style={{ zIndex: 99999 }}
        onClick={onClose}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className="absolute top-4 end-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <motion.img
          key={current.url}
          src={current.url}
          alt={current.label || ''}
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="max-w-full max-h-full object-contain p-4"
          onClick={(e) => e.stopPropagation()}
        />

        {photos.length > 1 && onNavigate && (
          <>
            <button
              type="button"
              disabled={index === 0}
              onClick={(e) => { e.stopPropagation(); onNavigate(index - 1) }}
              className="absolute start-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
            </button>
            <button
              type="button"
              disabled={index === photos.length - 1}
              onClick={(e) => { e.stopPropagation(); onNavigate(index + 1) }}
              className="absolute end-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30"
              aria-label="Next photo"
            >
              <ChevronRight className="w-5 h-5 rtl:rotate-180" />
            </button>
          </>
        )}

        <div
          className="absolute bottom-0 inset-x-0 p-4 text-center text-white/80 text-sm bg-gradient-to-t from-black/60 to-transparent"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {current.label && <div className="mb-1 font-medium">{current.label}</div>}
          {photos.length > 1 && <div className="text-xs text-white/60">{index + 1} / {photos.length}</div>}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
