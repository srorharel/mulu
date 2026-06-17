import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { hero, download } from '../lib/content.js'
import { StoreButtons, Wordmark } from './brand.jsx'
import { useDownload } from './download-context.jsx'

export function DownloadModal() {
  const { isOpen, close } = useDownload()
  const reduce = useReducedMotion()
  const cardRef = useRef(null)
  const lastFocus = useRef(null)
  const noLinks = !hero.store.iosUrl && !hero.store.androidUrl

  useEffect(() => {
    if (!isOpen) return
    lastFocus.current = document.activeElement
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => cardRef.current?.querySelector('button, a')?.focus(), 30)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      clearTimeout(t)
      if (lastFocus.current?.focus) lastFocus.current.focus()
    }
  }, [isOpen, close])

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="download-title"
        >
          {/* scrim */}
          <button
            type="button"
            aria-label="סגירה"
            className="absolute inset-0 cursor-default bg-ink/60 backdrop-blur-sm"
            onClick={close}
          />

          <motion.div
            ref={cardRef}
            initial={reduce ? false : { opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md rounded-[2rem] bg-white p-7 text-center shadow-lift sm:p-8"
          >
            <button
              type="button"
              onClick={close}
              aria-label="סגירה"
              className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-mist hover:text-ink"
            >
              <X className="h-5 w-5" strokeWidth={2.4} />
            </button>

            <img src="/logo.png" alt="" className="mx-auto h-16 w-16 rounded-2xl shadow-soft" width="64" height="64" />

            <h2 id="download-title" className="mt-4 text-2xl font-extrabold text-ink">
              {download.title} <Wordmark className="text-2xl" />
            </h2>
            <p className="mt-2 leading-relaxed text-ink-soft">{download.sub}</p>

            <StoreButtons store={hero.store} className="mt-6 justify-center" />

            {noLinks && (
              <p className="mt-5 text-sm font-medium text-ink-mute">{download.comingSoonHint}</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
