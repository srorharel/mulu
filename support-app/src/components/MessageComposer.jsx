import { useRef, useState, useEffect } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { validateAttachment } from '../lib/support.js'
import CannedResponseMenu from './CannedResponseMenu.jsx'
import EmojiPickerButton from './chat/EmojiPickerButton.jsx'

export default function MessageComposer({ onSend, onTyping, disabled }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [sending, setSending] = useState(false)
  const [cannedQuery, setCannedQuery] = useState(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimerRef = useRef(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }, [text])

  function handleTextChange(e) {
    const val = e.target.value
    setText(val)
    onTyping?.(true)
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => onTyping?.(false), 2000)

    const match = val.match(/^\/(\S*)$/)
    setCannedQuery(match ? match[1] : null)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const err = validateAttachment(file)
    if (err) { alert(err); return }
    setAttachment({ file, preview: URL.createObjectURL(file) })
    e.target.value = ''
  }

  function clearAttachment() {
    if (attachment) URL.revokeObjectURL(attachment.preview)
    setAttachment(null)
  }

  function handleCannedSelect(body) {
    setText(body)
    setCannedQuery(null)
    textareaRef.current?.focus()
  }

  function insertEmojiAtCursor(emoji) {
    const el = textareaRef.current
    if (!el) { setText(prev => prev + emoji); return }
    const start = el.selectionStart ?? el.value.length
    const end   = el.selectionEnd   ?? el.value.length
    const newText = text.substring(0, start) + emoji + text.substring(end)
    setText(newText)
    requestAnimationFrame(() => {
      el.setSelectionRange(start + emoji.length, start + emoji.length)
      el.focus()
    })
  }

  async function handleSend() {
    if (sending || disabled) return
    const trimmed = text.trim()
    if (!trimmed && !attachment) return

    setSending(true)
    clearTimeout(typingTimerRef.current)
    onTyping?.(false)
    setCannedQuery(null)

    await onSend({ body: trimmed || null, attachment: attachment?.file || null })

    setText('')
    clearAttachment()
    setSending(false)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !cannedQuery) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = (text.trim().length > 0 || !!attachment) && !sending && !disabled

  return (
    <div className="border-t border-edge bg-surface-elevated px-3 py-2.5 relative shrink-0">
      {cannedQuery !== null && (
        <CannedResponseMenu
          query={cannedQuery}
          onSelect={handleCannedSelect}
          onClose={() => setCannedQuery(null)}
        />
      )}

      {attachment && (
        <div className="relative inline-block mb-2">
          <img src={attachment.preview} alt="" className="h-14 w-14 rounded-lg object-cover border border-edge" />
          <button onClick={clearAttachment} className="absolute -top-1 -end-1 rounded-full bg-surface-high p-0.5 text-ink-muted hover:text-ink">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div
        className="flex items-end gap-2 rounded-xl border border-edge-strong bg-surface px-2 py-1.5"
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="shrink-0 p-1.5 rounded-lg text-ink-subtle hover:text-ink-muted transition-colors disabled:opacity-40"
          aria-label={t('chat.attach')}
        >
          <Paperclip className="h-[17px] w-[17px]" />
        </button>

        <EmojiPickerButton onEmojiSelect={insertEmojiAtCursor} disabled={disabled} />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? t('chat.closed') : t('chat.placeholder')}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-[13.5px] text-ink placeholder:text-ink-subtle outline-none disabled:opacity-50"
          style={{ maxHeight: 96, paddingTop: 4, paddingBottom: 4 }}
        />

        {/* Slash hint */}
        <span className="shrink-0 flex items-center gap-1 text-[10.5px] text-ink-subtle px-1">
          <span>/</span>
          canned
        </span>

        <button
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0 flex items-center justify-center rounded-lg text-white disabled:opacity-40 transition-colors"
          style={{
            width: 34, height: 34,
            background: 'var(--color-agent)',
            boxShadow: canSend ? '0 3px 10px rgba(63,181,143,0.35)' : 'none',
          }}
          onMouseEnter={e => { if (canSend) e.currentTarget.style.background = 'var(--color-agent-deep)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-agent)' }}
          aria-label={t('chat.send')}
        >
          <Send className="h-4 w-4" />
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
