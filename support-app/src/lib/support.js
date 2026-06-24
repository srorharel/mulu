import { supabase } from './supabase.js'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

export async function sendAgentMessage(convId, { body, attachmentPath, agentId }) {
  return supabase
    .from('support_messages')
    .insert({
      conversation_id: convId,
      sender_id:       agentId,
      sender_role:     'agent',
      body:            body || null,
      attachment_path: attachmentPath || null,
    })
    .select('id')
    .single()
}

export async function claimConversation(convId) {
  return supabase.rpc('claim_conversation', { p_conv_id: convId })
}

export async function releaseConversation(convId) {
  return supabase.rpc('release_conversation', { p_conv_id: convId })
}

export async function resolveConversation(convId) {
  return supabase
    .from('support_conversations')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('id', convId)
}

export async function closeConversation(convId) {
  return supabase
    .from('support_conversations')
    .update({ status: 'closed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', convId)
}

export async function markAgentRead(convId) {
  return supabase.rpc('mark_conversation_read', { p_conv_id: convId })
}

// Shared column projection for the agent queue + closed-history lists. Three FKs
// to profiles (opener / counterparty / assigned_agent) must each be disambiguated
// with the `!column` hint.
const CONVERSATION_SELECT = `
  id, status, subject, order_id, opener_role, last_message_at, last_message_body, created_at, updated_at,
  opener_id, counterparty_id, assigned_agent_id,
  opener_last_read_at, counterparty_last_read_at, agent_last_read_at,
  opener:profiles!opener_id(id, full_name, role, phone),
  counterparty:profiles!counterparty_id(id, full_name, role, phone),
  agent:profiles!assigned_agent_id(id, full_name, agent_display_name)
`

// Active queue: conversations still needing / getting agent attention.
export async function fetchConversations() {
  return supabase
    .from('support_conversations')
    .select(CONVERSATION_SELECT)
    .in('status', ['pending_agent', 'assigned'])
    .order('last_message_at', { ascending: false, nullsFirst: false })
}

// An agent's finished conversations — the chats THEY handled and resolved/closed
// (assigned_agent_id = them), so they can read back what was said. RLS already
// lets any agent read these; the composer for a `closed` thread is gated in
// ChatPane. Most-recently-finished first, capped so the history stays bounded.
export async function fetchClosedConversations(agentId) {
  return supabase
    .from('support_conversations')
    .select(CONVERSATION_SELECT)
    .eq('assigned_agent_id', agentId)
    .in('status', ['resolved', 'closed'])
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(100)
}

export async function fetchMessages(convId) {
  return supabase
    .from('support_messages')
    .select(`
      id, conversation_id, sender_id, sender_role, body, attachment_path, created_at,
      sender:profiles!sender_id(id, full_name, role, agent_display_name)
    `)
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
}

export async function fetchOrderDetails(orderId) {
  return supabase
    .from('orders')
    .select(`
      id, status, car_type, service_type, base_price, total_price, created_at,
      address_label, addon_wiper_fluid, addon_tire_pressure, is_underground_parking,
      car_plate, car_make, car_model, car_year, car_color, payout_amount,
      car_photo_front, car_photo_back, car_photo_driver, car_photo_passenger,
      car_photo_1_path, car_photo_2_path,
      consumer:profiles!consumer_id(id, full_name, phone),
      washer:profiles!washer_id(id, full_name, phone, last_lat, last_lng, last_location_at)
    `)
    .eq('id', orderId)
    .single()
}

export async function fetchUserProfile(userId) {
  return supabase
    .from('profiles')
    .select('id, full_name, role, phone, created_at, last_lat, last_lng, last_location_at')
    .eq('id', userId)
    .single()
}

export async function fetchCannedResponses(agentId) {
  return supabase
    .from('support_canned_responses')
    .select('*')
    .or(`agent_id.is.null,agent_id.eq.${agentId}`)
    .order('shortcut')
}

export async function createCannedResponse(agentId, { shortcut, body_he, body_en }) {
  return supabase
    .from('support_canned_responses')
    .insert({ agent_id: agentId, shortcut, body_he, body_en })
    .select()
    .single()
}

export async function deleteCannedResponse(id) {
  return supabase.from('support_canned_responses').delete().eq('id', id)
}

export async function setAgentActive(agentId, isActive) {
  return supabase
    .from('profiles')
    .update({ agent_is_active: isActive })
    .eq('id', agentId)
}

export function validateAttachment(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPG, PNG, and WebP images are allowed'
  if (file.size > MAX_BYTES) return 'Image must be under 5 MB'
  return null
}

export async function uploadAttachment(convId, file) {
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg'
  const path = `${convId}/${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from('support-attachments')
    .upload(path, file, { contentType: file.type })
  if (error) return { data: null, error }
  return { data: { path: data.path }, error: null }
}

export async function getAttachmentSignedUrl(path) {
  const { data } = await supabase.storage
    .from('support-attachments')
    .createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
