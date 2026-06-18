import { useId } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

// ── Shared modal scaffold for the app's "little windows" ──────────────────────
// Portal + scrim + a SOLID elevated card (no backdrop-blur on the surface —
// Android WebView renders it unreliably and clipped buttons; CLAUDE.md gotcha).
// Themes entirely through tokens, so light + dark come for free. Presentational
// only: callers own open/close (so back-gesture/history handling stays theirs).
//
//   placement="center" (default) → centred alert/confirm card
//   placement="bottom"           → bottom sheet on mobile (rounded top, safe-area)
//
// Optional header: a tone-tinted icon chip + title + subtitle. Pass `icon`
// (a Lucide component) and `tone` to render it; otherwise pass plain children.

const MODAL_SPRING = { type: 'spring', stiffness: 350, damping: 30 }

// Tone → icon-chip background + icon colour (light / dark parity).
export const MODAL_TONES = {
  default: { chip: 'bg-primary-100 dark:bg-accent-muted', icon: 'text-primary-700 dark:text-accent' },
  danger:  { chip: 'bg-danger-50 dark:bg-danger-500/15',  icon: 'text-danger-600 dark:text-danger-400' },
  warning: { chip: 'bg-warning-50 dark:bg-warning-500/15', icon: 'text-warning-600 dark:text-warning-500' },
  brand:   { chip: 'bg-accent-muted',                      icon: 'text-accent' },
}

export default function Modal({
  open,
  onClose,
  children,
  icon: Icon,
  tone = 'default',
  title,
  subtitle,
  placement = 'center',
  maxWidthClass = 'max-w-sm',
  dismissOnBackdrop = true,
}) {
  const reduce = useReducedMotion()
  const titleId = useId()
  const descId  = useId()
  const toneCls = MODAL_TONES[tone] ?? MODAL_TONES.default
  const isBottom = placement === 'bottom'

  // Reduced-motion: fade only (no scale/translate). Otherwise the card springs
  // from its source — scale for centred, slide-up for a bottom sheet.
  const hidden  = reduce
    ? { opacity: 0 }
    : isBottom ? { opacity: 0, y: 24 } : { opacity: 0, scale: 0.92 }
  const shown   = reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="modal-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60"
            onClick={dismissOnBackdrop ? onClose : undefined}
          />

          <div
            className={`fixed inset-0 z-[51] flex justify-center pointer-events-none px-5 ${
              isBottom ? 'items-end pb-[max(1.25rem,env(safe-area-inset-bottom))]' : 'items-center'
            }`}
          >
            <motion.div
              key="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={subtitle ? descId : undefined}
              initial={hidden}
              animate={shown}
              exit={hidden}
              transition={MODAL_SPRING}
              className={`pointer-events-auto w-full ${maxWidthClass} bg-surface-elevated border border-edge p-5 flex flex-col gap-5 shadow-2xl ${
                isBottom ? 'rounded-t-[28px]' : 'rounded-[28px]'
              }`}
            >
              {(Icon || title || subtitle) && (
                <div className="flex flex-col gap-3">
                  {Icon && (
                    <div className={`w-[52px] h-[52px] rounded-2xl flex items-center justify-center ${toneCls.chip}`}>
                      <Icon className={`h-[26px] w-[26px] ${toneCls.icon}`} strokeWidth={2} aria-hidden="true" />
                    </div>
                  )}
                  {(title || subtitle) && (
                    <div className="flex flex-col gap-1.5">
                      {title && (
                        <h2 id={titleId} className="text-[18px] font-extrabold text-ink leading-snug tracking-[-0.2px]">
                          {title}
                        </h2>
                      )}
                      {subtitle && (
                        <p id={descId} className="text-[14px] text-ink-muted leading-relaxed">
                          {subtitle}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// Shared button styles for modal footers — keeps every "little window" consistent.
const MODAL_BTN_BASE =
  'w-full h-[50px] rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export const modalBtn = {
  base: MODAL_BTN_BASE,
  // Neutral secondary (cancel / skip) — reads as a real button in both themes.
  neutral: `${MODAL_BTN_BASE} bg-neutral-100 text-ink hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-ink dark:hover:bg-white/[0.1]`,
  // Primary affirmative — brand-green CTA (matches the app's main CTA gradient).
  primary: `${MODAL_BTN_BASE} text-white bg-gradient-to-b from-primary-500 to-primary-700 active:from-primary-600 active:to-primary-700`,
  // Destructive confirm — solid danger with AA-contrast white text.
  danger: `${MODAL_BTN_BASE} bg-danger-600 text-white hover:bg-danger-500 active:bg-danger-600`,
}
