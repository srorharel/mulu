import { Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import Pill from './Pill.jsx'

function nameToHue(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function nameInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return i18n.t('time.now')
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function UnassignedRow({ conversation, onClaim }) {
  const { t } = useTranslation()
  const openerName = conversation.opener?.full_name || 'Unknown'
  const openerRole = conversation.opener?.role
  const roleLabel  = openerRole === 'consumer' ? t('role.consumer') : openerRole === 'washer' ? t('role.washer') : null
  const preview    = conversation.last_message_body ?? conversation.subject ?? ''
  const time       = timeAgo(conversation.last_message_at ?? conversation.created_at)
  const hue        = nameToHue(openerName)
  const initials   = nameInitials(openerName) || '?'

  return (
    <div
      className="flex items-center gap-3 px-6 py-4 hover:bg-surface-elevated-2/40 transition-colors"
      data-testid="unassigned-row"
    >
      <div
        className="flex items-center justify-center rounded-full text-white font-bold shrink-0"
        style={{
          width: 40, height: 40, fontSize: 14,
          background: `linear-gradient(135deg, hsl(${hue} 60% 55%), hsl(${(hue + 40) % 360} 55% 35%))`,
        }}
      >
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink truncate">{openerName}</span>
          {roleLabel && (
            <Pill color={openerRole === 'consumer' ? 'accent' : 'subtle'}>
              {roleLabel}
            </Pill>
          )}
          <span className="text-[10.5px] text-ink-subtle ms-auto shrink-0">{time}</span>
        </div>
        {preview ? (
          <p className="text-[12px] text-ink-muted truncate mt-0.5">{preview}</p>
        ) : null}
      </div>

      <button
        onClick={onClaim}
        data-testid="claim-button"
        className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors"
        style={{ color: 'var(--color-agent)', borderColor: 'rgba(63,181,143,0.4)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(63,181,143,0.1)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        {t('unassigned.claim')}
      </button>
    </div>
  )
}

export default function UnassignedView({ conversations, onClaim }) {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-edge shrink-0">
        <div className="flex items-center gap-3">
          <h1
            className="text-[17px] font-bold text-ink"
            style={{ letterSpacing: '-0.3px' }}
          >
            {t('unassigned.title')}
          </h1>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(245,158,11,0.16)', color: 'var(--color-warning)' }}
          >
            {conversations.length}
          </span>
        </div>
        <p className="text-[12px] text-ink-muted mt-1">
          {t('unassigned.subtitle')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-edge">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <Inbox className="h-10 w-10 text-agent/40" />
            <p className="font-semibold text-ink">{t('unassigned.empty')}</p>
            <p className="text-sm text-ink-muted">{t('unassigned.emptySubtitle')}</p>
          </div>
        ) : (
          conversations.map(conv => (
            <UnassignedRow
              key={conv.id}
              conversation={conv}
              onClaim={() => onClaim(conv)}
            />
          ))
        )}
      </div>
    </div>
  )
}
