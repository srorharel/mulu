import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'

const STATUS_COLORS = {
  pending_agent: 'text-warning-600 bg-warning-50',
  assigned:      'text-accent bg-accent-muted',
  open:          'text-ink-muted bg-surface-elevated',
  resolved:      'text-success-600 bg-success-50',
  closed:        'text-ink-muted bg-surface-elevated',
}

function formatRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)  return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default function ConversationListItem({ conversation, unread, onClick }) {
  const { t } = useTranslation()
  const { user } = useAuth()

  const isOpener = conversation.opener_id === user?.id
  const otherParty = isOpener
    ? (conversation.counterparty?.full_name || null)
    : (conversation.opener?.full_name || null)

  const agentName = conversation.agent?.agent_display_name
    || conversation.agent?.full_name
    || null

  const title = conversation.subject
    || (conversation.order_id ? t('support.orderLinked', { id: conversation.order_id.slice(0, 8) }) : t('support.general'))

  const subtitle = agentName
    ? agentName
    : t('support.waitingForAgent')

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-elevated/60 transition-colors text-start"
    >
      {/* Avatar */}
      <div className="shrink-0 h-10 w-10 rounded-full bg-accent-muted flex items-center justify-center">
        <span className="text-sm font-bold text-accent">
          {title.slice(0, 1).toUpperCase()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink truncate">{title}</span>
          <span className="text-[11px] text-ink-muted/50 shrink-0">
            {formatRelative(conversation.last_message_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-ink-muted truncate">{subtitle}</span>
          {otherParty && (
            <span className="text-xs text-ink-muted/50 truncate">· {otherParty}</span>
          )}
        </div>
      </div>

      {unread && (
        <div className="shrink-0 h-2 w-2 rounded-full bg-accent" />
      )}
    </button>
  )
}
