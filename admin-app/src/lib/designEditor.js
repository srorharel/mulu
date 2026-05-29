// admin-app/src/lib/designEditor.js
//
// Thin RPC wrappers + manifest helpers for the admin DesignEditor page.

import { supabase } from './supabase.js'
import manifest from '../data/editableManifest.json'

export const MANIFEST = manifest

export async function fetchAllDesignOverrides() {
  const { data, error } = await supabase
    .from('design_overrides')
    .select('id, app, property, value, updated_at, updated_by, editor:updated_by(full_name)')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function setOverride({ app, id, property, value }) {
  const { error } = await supabase.rpc('admin_set_design_override', {
    p_app: app, p_id: id, p_property: property, p_value: { value },
  })
  if (error) throw error
}

export async function clearOverride({ app, id, property }) {
  const { error } = await supabase.rpc('admin_clear_design_override', {
    p_app: app, p_id: id, p_property: property,
  })
  if (error) throw error
}

export async function resetAllOverrides() {
  const { data, error } = await supabase.rpc('admin_reset_all_design_overrides')
  if (error) throw error
  return data
}

// Build a one-time edit URL for the registered surface. The browser session
// flips into edit mode on the first request; ?design_edit=1 is set by the
// surface URL the admin opens.
export function buildEditUrl(app, screenHint) {
  const base = app === 'main'
    ? (import.meta.env.VITE_MAIN_APP_URL || window.location.origin.replace(':3002', ':3000'))
    : (import.meta.env.VITE_SUPPORT_APP_URL || window.location.origin.replace(':3002', ':3001'))
  // Route prefix is left to the admin to refine — we drop them at the root
  // with the design_edit flag and they navigate from there. The screen hint
  // is purely informational.
  void screenHint
  return `${base}/?design_edit=1`
}

// Group manifest entries by app+screen for display in SurfacePicker.
export function groupedManifest() {
  const out = {}
  for (const s of MANIFEST.surfaces) {
    out[s.app] ??= {}
    out[s.app][s.screen] ??= []
    out[s.app][s.screen].push(s)
  }
  return out
}
