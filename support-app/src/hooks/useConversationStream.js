import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { fetchMessages } from '../lib/support.js'

export function useConversationStream(convId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!convId) { setMessages([]); setLoading(false); return }

    let cancelled = false
    setLoading(true)
    setMessages([])

    fetchMessages(convId).then(({ data }) => {
      if (!cancelled) { setMessages(data ?? []); setLoading(false) }
    })

    const channel = supabase
      .channel(`agent-conv:${convId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${convId}` },
        async (payload) => {
          if (cancelled) return
          const { data: sender } = await supabase
            .from('profiles')
            .select('id, full_name, role, agent_display_name')
            .eq('id', payload.new.sender_id)
            .single()
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev
            return [...prev, { ...payload.new, sender }]
          })
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      cancelled = true
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    }
  }, [convId])

  return { messages, loading }
}
