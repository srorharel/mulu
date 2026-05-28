// Shared content-overrides loader for all three apps (main, support, admin).
//
// CANONICAL HOME: this file lives in the main app's src/lib/. The support-app
// and admin-app import it via relative path:
//   support-app/src/i18n/index.js   →  ../../../src/lib/contentOverrides.js
//   admin-app/src/i18n/index.js     →  ../../../src/lib/contentOverrides.js
// Both peer apps' vite.config.js has `server.fs.allow: ['..']` so the dev
// server can resolve a file outside the project root. Vite production builds
// (and Vercel) don't have that restriction.
//
// Why not three copies kept in sync? The override semantics are subtle (deep
// merge, cache versioning, realtime invalidation). Drift between copies
// would silently degrade the override system on whichever app fell behind.
// One home is worth the extra fs.allow line.

const STORAGE_PREFIX = 'wash_content_overrides:v1:'

function rowsToBundle(rows) {
  const out = {}
  for (const { key, value } of rows) {
    const parts = key.split('.')
    let cur = out
    for (let i = 0; i < parts.length - 1; i += 1) {
      const p = parts[i]
      if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {}
      cur = cur[p]
    }
    cur[parts[parts.length - 1]] = value
  }
  return out
}

function cacheKey(app, locale) {
  return `${STORAGE_PREFIX}${app}:${locale}`
}

function readCache(app, locale) {
  try {
    const raw = localStorage.getItem(cacheKey(app, locale))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.bundle) return null
    return parsed
  } catch { return null }
}

function writeCache(app, locale, bundle, version) {
  try {
    localStorage.setItem(cacheKey(app, locale), JSON.stringify({ bundle, version }))
  } catch { /* private browsing */ }
}

function applyBundle(i18n, locale, bundle) {
  if (!bundle || Object.keys(bundle).length === 0) return
  // (lng, ns, resources, deep, overwrite)
  i18n.addResourceBundle(locale, 'translation', bundle, true, true)
}

/**
 * Load overrides for `(app, locale)`, merge them onto the bundled i18next
 * resources via `addResourceBundle`. Non-blocking: applies cached overrides
 * synchronously (stale-while-revalidate), then refreshes from the DB in the
 * background.
 *
 * @param {object} args
 * @param {object} args.supabase  the supabase client to use
 * @param {'main'|'support'|'admin'} args.app
 * @param {string} args.locale
 * @param {object} args.i18n      an i18next instance
 */
export async function loadOverrides({ supabase, app, locale, i18n }) {
  if (!supabase || !i18n || !locale) return { applied: false, reason: 'missing-args' }

  // 1. Apply cached bundle immediately so existing users see their overrides
  //    without waiting for the network.
  const cached = readCache(app, locale)
  if (cached) applyBundle(i18n, locale, cached.bundle)

  // 2. Refresh from DB in the background. Failures are non-fatal; the cache
  //    or the static bundle is used.
  try {
    const { data, error } = await supabase
      .from('content_overrides')
      .select('key, value, updated_at')
      .eq('app', app)
      .eq('locale', locale)
    if (error) return { applied: !!cached, reason: 'fetch-error', error }

    const bundle = rowsToBundle(data ?? [])
    applyBundle(i18n, locale, bundle)
    // Version stamp = max updated_at across rows, so a cache-bust is easy.
    const version = data?.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '') ?? ''
    writeCache(app, locale, bundle, version)
    return { applied: true, count: data?.length ?? 0 }
  } catch (err) {
    return { applied: !!cached, reason: 'exception', error: err }
  }
}

/**
 * Wire `i18n.on('languageChanged', ...)` to re-load overrides on language
 * switch, and subscribe to Realtime updates on `content_overrides` so admin
 * edits propagate to live sessions without a refresh.
 *
 * Idempotent: safe to call once per app boot. Returns an unsubscribe fn.
 */
export function subscribeContentOverrides({ supabase, app, i18n }) {
  if (!supabase || !i18n) return () => {}

  const refresh = (locale) => loadOverrides({ supabase, app, locale, i18n })

  const onLang = (lng) => { refresh(lng) }
  i18n.on('languageChanged', onLang)

  let channel = null
  try {
    channel = supabase
      .channel(`content_overrides:${app}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'content_overrides', filter: `app=eq.${app}` },
        (payload) => {
          const row = payload.new ?? payload.old
          if (row?.locale) refresh(row.locale)
        }
      )
      .subscribe()
  } catch { /* Realtime not available */ }

  return () => {
    i18n.off('languageChanged', onLang)
    if (channel) {
      try { supabase.removeChannel(channel) } catch { /* ignore */ }
    }
  }
}

// Exposed for tests
export const _internals = { rowsToBundle, cacheKey, readCache, writeCache }
