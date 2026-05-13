import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function AttachmentPreview({ url, className = '' }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setLightboxOpen(true)}
        className={`block overflow-hidden rounded-xl ${className}`}
        style={{ maxWidth: 220 }}
      >
        <img
          src={url}
          alt=""
          className="w-full h-auto object-cover rounded-xl"
          style={{ maxHeight: 200 }}
        />
      </button>

      {createPortal(
        <AnimatePresence>
          {lightboxOpen && (
            <motion.div
              key="lightbox"
              className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightboxOpen(false)}
            >
              <button
                className="absolute top-4 end-4 rounded-full bg-white/10 p-2 text-white"
                onClick={() => setLightboxOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
              <motion.img
                src={url}
                alt=""
                className="max-w-full max-h-full rounded-xl object-contain"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                onClick={e => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
