import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { fetchConversations, fetchClosedConversations } from '../lib/support.js'

export function useAgentQueue(agentId) {
  const [conversations, setConversations] = useState([])
  const [closed, setClosed] = useState([])
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
    // The agent's own resolved/closed history (read-back; see fetchClosedConversations).
    // The same realtime support_conversations subscription reloads this, so a chat
    // moves here the moment it's resolved/closed.
    if (agentId) {
      const { data: closedData } = await fetchClosedConversations(agentId)
      setClosed(closedData ?? [])
    }
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
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const unassigned = conversations.filter(c => !c.assigned_agent_id)
  const mine       = conversations.filter(c => c.assigned_agent_id === agentId)
  const others     = conversations.filter(c => c.assigned_agent_id && c.assigned_agent_id !== agentId)
  const all        = conversations

  return { conversations, unassigned, mine, others, all, closed, loading, fetchError, reload: load }
}
