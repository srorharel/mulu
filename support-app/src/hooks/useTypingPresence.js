import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

export function useTypingPresence(convId, agentId, agentName) {
  const [typingLabel, setTypingLabel] = useState(null)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!convId || !agentId) return

    const channel = supabase.channel(`typing:${convId}`, {
      config: { presence: { key: agentId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const others = Object.entries(state)
          .filter(([key]) => key !== agentId)
          .flatMap(([, arr]) => arr)
          .filter(p => p.typing)
        setTypingLabel(others.length > 0 ? `${others[0].name || ''}...` : null)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
      setTypingLabel(null)
    }
  }, [convId, agentId])

  function trackTyping(isTyping) {
    channelRef.current?.track({ typing: isTyping, name: agentName || '' })
  }

  return { typingLabel, trackTyping }
}
