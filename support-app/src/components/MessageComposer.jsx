import { useRef, useState, useEffect } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { validateAttachment } from '../lib/support.js'
import CannedResponseMenu from './CannedResponseMenu.jsx'

export default function MessageComposer({ onSend, onTyping, disabled }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [sending, setSending] = useState(false)
  const [cannedQuery, setCannedQuery] = useState(null) // string when '/' detected
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

    // Detect '/' at start of line for canned responses
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
    <div className="border-t border-edge bg-surface-elevated px-3 py-2 relative">
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
          <button onClick={clearAttachment} className="absolute -top-1 -end-1 rounded-full bg-neutral-700 p-0.5 text-white">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="shrink-0 p-2 rounded-xl text-ink-muted hover:bg-glass transition-colors"
          style={{ minHeight: 40, minWidth: 40 }}
          aria-label={t('chat.attach')}
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? t('chat.closed') : t('chat.placeholder')}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-edge bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/50 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50 transition"
          style={{ maxHeight: 96 }}
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0 p-2 rounded-xl bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-500 transition-colors"
          style={{ minHeight: 40, minWidth: 40 }}
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
