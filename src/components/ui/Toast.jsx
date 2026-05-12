import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'

const ToastContext = createContext(null)

let _id = 0

const ICONS = {
  success: <CheckCircle className="h-5 w-5 text-success-500" />,
  error:   <XCircle className="h-5 w-5 text-danger-500" />,
  warning: <AlertCircle className="h-5 w-5 text-warning-500" />,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'success', duration = 3500) => {
    const id = ++_id
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }, [])

  const dismiss = (id) => setToasts(t => t.filter(x => x.id !== id))

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {toasts.map(t => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0,  scale: 1    }}
                exit={{    opacity: 0, y: -8,  scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="pointer-events-auto flex items-start gap-3 rounded-xl bg-white p-3 shadow-lg border border-neutral-100 dark:bg-surface-elevated dark:border-edge dark:shadow-[0_8px_24px_-8px_rgba(255,255,255,0.08)]"
              >
                {ICONS[t.type]}
                <p className="flex-1 text-sm text-neutral-800 dark:text-ink">{t.message}</p>
                <button onClick={() => dismiss(t.id)} className="text-neutral-400 hover:text-neutral-600 dark:text-ink-muted dark:hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}
