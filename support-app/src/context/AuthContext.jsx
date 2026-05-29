import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [agentBlocked, setAgentBlocked] = useState(false)
  const [suspended, setSuspended] = useState(null)
  const pushRegistered = useRef(false)

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone, agent_display_name, agent_is_active, suspended_at, suspended_reason')
      .eq('id', userId)
      .single()

    if (data?.suspended_at) {
      setSuspended({ reason: data.suspended_reason || '' })
      setProfile(null)
      await supabase.auth.signOut()
      return
    }

    if (!data || data.role !== 'agent') {
      await supabase.auth.signOut()
      setAgentBlocked(true)
      setProfile(null)
      return
    }

    setSuspended(null)
    setAgentBlocked(false)
    setProfile(data)

    if (!pushRegistered.current) {
      pushRegistered.current = true
      import('../lib/pushInit.js')
        .then(({ registerAgentPush }) => registerAgentPush(userId))
        .catch(() => {})
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) loadProfile(s.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s) {
        setLoading(true)
        loadProfile(s.user.id).finally(() => setLoading(false))
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signOut() {
    if (session) {
      await import('../lib/pushInit.js')
        .then(({ unregisterAgentToken }) => unregisterAgentToken(session.user.id))
        .catch(() => {})
      pushRegistered.current = false
    }
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, agentBlocked, suspended, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
