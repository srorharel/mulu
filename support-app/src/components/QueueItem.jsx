import { useTranslation } from 'react-i18next'

const LABEL_STYLES = {
  mine:        'text-accent bg-accent-muted border-accent/30',
  inTreatment: 'text-ink-muted bg-surface border-edge',
  waiting:     'text-amber-600 bg-amber-400/10 border-amber-400/20',
  general:     'text-ink-muted bg-surface border-edge',
}

function getConversationLabel(conversation, agentId) {
  if (conversation.assigned_agent_id === agentId) return 'mine'
  if (conversation.status === 'assigned') return 'inTreatment'
  if (conversation.status === 'pending_agent' || conversation.status === 'open') return 'waiting'
  if (!conversation.order_id) return 'general'
  return null
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
  const unread = conversation.last_message_at && (
    !conversation.agent_last_read_at ||
    new Date(conversation.last_message_at) > new Date(conversation.agent_last_read_at)
  )

  const title = conversation.order_id
    ? t('common.orderLinked', { id: conversation.order_id.slice(0, 8) })
    : (conversation.subject || t('common.general'))

  const label = getConversationLabel(conversation, agentId)

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
        {/* Row 1: name · label pill · timestamp */}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold truncate min-w-0 ${isSelected ? 'text-accent' : 'text-ink'}`}>
            {openerName}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {label && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${LABEL_STYLES[label]}`}>
                {t(`queue.label.${label}`)}
              </span>
            )}
            <span className="text-[11px] text-ink-muted/50">
              {formatRelative(conversation.last_message_at)}
            </span>
          </div>
        </div>

        {/* Row 2: message preview */}
        <p className="text-xs text-ink-muted truncate mt-0.5">{title}</p>
      </div>

      {unread && (
        <div className="shrink-0 h-2 w-2 rounded-full bg-accent mt-2" />
      )}
    </button>
  )
}
