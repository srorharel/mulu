import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

function nameToHue(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function formatRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return i18n.t('time.now')
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function getConversationRole(conversation) {
  return conversation.opener?.role || conversation.opener_role || null
}

export default function QueueItem({ conversation, agentId, isSelected, onClick }) {
  const { t } = useTranslation()
  const openerName = conversation.opener?.full_name || '—'
  const role       = getConversationRole(conversation)

  const hasUnread = conversation.last_message_at && (
    !conversation.agent_last_read_at ||
    new Date(conversation.last_message_at) > new Date(conversation.agent_last_read_at)
  )
  const unreadCount = conversation.unread_count ?? (hasUnread ? 1 : 0)

  const preview = conversation.last_message_body ?? conversation.subject ?? ''

  const hue = nameToHue(openerName)
  const initials = openerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')

  const roleLabel = role === 'consumer' ? t('role.consumer') : role === 'washer' ? t('role.washer') : null

  const assignedAgent = conversation.assigned_agent_id && conversation.assigned_agent_id !== agentId
    ? (conversation.agent?.agent_display_name || conversation.agent?.full_name || null)
    : null

  const roleColor = role === 'washer'
    ? '#A78BFA'
    : role === 'consumer'
      ? 'var(--color-accent)'
      : 'var(--color-ink-muted)'

  return (
    <button
      onClick={onClick}
      className="w-full text-start relative transition-colors"
      style={{
        margin: '0 8px 2px',
        width: 'calc(100% - 16px)',
        padding: '10px 12px',
        borderRadius: 10,
        background: isSelected ? 'var(--color-agent-soft)' : 'transparent',
        border: isSelected
          ? '1px solid rgba(63,181,143,0.3)'
          : '1px solid transparent',
        display: 'flex',
        gap: 11,
        alignItems: 'flex-start',
      }}
    >
      {/* Left strip on selected */}
      {isSelected && (
        <span
          className="absolute rounded-r-sm"
          style={{
            left: -8, top: '20%', bottom: '20%',
            width: 3, background: 'var(--color-agent)',
          }}
          aria-hidden
        />
      )}

      {/* Avatar */}
      <div
        className="flex items-center justify-center rounded-full text-white font-bold shrink-0"
        style={{
          width: 36, height: 36, fontSize: 13,
          background: `linear-gradient(135deg, hsl(${hue} 50% 55%), hsl(${(hue + 40) % 360} 50% 35%))`,
        }}
      >
        {initials || '?'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: name + time */}
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-ink truncate flex-1">
            {openerName}
          </span>
          <span className="text-[10.5px] text-ink-subtle shrink-0">
            {formatRelative(conversation.last_message_at)}
          </span>
        </div>

        {/* Row 2: role pill (+ urgent) */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {roleLabel && (
            <span
              className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{
                color: roleColor,
                background: `${roleColor}1f`,
                letterSpacing: '0.04em',
              }}
            >
              {roleLabel}
            </span>
          )}
          {assignedAgent && (
            <span className="text-[9.5px] text-ink-subtle truncate">
              {assignedAgent}
            </span>
          )}
          {conversation.urgent && (
            <AlertTriangle
              size={11}
              className="text-danger shrink-0"
              aria-label={t('queue.urgent')}
            />
          )}
        </div>

        {/* Row 3: preview */}
        <p className="text-[12px] text-ink-muted mt-1.5 truncate leading-none">
          {preview || <span className="italic text-ink-subtle">{t('queue.noMessages')}</span>}
        </p>
      </div>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span
          className="absolute bottom-2.5 end-3 flex items-center justify-center rounded-full font-bold text-[10.5px] shrink-0"
          style={{
            minWidth: 18, height: 18, padding: '0 5px',
            background: isSelected ? 'var(--color-agent)' : 'var(--color-accent)',
            color: isSelected ? '#fff' : 'var(--color-surface)',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
