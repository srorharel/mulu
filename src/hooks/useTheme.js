import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import { resolveTheme } from '../lib/resolveTheme.js'

const CACHE_KEY = 'wash_theme_cache'

export function useTheme() {
  const { user, profile, refreshProfile } = useAuth()

  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const resolved   = resolveTheme(profile)
  const cached     = typeof window !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null
  const theme      = resolved ?? cached ?? (systemDark ? 'dark' : 'light')
  const isDark     = theme === 'dark'

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(CACHE_KEY, theme)
  }, [theme])

  async function setTheme(newTheme) {
    if (!user) return { error: null }
    const { error } = await supabase
      .from('profiles')
      .update({ display_preference: newTheme })
      .eq('id', user.id)
    if (!error) await refreshProfile()
    return { error }
  }

  return { isDark, theme, setTheme }
}
