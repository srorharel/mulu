import { useRef, useState, useEffect } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { validateAttachment } from '../../lib/support.js'

export default function MessageComposer({ onSend, onTyping, disabled }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState(null) // { file, preview }
  const [sending, setSending] = useState(false)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimerRef = useRef(null)

  // Auto-grow textarea up to 4 lines
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }, [text])

  function handleTextChange(e) {
    setText(e.target.value)
    onTyping?.(true)
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => onTyping?.(false), 2000)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const err = validateAttachment(file)
    if (err) { alert(err); return }
    const preview = URL.createObjectURL(file)
    setAttachment({ file, preview })
    e.target.value = ''
  }

  function clearAttachment() {
    if (attachment) URL.revokeObjectURL(attachment.preview)
    setAttachment(null)
  }

  async function handleSend() {
    if (sending || disabled) return
    const trimmed = text.trim()
    if (!trimmed && !attachment) return

    setSending(true)
    clearTimeout(typingTimerRef.current)
    onTyping?.(false)

    await onSend({ body: trimmed || null, attachment: attachment?.file || null })

    setText('')
    clearAttachment()
    setSending(false)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = (text.trim().length > 0 || !!attachment) && !sending && !disabled

  return (
    <div className="border-t border-edge bg-surface-elevated px-3 py-2 safe-bottom">
      {attachment && (
        <div className="relative inline-block mb-2">
          <img
            src={attachment.preview}
            alt=""
            className="h-16 w-16 rounded-lg object-cover border border-edge"
          />
          <button
            onClick={clearAttachment}
            className="absolute -top-1.5 -end-1.5 rounded-full bg-neutral-700 p-0.5 text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="shrink-0 rounded-xl p-2 text-ink-muted hover:bg-surface transition-colors"
          style={{ minHeight: 44, minWidth: 44 }}
          aria-label={t('support.attachImage')}
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? t('support.conversationClosed') : t('support.sendPlaceholder')}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-edge bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/50 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50 transition"
          style={{ maxHeight: 96 }}
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0 rounded-xl p-2 bg-accent text-white disabled:opacity-40 transition-opacity hover:bg-accent/80"
          style={{ minHeight: 44, minWidth: 44 }}
          aria-label={t('support.send')}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
