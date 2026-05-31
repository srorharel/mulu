// useBrandAsset — pull the active URL for a brand slug from app_branding,
// falling back to the bundled asset when the network is unreachable.
//
// VENDORED COPY for the support-app so it builds standalone on Vercel
// (Root Directory = support-app). The canonical original lives at
// ../../../src/hooks/useBrandAsset.js in the main app; this copy exists because
// the support-app build cannot reach the main app's node_modules to resolve the
// supabase dependency. Keep behaviourally in sync with the original if it
// changes. The default supabase client here is the SUPPORT app's
// (storageKey: wash-support-auth), which is the correct client for this app.
//
// Stale-while-revalidate: cached URL is served on first paint; network refresh
// runs in the background.

import { useEffect, useRef, useState } from 'react'
import { supabase as defaultSupabase } from '../lib/supabase.js'

const STORAGE_PREFIX = 'wash_brand_assets:v1:'

function cacheKey(slug) { return `${STORAGE_PREFIX}${slug}` }

function readCache(slug) {
  try { return localStorage.getItem(cacheKey(slug)) || null } catch { return null }
}
function writeCache(slug, url) {
  try { localStorage.setItem(cacheKey(slug), url) } catch { /* ignore */ }
}

/**
 * @param {string} slug                e.g. 'main_logo'
 * @param {string} fallback            URL of the bundled asset
 * @param {object} [supabase]          supabase client; defaults to support app's
 * @returns {string} the URL to use right now
 */
export default function useBrandAsset(slug, fallback, supabase = defaultSupabase) {
  const cached = readCache(slug)
  const [url, setUrl] = useState(cached || fallback)
  const supabaseRef = useRef(supabase)
  supabaseRef.current = supabase

  useEffect(() => {
    let cancelled = false
    const client = supabaseRef.current
    if (!client || !client.from) {
      // Stub/unconfigured supabase — stick with fallback.
      return () => { cancelled = true }
    }

    async function fetchUrl() {
      try {
        const { data, error } = await client
          .from('app_branding')
          .select('url')
          .eq('slug', slug)
          .maybeSingle()
        if (cancelled) return
        if (error || !data?.url) {
          try { localStorage.removeItem(cacheKey(slug)) } catch { /* ignore */ }
          setUrl(fallback)
          return
        }
        setUrl(prev => (data.url !== prev ? data.url : prev))
        writeCache(slug, data.url)
      } catch {
        // Network unreachable: keep the cached or fallback URL.
      }
    }

    fetchUrl()

    let channel = null
    try {
      channel = client
        .channel(`app-branding:${slug}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'app_branding', filter: `slug=eq.${slug}` },
          () => { fetchUrl() }
        )
        .subscribe()
    } catch { /* Realtime unavailable */ }

    return () => {
      cancelled = true
      if (channel) { try { client.removeChannel(channel) } catch { /* ignore */ } }
    }
  }, [slug, fallback])

  return url
}

// Exposed for tests
export const _internals = { cacheKey, readCache, writeCache }
