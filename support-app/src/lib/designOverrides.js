// Design-overrides loader for the support-app (cached + realtime).
//
// VENDORED COPY so the support-app builds standalone on Vercel (Root Directory =
// support-app). Canonical original: ../../../src/lib/designOverrides.js in the
// main app. Dependency-free (supabase is passed in) — keep behaviourally in
// sync with the original if it changes.

const STORAGE_PREFIX = 'wash_design_overrides:v1:'

function cacheKey(app) { return `${STORAGE_PREFIX}${app}` }

function readCache(app) {
  try {
    const raw = localStorage.getItem(cacheKey(app))
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function writeCache(app, rows) {
  try { localStorage.setItem(cacheKey(app), JSON.stringify(rows)) } catch { /* private mode */ }
}

// rows → Map<id, {property → value}>
export function rowsToMap(rows) {
  const map = new Map()
  for (const r of rows ?? []) {
    if (!map.has(r.id)) map.set(r.id, {})
    map.get(r.id)[r.property] = r.value?.value
  }
  return map
}

/**
 * Fetch all design overrides for an app. Stale-while-revalidate:
 * synchronously returns the cached map, then refreshes via supabase.
 *
 * @returns Promise<{ map: Map, fromCache: boolean }>
 */
export async function loadDesignOverrides({ supabase, app, onUpdate }) {
  const cached = readCache(app)
  if (cached) onUpdate?.(rowsToMap(cached))

  if (!supabase) return { map: rowsToMap(cached ?? []), fromCache: !!cached }
  try {
    const { data, error } = await supabase
      .from('design_overrides')
      .select('id, property, value')
      .eq('app', app)
    if (error) return { map: rowsToMap(cached ?? []), fromCache: true }
    writeCache(app, data ?? [])
    const map = rowsToMap(data ?? [])
    onUpdate?.(map)
    return { map, fromCache: false }
  } catch {
    return { map: rowsToMap(cached ?? []), fromCache: true }
  }
}

/** Subscribe to realtime updates on design_overrides for an app. Returns an unsubscribe fn. */
export function subscribeDesignOverrides({ supabase, app, onUpdate }) {
  if (!supabase) return () => {}
  let channel = null
  try {
    channel = supabase
      .channel(`design_overrides:${app}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'design_overrides', filter: `app=eq.${app}` },
        () => { loadDesignOverrides({ supabase, app, onUpdate }) }
      )
      .subscribe()
  } catch { /* realtime not available */ }
  return () => {
    if (channel) try { supabase.removeChannel(channel) } catch { /* ignore */ }
  }
}

// Converts an overrides object (e.g. { color: '#fff', padding: 12 }) → a
// React style object. Numeric properties get appropriate units.
export function overridesToStyle(o) {
  if (!o) return undefined
  const style = {}
  if (o.color)         style.color = o.color
  if (o.bg)            style.backgroundColor = o.bg
  if (o.text_size != null)     style.fontSize = `${o.text_size}em`
  if (o.padding != null)       style.padding = `${o.padding}px`
  if (o.border_radius != null) style.borderRadius = `${o.border_radius}px`
  if (o.offset_x != null || o.offset_y != null) {
    style.transform = `translate(${o.offset_x ?? 0}px, ${o.offset_y ?? 0}px)`
  }
  return Object.keys(style).length ? style : undefined
}
