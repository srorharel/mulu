import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import QueueItem from './QueueItem.jsx'

const TABS = ['unassigned', 'mine', 'all']

export default function QueueList({ unassigned, mine, all, agentId, selectedId, onSelect, loading }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('unassigned')

  const list = tab === 'unassigned' ? unassigned : tab === 'mine' ? mine : all
  const counts = { unassigned: unassigned.length, mine: mine.length, all: all.length }

  return (
    <div className="flex flex-col h-full border-e border-edge" style={{ width: 320, minWidth: 280 }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-edge shrink-0">
        <h2 className="font-bold text-ink text-sm">{t('queue.title')}</h2>
        <div className="flex gap-1 mt-2">
          {TABS.map(t_key => (
            <button
              key={t_key}
              onClick={() => setTab(t_key)}
              className={`flex-1 text-[11px] font-semibold py-1 rounded-lg transition-colors ${
                tab === t_key
                  ? 'bg-accent-muted text-accent'
                  : 'text-ink-muted hover:bg-surface-elevated'
              }`}
            >
              {t(`queue.${t_key}`)}
              {counts[t_key] > 0 && (
                <span className="ms-1 opacity-60">({counts[t_key]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
            <p className="text-sm font-semibold text-ink">{t('queue.empty')}</p>
            <p className="text-xs text-ink-muted">{t('queue.emptyDesc')}</p>
          </div>
        ) : (
          list.map(conv => (
            <QueueItem
              key={conv.id}
              conversation={conv}
              agentId={agentId}
              isSelected={conv.id === selectedId}
              onClick={() => onSelect(conv)}
            />
          ))
        )}
      </div>
    </div>
  )
}
