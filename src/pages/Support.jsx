import { useState, useEffect } from 'react'
import { LifeBuoy, Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext.jsx'
import { listMyConversations, createGeneralConversation } from '../lib/support.js'
import PageShell from '../components/ui/PageShell.jsx'
import ConversationListItem from '../components/support/ConversationListItem.jsx'
import SupportChatSheet from '../components/support/SupportChatSheet.jsx'
import ConsumerSupport from './consumer/Support.jsx'

// Washer-facing: lists own support conversations with agents, same system
// as consumer support (support_conversations table, opener_role = 'washer').
function WasherSupport() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeConvId, setActiveConvId] = useState(null)
  const [creating, setCreating] = useState(false)

  function isUnread(conv) {
    if (!conv.last_message_at) return false
    if (conv.opener_id === user?.id) {
      return !conv.opener_last_read_at || new Date(conv.last_message_at) > new Date(conv.opener_last_read_at)
    }
    return !conv.counterparty_last_read_at || new Date(conv.last_message_at) > new Date(conv.counterparty_last_read_at)
  }

  async function load() {
    setLoading(true)
    const { data } = await listMyConversations()
    setConversations(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleNew() {
    setCreating(true)
    const { data, error } = await createGeneralConversation()
    setCreating(false)
    if (error || !data) return
    await load()
    setActiveConvId(data.id)
  }

  return (
    <PageShell>
      <div className="px-0 pt-0 pb-6 flex flex-col h-full">
        <div className="px-5 pt-6 pb-4 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-bold text-ink">{t('support.title')}</h1>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleNew}
            disabled={creating}
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {t('support.newConversation')}
          </motion.button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <LifeBuoy className="h-12 w-12 text-ink-muted/30" />
              <p className="font-semibold text-ink">{t('support.empty')}</p>
              <p className="text-sm text-ink-muted">{t('support.emptyDesc')}</p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleNew}
                disabled={creating}
                className="btn-primary mt-2"
              >
                {t('support.newConversation')}
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-edge">
            {conversations.map(conv => (
              <ConversationListItem
                key={conv.id}
                conversation={conv}
                unread={isUnread(conv)}
                onClick={() => setActiveConvId(conv.id)}
              />
            ))}
          </div>
        )}
      </div>

      <SupportChatSheet
        open={!!activeConvId}
        convId={activeConvId}
        onClose={() => { setActiveConvId(null); load() }}
      />
    </PageShell>
  )
}

// Root: branch on role. Agents use support-app (port 3001), not this page.
export default function Support() {
  const { profile } = useAuth()
  if (profile?.role === 'consumer') return <ConsumerSupport />
  return <WasherSupport />
}
