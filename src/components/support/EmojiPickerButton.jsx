import { useState, useRef, useEffect } from 'react'
import { Smile } from 'lucide-react'
import EmojiPicker from 'emoji-picker-react'

export default function EmojiPickerButton({ onEmojiSelect, disabled }) {
  const [open, setOpen] = useState(false)
  const wrapperRef      = useRef(null)

  useEffect(() => {
    if (!open) return

    function handleMouseDown(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleEmojiClick(emojiData) {
    onEmojiSelect?.(emojiData.emoji)
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="shrink-0 rounded-xl p-2 text-ink-muted hover:bg-surface transition-colors disabled:opacity-40"
        style={{ minHeight: 44, minWidth: 44 }}
        aria-label="Emoji"
        data-testid="emoji-trigger"
      >
        <Smile className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 right-0"
          style={{ zIndex: 50 }}
          data-testid="emoji-picker"
        >
          <EmojiPicker
            theme="dark"
            width={340}
            height={360}
            onEmojiClick={handleEmojiClick}
          />
        </div>
      )}
    </div>
  )
}
