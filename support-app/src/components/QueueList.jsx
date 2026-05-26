import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ChevronDown, MessageSquareOff, AlertCircle } from 'lucide-react'
import Pill from './Pill.jsx'
import QueueItem from './QueueItem.jsx'

function filterConvs(list, q) {
  if (!q) return list
  return list.filter(c =>
    (c.opener?.full_name || '').toLowerCase().includes(q) ||
    (c.order_id || '').toLowerCase().includes(q) ||
    (c.subject || '').toLowerCase().includes(q)
  )
}

function ItemList({ items, selectedId, agentId, onSelect }) {
  return items.map(conv => (
    <QueueItem
      key={conv.id}
      conversation={conv}
      agentId={agentId}
      isSelected={conv.id === selectedId}
      onClick={() => onSelect(conv)}
    />
  ))
}

// Group header (Assigned — wraps Mine + Others)
function AssignedHeader({ count, collapsed, onToggle }) {
  const { t, i18n } = useTranslation()
  return (
    <button
      data-testid="group-header-assigned"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-[18px] py-2 mt-2 hover:bg-surface-elevated-2/40 transition-colors"
      aria-expanded={!collapsed}
      aria-label={t('queue.assigned')}
    >
      <div className="flex items-center gap-2">
        <ChevronDown
          size={11}
          className="text-ink-subtle transition-transform"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
        />
        <span className={`text-[11px] font-bold text-ink-muted ${i18n.language === 'en' ? 'uppercase tracking-[0.06em]' : 'font-semibold'}`}>
          {t('queue.assigned')}
        </span>
      </div>
      <span className="text-[11px] font-bold text-ink-subtle">{count}</span>
    </button>
  )
}

// Sub-group header inside Assigned (Mine / Others — lower contrast)
function SubGroupHeader({ label, count, countColor, collapsed, onToggle, testId }) {
  const { i18n } = useTranslation()
  return (
    <button
      data-testid={testId}
      onClick={onToggle}
      className="w-full flex items-center justify-between pl-[28px] pr-[18px] py-1.5 hover:bg-surface-elevated-2/40 transition-colors"
      aria-expanded={!collapsed}
      aria-label={label}
    >
      <div className="flex items-center gap-1.5">
        <ChevronDown
          size={10}
          className="text-ink-subtle transition-transform"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
        />
        <span className={`text-[10px] font-bold text-ink-subtle ${i18n.language === 'en' ? 'uppercase tracking-[0.06em]' : 'font-semibold'}`}>
          {label}
        </span>
      </div>
      <span className="text-[10px] font-bold" style={{ color: countColor }}>
        {count}
      </span>
    </button>
  )
}

export default function QueueList({ mine, others, agentId, selectedId, onSelect, loading, fetchError, onRetry }) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({
    assigned: false,
    mine:     false,
    others:   true,
  })

  const q = search.trim().toLowerCase()
  const fMine   = filterConvs(mine, q)
  const fOthers = filterConvs(others, q)

  function toggle(key) {
    setCollapsed(s => ({ ...s, [key]: !s[key] }))
  }

  return (
    <div
      className="flex flex-col shrink-0 border-e border-edge bg-surface-elevated h-full w-full md:w-80"
    >
      {/* Column header */}
      <div className="px-[18px] pt-[18px] pb-3 border-b border-edge shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] font-bold text-ink" style={{ letterSpacing: '-0.3px' }}>
            {t('queue.title')}
          </h2>
          <Pill color="agent" dot>{t('queue.live')}</Pill>
        </div>

        <div
          className="flex items-center gap-2 px-2.5 rounded-[10px] border border-edge bg-surface"
          style={{ height: 36 }}
        >
          <Search size={14} className="text-ink-subtle shrink-0" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('queue.searchPlaceholder')}
            className="flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-subtle outline-none"
          />
          <kbd className="shrink-0 text-[10px] text-ink-muted bg-surface-high border border-edge rounded px-1 py-px font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center h-32" data-testid="queue-loading">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-agent border-t-transparent" />
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center gap-3 h-48 px-6 text-center" data-testid="queue-error">
            <AlertCircle className="h-8 w-8 text-danger/60" />
            <p className="text-sm font-semibold text-danger">{t('queue.errorLoading')}</p>
            <p className="text-xs text-ink-muted font-mono break-all">{fetchError}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-xs font-semibold text-agent hover:underline"
              >
                {t('common.retry')}
              </button>
            )}
          </div>
        ) : mine.length === 0 && others.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-48 px-6 text-center" data-testid="queue-empty">
            <MessageSquareOff className="h-8 w-8 text-ink-subtle/50" />
            <p className="text-sm font-semibold text-ink">{t('queue.empty')}</p>
            <p className="text-xs text-ink-muted">{t('queue.emptySubtitle')}</p>
          </div>
        ) : (
          <>
            {/* Assigned — wraps Mine + Others ────────────────────────── */}
            <div>
              <AssignedHeader
                count={fMine.length + fOthers.length}
                collapsed={collapsed.assigned}
                onToggle={() => toggle('assigned')}
              />

              {!collapsed.assigned && (
                <>
                  {/* Mine sub-group */}
                  <SubGroupHeader
                    testId="group-header-mine"
                    label={t('queue.mine')}
                    count={fMine.length}
                    countColor="var(--color-agent)"
                    collapsed={collapsed.mine}
                    onToggle={() => toggle('mine')}
                  />
                  {!collapsed.mine && (
                    <ItemList
                      items={fMine}
                      selectedId={selectedId}
                      agentId={agentId}
                      onSelect={onSelect}
                    />
                  )}

                  {/* Others sub-group */}
                  <SubGroupHeader
                    testId="group-header-others"
                    label={t('queue.others')}
                    count={fOthers.length}
                    countColor="var(--color-ink-subtle)"
                    collapsed={collapsed.others}
                    onToggle={() => toggle('others')}
                  />
                  {!collapsed.others && (
                    <ItemList
                      items={fOthers}
                      selectedId={selectedId}
                      agentId={agentId}
                      onSelect={onSelect}
                    />
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
