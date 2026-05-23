import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchCannedResponses } from '../lib/support.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function CannedResponseMenu({ query, onSelect, onClose }) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [active, setActive] = useState(0)
  const listRef = useRef(null)

  useEffect(() => {
    if (!profile) return
    fetchCannedResponses(profile.id).then(({ data }) => {
      const filtered = (data ?? []).filter(c =>
        !query || c.shortcut.toLowerCase().includes(query.toLowerCase())
      )
      setItems(filtered)
      setActive(0)
    })
  }, [query, profile])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowDown')  { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)) }
      if (e.key === 'ArrowUp')    { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
      if (e.key === 'Enter')      { e.preventDefault(); if (items[active]) select(items[active]) }
      if (e.key === 'Escape')     { onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, active, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  function select(item) {
    const body = i18n.language === 'he' ? item.body_he : item.body_en
    onSelect(body)
  }

  if (items.length === 0) return null

  return (
    <div
      className="absolute bottom-full start-0 end-0 mb-1 bg-surface-elevated border border-edge rounded-xl shadow-xl overflow-hidden z-10"
      ref={listRef}
    >
      {items.map((item, i) => (
        <button
          key={item.id}
          onClick={() => select(item)}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-start transition-colors ${
            i === active ? 'bg-accent-muted text-accent' : 'text-ink hover:bg-glass'
          }`}
        >
          <span className="font-mono text-xs text-ink-muted shrink-0">{item.shortcut}</span>
          <span className="truncate">{i18n.language === 'he' ? item.body_he : item.body_en}</span>
        </button>
      ))}
    </div>
  )
}
