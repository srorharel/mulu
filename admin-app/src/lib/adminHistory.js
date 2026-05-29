// admin-app/src/lib/adminHistory.js
//
// Feed reads + undo + best-effort restore wrappers for the History tab.
// The feed is read through the super_admin-gated get_admin_activity_feed RPC
// (the underlying admin_activity_feed view is RLS-locked — see migration 0093).
// Undo goes through admin_undo_change (0094); user restore goes through the
// admin-user-mgmt Edge Function (needs the service role).

import { supabase } from './supabase.js'

// Coarse filter groups shown as pills. `id` is passed straight to the RPC's
// p_entity_type, which matches either the category or a fine entity_type.
export const HISTORY_FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'content',    label: 'Content' },
  { id: 'branding',   label: 'Branding' },
  { id: 'config',     label: 'Config' },
  { id: 'design',     label: 'Design' },
  { id: 'orders',     label: 'Orders' },
  { id: 'users',      label: 'Users' },
  { id: 'broadcasts', label: 'Broadcasts' },
]

export const PAGE_SIZE = 50

// ── Reads ────────────────────────────────────────────────────────────────────

export async function fetchActivityFeed({ limit = PAGE_SIZE, before = null, entityType = null } = {}) {
  const { data, error } = await supabase.rpc('get_admin_activity_feed', {
    p_limit: limit,
    p_before: before,
    p_entity_type: entityType && entityType !== 'all' ? entityType : null,
  })
  if (error) throw error
  return data ?? []
}

export async function fetchDeletionSnapshot(auditId) {
  const { data, error } = await supabase.rpc('admin_get_deletion_snapshot', { p_audit_id: auditId })
  if (error) throw error
  return data  // { user_id, profile, auth_email, already_restored, ... }
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function undoChange(historyId) {
  const { data, error } = await supabase.rpc('admin_undo_change', { p_history_id: historyId })
  if (error) throw error
  return data
}

function edgeUrl(name) {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  return `${base}/functions/v1/${name}`
}

export async function restoreUser({ auditId, email }) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(edgeUrl('admin-user-mgmt'), {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
      'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify({ action: 'restore_user', audit_id: auditId, email }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload?.detail ? `${payload.error}: ${payload.detail}` : (payload?.error ?? `edge_${res.status}`))
  return payload  // detailed restore report
}

// ── Display helpers (exported for unit tests) ─────────────────────────────────

export function isUndoable(entry) {
  return entry?.undoable === true
}

export function isUserDeletion(entry) {
  return entry?.source_table === 'admin_user_audit' && entry?.action === 'delete_user'
}

// An entry is "not reversible" iff it is neither one-click-undoable nor a
// best-effort user restore.
export function isNotReversible(entry) {
  return !isUndoable(entry) && !isUserDeletion(entry)
}

const ENTITY_TYPE_LABEL = {
  content_override:   'content string',
  branding:           'brand asset',
  app_config:         'config knob',
  pricing_config:     'pricing row',
  payout_tier_config: 'payout tier',
  design_override:    'design override',
}

const OVERRIDE_VERB = { create: 'Added', update: 'Changed', delete: 'Removed' }

const ORDER_VERB = {
  force_status:       'Forced order status',
  reassign_washer:    'Reassigned washer',
  override_price:     'Overrode order price',
  replace_photo:      'Replaced order photo',
  admin_create_order: 'Created order',
  cancel:             'Cancelled order',
  force_complete:     'Force-completed order',
}

const USER_VERB = {
  update_profile:       'Edited profile',
  reset_password:       'Reset password',
  suspend:              'Suspended user',
  unsuspend:            'Unsuspended user',
  delete_user:          'Deleted user',
  merge_users:          'Merged users',
  impersonation_issued: 'Issued impersonation token',
  restore_user:         'Restored user',
}

export function actionLabel(entry) {
  if (!entry) return ''
  switch (entry.source_table) {
    case 'admin_change_history':
      return `${OVERRIDE_VERB[entry.action] ?? entry.action} ${ENTITY_TYPE_LABEL[entry.entity_type] ?? ''}`.trim()
    case 'admin_order_audit':
      return ORDER_VERB[entry.action] ?? entry.action
    case 'admin_user_audit':
      return USER_VERB[entry.action] ?? entry.action
    case 'broadcast_notifications':
      return 'Sent broadcast'
    default:
      return entry.action ?? ''
  }
}

// Pull the human-meaningful value out of a full-row snapshot, per entity type,
// for the before→after diff. Returns a short string (or null).
export function extractDisplayValue(entityType, snap) {
  if (!snap) return null
  switch (entityType) {
    case 'content_override':
      return snap.value ?? null
    case 'branding':
      return snap.url ?? null
    case 'app_config':
    case 'design_override':
      // value is jsonb { value: ... }
      return snap.value && typeof snap.value === 'object' ? String(snap.value.value) : (snap.value ?? null)
    case 'pricing_config':
      return `consumer ₪${snap.consumer_price} · washer ₪${snap.worker_price} · platform ₪${snap.platform_fee}`
    case 'payout_tier_config':
      return `₪${snap.payout}`
    default:
      return null
  }
}

export function categoryColor(category) {
  switch (category) {
    case 'content':    return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'branding':   return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'config':     return 'bg-warning/10 text-warning border-warning/30'
    case 'design':     return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'orders':     return 'bg-success/10 text-success border-success/30'
    case 'users':      return 'bg-danger/10 text-danger border-danger/30'
    case 'broadcasts': return 'bg-warning/10 text-warning border-warning/30'
    default:           return 'bg-surface text-ink-muted border-edge'
  }
}
