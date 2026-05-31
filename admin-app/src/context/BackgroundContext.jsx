import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import {
  fetchPrefs,
  signedBackgroundUrl,
  uploadBackground,
  savePrefs,
  removeBackground,
  OPACITY_DEFAULT,
} from '../lib/adminBackground.js'

// Personal-background state for the signed-in super_admin. Loads the admin's own
// `admin_background_prefs` row + a signed URL for the private object, exposes
// live-preview setters used by the Appearance settings page, and refreshes the
// signed URL before it expires. The fetch is scoped to `profile.id` (== auth.uid),
// and RLS scopes it again — an admin can only ever load their own preference.
const BackgroundContext = createContext(null)

// 1h signed URL; refresh ~5 min early so the CSS layer never points at an
// expired URL (stale-while-revalidate, like the other loaders).
const SIGNED_TTL = 3600
const REFRESH_MS = (SIGNED_TTL - 300) * 1000

export function BackgroundProvider({ children }) {
  const { profile } = useAuth()
  const userId = profile?.id ?? null

  const [prefs, setPrefs] = useState(null)        // { image_path, opacity, enabled } | null
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const refreshTimer = useRef(null)

  // Derived view consumed by the shell layer + settings page.
  const imagePath = prefs?.image_path ?? null
  const opacity   = prefs?.opacity ?? OPACITY_DEFAULT
  const enabled   = prefs?.enabled !== false

  // (Re)resolve the signed URL for a given storage path.
  const resolveUrl = useCallback(async (path) => {
    if (!path) { setImageUrl(null); return }
    setImageUrl(await signedBackgroundUrl(path, SIGNED_TTL))
  }, [])

  // Initial load whenever the signed-in admin changes.
  useEffect(() => {
    let cancelled = false
    if (!userId) { setPrefs(null); setImageUrl(null); return }
    setLoading(true)
    fetchPrefs(userId)
      .then(async (row) => {
        if (cancelled) return
        setPrefs(row)
        await resolveUrl(row?.image_path ?? null)
      })
      .catch(() => { if (!cancelled) { setPrefs(null); setImageUrl(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, resolveUrl])

  // Refresh the signed URL before it expires while an image is set.
  useEffect(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current)
    if (!imagePath) return undefined
    refreshTimer.current = setInterval(() => { resolveUrl(imagePath) }, REFRESH_MS)
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
  }, [imagePath, resolveUrl])

  // ── Mutations used by the Appearance settings page ─────────────────────────

  // Live preview only — DB persistence is debounced by the caller.
  const setOpacityLive = useCallback((next) => {
    setPrefs((p) => ({ enabled: true, image_path: null, ...(p ?? {}), opacity: next }))
  }, [])

  const persistOpacity = useCallback(async (next) => {
    if (!userId) return
    setPrefs(await savePrefs({ userId, image_path: imagePath, opacity: next, enabled }))
  }, [userId, imagePath, enabled])

  const setEnabled = useCallback(async (next) => {
    if (!userId) return
    setPrefs(await savePrefs({ userId, image_path: imagePath, opacity, enabled: next }))
  }, [userId, imagePath, opacity])

  const upload = useCallback(async (file) => {
    if (!userId) return
    const path = await uploadBackground({ userId, file })
    setPrefs(await savePrefs({ userId, image_path: path, opacity, enabled: true }))
    await resolveUrl(path)
  }, [userId, opacity, resolveUrl])

  const remove = useCallback(async () => {
    if (!userId) return
    await removeBackground({ userId, image_path: imagePath })
    setPrefs((p) => ({ enabled: true, opacity: OPACITY_DEFAULT, ...(p ?? {}), image_path: null }))
    setImageUrl(null)
  }, [userId, imagePath])

  const value = {
    prefs, loading,
    imageUrl, imagePath, opacity, enabled,
    setOpacityLive, persistOpacity, setEnabled, upload, remove,
  }
  return <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>
}

// Returns null when no provider is mounted (e.g. isolated component tests) so
// consumers can safely fall back to the plain default background.
export function useAdminBackground() {
  return useContext(BackgroundContext)
}
