import { supabase } from './supabase.js'

// Thin wrappers around the content_reports / content_blocks tables. RLS enforces
// reporter_id / blocker_id = auth.uid(); callers pass the current user's id
// explicitly (they already have it from useAuth) to avoid an extra getUser().

export function reportMessage(row) {
  // row: { reporter_id, reported_user_id, context, order_id, message_id, reason }
  return supabase.from('content_reports').insert(row)
}

export function blockUser(blockerId, blockedId) {
  return supabase.from('content_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId })
}

export function unblockUser(blockerId, blockedId) {
  return supabase.from('content_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId)
}

// Returns a Set of blocked user ids for the current user.
export async function listMyBlocks() {
  const { data } = await supabase.from('content_blocks').select('blocked_id')
  return new Set((data ?? []).map(r => r.blocked_id))
}
