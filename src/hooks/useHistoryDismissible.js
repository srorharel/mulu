import { useCallback, useEffect, useRef } from 'react'

/**
 * Pushes a history entry when an overlay opens so the back-gesture closes
 * the overlay instead of navigating away. Call dismiss() for every
 * non-back-gesture close path (backdrop tap, Escape, confirm, nav item).
 *
 * @param {boolean}  isOpen     Controlled open state of the overlay.
 * @param {function} onClose    Callback that sets the overlay's open state to false.
 * @param {string}   overlayKey Unique string for this overlay (used in history state).
 * @returns {{ dismiss: function }}
 */
export function useHistoryDismissible(isOpen, onClose, overlayKey) {
  // Always-current onClose reference — avoids stale closure in the popstate handler.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // True while this overlay owns the top-of-stack history entry it pushed.
  const ownsEntryRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      // Overlay closed — reset ownership regardless of how it closed.
      ownsEntryRef.current = false
      return
    }

    window.history.pushState({ overlay: overlayKey }, '', window.location.href)
    ownsEntryRef.current = true

    // Back-gesture path: browser pops our entry → fire popstate → close overlay.
    const handler = () => {
      ownsEntryRef.current = false
      onCloseRef.current()
    }

    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [isOpen, overlayKey])

  // Call this for all user-initiated close actions.
  // Do NOT call onClose directly — always route through dismiss() so the
  // pushed history entry is cleaned up before the overlay disappears.
  const dismiss = useCallback(() => {
    if (ownsEntryRef.current) {
      // Calls history.back() → popstate fires (async) → handler → onClose().
      window.history.back()
    }
    // If ownsEntryRef is false the back gesture already fired and the handler
    // is handling the close. Nothing to do.
  }, [])

  return { dismiss }
}
