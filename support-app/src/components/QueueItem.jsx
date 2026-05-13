import { useTranslation } from 'react-i18next'

const STATUS_PILLS = {
  pending_agent: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  assigned:      'text-accent bg-accent-muted border-accent/20',
}

function formatRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default function QueueItem({ conversation, agentId, isSelected, onClick }) {
  const { t } = useTranslation()

  const openerName = conversation.opener?.full_name || '—'
  const agentName  = conversation.agent?.agent_display_name || conversation.agent?.full_name || null
  const isAssignedToMe = conversation.assigned_agent_id === agentId
  const unread = conversation.last_message_at && (
    !conversation.agent_last_read_at ||
    new Date(conversation.last_message_at) > new Date(conversation.agent_last_read_at)
  )

  const title = conversation.order_id
    ? t('common.orderLinked', { id: conversation.order_id.slice(0, 8) })
    : (conversation.subject || t('common.general'))

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3.5 text-start transition-colors border-b border-edge ${
        isSelected ? 'bg-accent-muted' : 'hover:bg-surface-elevated/60'
      }`}
    >
      <div className="shrink-0 h-9 w-9 rounded-full bg-surface flex items-center justify-center border border-edge mt-0.5">
        <span className="text-xs font-bold text-ink-muted">
          {openerName.slice(0, 1).toUpperCase()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold truncate ${isSelected ? 'text-accent' : 'text-ink'}`}>
            {openerName}
          </span>
          <span className="text-[11px] text-ink-muted/50 shrink-0">
            {formatRelative(conversation.last_message_at)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-xs text-ink-muted truncate">{title}</span>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
              STATUS_PILLS[conversation.status] || 'text-ink-muted bg-surface border-edge'
            }`}
          >
            {t(`common.${conversation.status}`)}
          </span>
          {isAssignedToMe && (
            <span className="text-[10px] text-accent font-semibold">{t('queue.mine').toLowerCase()}</span>
          )}
        </div>
      </div>

      {unread && (
        <div className="shrink-0 h-2 w-2 rounded-full bg-accent mt-2" />
      )}
    </button>
  )
}
