import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import i18n, { LOCALE_STORAGE_KEY } from '../i18n/index.js'
import { unregisterToken } from '../lib/notifications.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  function syncLocale(prof) {
    if (!prof?.locale) return
    let localChoice
    try { localChoice = localStorage.getItem(LOCALE_STORAGE_KEY) } catch { /* private browsing */ }
    if (localChoice === 'he' || localChoice === 'en') {
      if (prof.locale !== localChoice) {
        supabase.from('profiles').update({ locale: localChoice }).eq('id', prof.id).then(() => {})
      }
      return
    }
    if (prof.locale !== i18n.language) {
      i18n.changeLanguage(prof.locale)
      try { localStorage.setItem(LOCALE_STORAGE_KEY, prof.locale) } catch { /* private browsing */ }
    }
  }

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!data) {
      // handle_new_user trigger is async — retry once after brief delay
      await new Promise(r => setTimeout(r, 500))
      const { data: retry } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (retry) syncLocale(retry)
      setProfile(retry ?? null)
      return retry ?? null
    }

    syncLocale(data)
    setProfile(data)
    return data
  }

  useEffect(() => {
    // Per spec: getSession for initial hydration.
    // Race against a 12s timeout so a silently dropped network request
    // never leaves the app stuck on the loading spinner.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000))
    Promise.race([supabase.auth.getSession(), timeout])
      .then(({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id).finally(() => setLoading(false))
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION is already handled by getSession above
      if (event === 'INITIAL_SESSION') return

      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function signUp(email, password, metadata) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    await unregisterToken()   // must run before signOut clears the session
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
