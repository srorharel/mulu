import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ChevronDown } from 'lucide-react'
import Pill from './Pill.jsx'
import QueueItem from './QueueItem.jsx'

function QueueGroup({ label, count, countColor, items, selectedId, agentId, onSelect, collapsed, onToggle }) {
  return (
    <div>
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-[18px] py-2 hover:bg-surface-elevated-2/40 transition-colors"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            size={11}
            className="text-ink-subtle transition-transform"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
          />
          <span className="text-[11px] font-bold text-ink-muted uppercase tracking-[0.06em]">
            {label}
          </span>
        </div>
        <span className="text-[11px] font-bold" style={{ color: countColor }}>
          {count}
        </span>
      </button>

      {!collapsed && items.map(conv => (
        <QueueItem
          key={conv.id}
          conversation={conv}
          agentId={agentId}
          isSelected={conv.id === selectedId}
          onClick={() => onSelect(conv)}
        />
      ))}
    </div>
  )
}

export default function QueueList({ unassigned, mine, all, agentId, selectedId, onSelect, loading }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({ mine: false, unassigned: false, all: true })

  // Build the "all" list excluding items already in mine/unassigned
  const mineIds       = new Set(mine.map(c => c.id))
  const unassignedIds = new Set(unassigned.map(c => c.id))
  const allRest       = all.filter(c => !mineIds.has(c.id) && !unassignedIds.has(c.id))

  // Simple client-side filter
  const q = search.trim().toLowerCase()
  function filterConvs(list) {
    if (!q) return list
    return list.filter(c =>
      (c.opener?.full_name || '').toLowerCase().includes(q) ||
      (c.order_id || '').toLowerCase().includes(q) ||
      (c.subject || '').toLowerCase().includes(q)
    )
  }

  function toggle(key) {
    setCollapsed(s => ({ ...s, [key]: !s[key] }))
  }

  const groups = [
    { key: 'mine',       label: t('queue.mine',       { defaultValue: 'Mine' }),       items: filterConvs(mine),       color: 'var(--color-agent)',    countColor: 'var(--color-agent)' },
    { key: 'unassigned', label: t('queue.unassigned', { defaultValue: 'Unassigned' }), items: filterConvs(unassigned), color: 'var(--color-warning)',  countColor: 'var(--color-warning)' },
    { key: 'all',        label: t('queue.all',         { defaultValue: 'All' }),        items: filterConvs(allRest),    color: 'var(--color-ink-subtle)', countColor: 'var(--color-ink-subtle)' },
  ]

  return (
    <div
      className="flex flex-col shrink-0 border-r border-edge bg-surface-elevated h-full"
      style={{ width: 320 }}
    >
      {/* Header */}
      <div className="px-[18px] pt-[18px] pb-3 border-b border-edge shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] font-bold text-ink" style={{ letterSpacing: '-0.3px' }}>
            {t('queue.title', { defaultValue: 'Conversations' })}
          </h2>
          <Pill color="agent" dot>Live</Pill>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 px-2.5 rounded-[10px] border border-edge bg-surface"
          style={{ height: 36 }}
        >
          <Search size={14} className="text-ink-subtle shrink-0" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('queue.search', { defaultValue: 'Search name or order…' })}
            className="flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-subtle outline-none"
          />
          <kbd className="shrink-0 text-[10px] text-ink-muted bg-surface-high border border-edge rounded px-1 py-px font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-agent border-t-transparent" />
          </div>
        ) : (
          groups.map(g => (
            <QueueGroup
              key={g.key}
              label={g.label}
              count={g.items.length}
              countColor={g.countColor}
              items={g.items}
              selectedId={selectedId}
              agentId={agentId}
              onSelect={onSelect}
              collapsed={collapsed[g.key]}
              onToggle={() => toggle(g.key)}
            />
          ))
        )}
      </div>
    </div>
  )
}
