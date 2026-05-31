// admin-app/src/lib/adminChats.js
//
// READ-ONLY data layer for the admin "Chats" tab. The super_admin can VIEW
// every support conversation (consumer/washer ↔ agent) and its full message
// history, but cannot send, reply, reassign, resolve, close, or delete.
//
// This module intentionally exposes ONLY SELECT queries, two realtime
// SUBSCRIPTIONS, and pure display helpers. There is NO insert/update/delete/
// upsert/rpc-mutation here by design — a reviewer (and the unit test in
// __tests__/adminChats.test.js) should be able to confirm read-only at a
// glance. If you ever need a write path, it does NOT belong in the admin app
// (writes happen in the support app). See ADR-029.
//
// Reads are RLS-gated: migration 0090 added `super_admin reads all
// support_conversations` and `super_admin reads all support_messages` SELECT
// policies; 0079 lets super_admin read every `profiles` row so the FK embeds
// (opener / counterparty / agent / sender names) resolve. A missing SELECT
// policy would surface as a silently-empty list, not an error (see DATABASE.md
// "New super_admin-accessible tables" lesson) — that's why the smoke test
// asserts rows actually return.

import { supabase } from './supabase.js'

// support_conv_status enum (migration 0012).
export const CONVERSATION_STATUSES = ['open', 'pending_agent', 'assigned', 'resolved', 'closed']

// PostgREST FK-embed selects. support_conversations has THREE FKs to profiles
// (opener_id / counterparty_id / assigned_agent_id) so each embed must be
// disambiguated with the `!column` hint — same pattern the support app uses.
export const CONVERSATION_SELECT = `
  id, status, subject, order_id, opener_role,
  last_message_at, last_message_body, created_at, updated_at, closed_at,
  opener_id, counterparty_id, assigned_agent_id,
  opener:profiles!opener_id(id, full_name, role, phone),
  counterparty:profiles!counterparty_id(id, full_name, role),
  agent:profiles!assigned_agent_id(id, full_name, agent_display_name)
`.trim()

export const MESSAGE_SELECT = `
  id, conversation_id, sender_id, sender_role, body, attachment_path, created_at,
  sender:profiles!sender_id(id, full_name, role, agent_display_name)
`.trim()

// ── Reads ────────────────────────────────────────────────────────────────────

// Every conversation, most-recent activity first. nullsFirst:false keeps the
// rare never-messaged threads at the bottom rather than the top.
export async function fetchConversations({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('support_conversations')
    .select(CONVERSATION_SELECT)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// Full chronological history for one conversation.
export async function fetchMessages(convId) {
  const { data, error } = await supabase
    .from('support_messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Resolve a single sender profile — used to enrich a realtime INSERT payload,
// which arrives without the FK embed.
export async function fetchSenderBrief(senderId) {
  if (!senderId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, agent_display_name')
    .eq('id', senderId)
    .single()
  if (error) return null
  return data
}

// ── Realtime subscriptions (read-only listeners) ─────────────────────────────

// List reorders/updates live as conversations change. Returns the channel so
// the caller can supabase.removeChannel(ch) on unmount.
export function subscribeConversations(onChange) {
  return supabase
    .channel('admin-chats-list')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, onChange)
    .subscribe()
}

// New messages in the open conversation appear live while viewing it.
export function subscribeMessages(convId, onInsert) {
  return supabase
    .channel(`admin-chat:${convId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${convId}` },
      onInsert,
    )
    .subscribe()
}

// ── Attachments ──────────────────────────────────────────────────────────────
//
// The `support-attachments` bucket is currently configured PUBLIC, so a public
// URL resolves with no auth and no migration. We deliberately do NOT use a
// signed URL here: there is no super_admin SELECT policy on storage.objects for
// this bucket (only conversation participants + is_agent()), so createSignedUrl
// would fail RLS for a super_admin. See ADR-029 + the report. If the bucket is
// ever flipped to private, a super_admin storage SELECT policy would be needed.
export function attachmentPublicUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from('support-attachments').getPublicUrl(path)
  return data?.publicUrl ?? null
}

// ── Display helpers (pure) ────────────────────────────────────────────────────

export function conversationStatusClass(status) {
  switch (status) {
    case 'open':          return 'bg-warning/10 text-warning border-warning/30'
    case 'pending_agent': return 'bg-warning/10 text-warning border-warning/30'
    case 'assigned':      return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'resolved':      return 'bg-success/10 text-success border-success/30'
    case 'closed':        return 'bg-surface-high text-ink-muted border-edge'
    default:              return 'bg-surface text-ink-muted border-edge'
  }
}

export function roleBadgeClass(role) {
  switch (role) {
    case 'consumer':    return 'bg-success/10 text-success border-success/30'
    case 'washer':      return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'agent':       return 'bg-warning/10 text-warning border-warning/30'
    case 'super_admin': return 'bg-danger/10 text-danger border-danger/30'
    default:            return 'bg-surface text-ink-muted border-edge'
  }
}

// The conversation's primary participant — the opener (consumer or washer).
export function partyOf(conv) {
  return {
    name: conv?.opener?.full_name || '—',
    role: conv?.opener?.role || conv?.opener_role || null,
    id:   conv?.opener_id || null,
  }
}

export function agentNameOf(conv) {
  if (!conv?.assigned_agent_id) return null
  return conv?.agent?.agent_display_name || conv?.agent?.full_name || null
}
