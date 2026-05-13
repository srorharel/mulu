import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

function countUnread(conversations, userId) {
  return conversations.reduce((acc, conv) => {
    const lastMsg = conv.last_message_at
    if (!lastMsg) return acc

    if (conv.opener_id === userId) {
      const readAt = conv.opener_last_read_at
      if (!readAt || new Date(lastMsg) > new Date(readAt)) return acc + 1
    } else if (conv.counterparty_id === userId) {
      const readAt = conv.counterparty_last_read_at
      if (!readAt || new Date(lastMsg) > new Date(readAt)) return acc + 1
    }
    return acc
  }, 0)
}

export function useSupportUnread() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!user) { setCount(0); return }

    let cancelled = false

    async function fetchAndCount() {
      const { data } = await supabase
        .from('support_conversations')
        .select('id, opener_id, counterparty_id, last_message_at, opener_last_read_at, counterparty_last_read_at, status')
        .or(`opener_id.eq.${user.id},counterparty_id.eq.${user.id}`)
        .neq('status', 'closed')

      if (!cancelled && data) {
        setCount(countUnread(data, user.id))
      }
    }

    fetchAndCount()

    const channel = supabase
      .channel(`support-unread:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_conversations' },
        () => { if (!cancelled) fetchAndCount() },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user])

  return count
}
