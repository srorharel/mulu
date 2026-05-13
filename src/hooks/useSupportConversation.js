import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { subscribeToConversation } from '../lib/support.js'

export function useSupportConversation(convId) {
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!convId) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setMessages([])
    setConversation(null)

    Promise.all([
      supabase
        .from('support_conversations')
        .select(`
          id, status, subject, order_id, created_at, updated_at,
          opener_last_read_at, counterparty_last_read_at, agent_last_read_at,
          opener_id, counterparty_id, assigned_agent_id,
          opener:profiles!opener_id(id, full_name, role),
          counterparty:profiles!counterparty_id(id, full_name, role),
          agent:profiles!assigned_agent_id(id, full_name, agent_display_name)
        `)
        .eq('id', convId)
        .single(),
      supabase
        .from('support_messages')
        .select(`
          id, conversation_id, sender_id, sender_role, body, attachment_path, created_at,
          sender:profiles!sender_id(id, full_name, role, agent_display_name)
        `)
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true }),
    ]).then(([{ data: conv, error: convErr }, { data: msgs, error: msgsErr }]) => {
      if (cancelled) return
      if (!convErr) setConversation(conv)
      if (!msgsErr) setMessages(msgs ?? [])
      setLoading(false)
    })

    const channel = subscribeToConversation(convId, {
      onMessage: async (newMsg) => {
        if (cancelled) return
        // Enrich the new message with sender profile
        const { data: sender } = await supabase
          .from('profiles')
          .select('id, full_name, role, agent_display_name')
          .eq('id', newMsg.sender_id)
          .single()
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev
          return [...prev, { ...newMsg, sender }]
        })
      },
      onConvUpdate: (updated) => {
        if (cancelled) return
        setConversation(prev => prev ? { ...prev, ...updated } : updated)
      },
    })

    channelRef.current = channel

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [convId])

  return { conversation, messages, loading }
}
