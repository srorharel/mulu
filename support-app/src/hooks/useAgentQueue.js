import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { fetchConversations } from '../lib/support.js'

export function useAgentQueue(agentId) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const channelRef = useRef(null)

  async function load() {
    const { data, error } = await fetchConversations()
    if (error) {
      console.error('[useAgentQueue] fetchConversations failed:', error.message, error)
      setFetchError(error.message)
    } else {
      setFetchError(null)
    }
    setConversations(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!agentId) return
    load()

    const channel = supabase
      .channel('agent-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, () => load())
      .subscribe()

    channelRef.current = channel
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [agentId])

  const unassigned = conversations.filter(c => !c.assigned_agent_id)
  const mine       = conversations.filter(c => c.assigned_agent_id === agentId)
  const others     = conversations.filter(c => c.assigned_agent_id && c.assigned_agent_id !== agentId)
  const all        = conversations

  return { conversations, unassigned, mine, others, all, loading, fetchError, reload: load }
}
