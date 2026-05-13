import { supabase } from './supabase.js'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

async function myProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (error) throw error
  return data
}

export async function getOrCreateOrderConversation(orderId, counterpartyId = null) {
  const profile = await myProfile()

  const { data: existing } = await supabase
    .from('support_conversations')
    .select('id, status')
    .eq('order_id', orderId)
    .eq('opener_id', profile.id)
    .neq('status', 'closed')
    .maybeSingle()

  if (existing) return { data: existing, error: null }

  return supabase
    .from('support_conversations')
    .insert({
      opener_id:       profile.id,
      opener_role:     profile.role,
      order_id:        orderId,
      counterparty_id: counterpartyId || null,
    })
    .select('id, status')
    .single()
}

export async function createGeneralConversation(subject = null) {
  const profile = await myProfile()

  return supabase
    .from('support_conversations')
    .insert({
      opener_id:   profile.id,
      opener_role: profile.role,
      subject:     subject || null,
    })
    .select('id, status')
    .single()
}

export async function sendMessage(convId, { body, attachmentPath }) {
  const profile = await myProfile()

  return supabase
    .from('support_messages')
    .insert({
      conversation_id: convId,
      sender_id:       profile.id,
      sender_role:     profile.role,
      body:            body || null,
      attachment_path: attachmentPath || null,
    })
    .select('id')
    .single()
}

// Returns { channel } — caller is responsible for calling supabase.removeChannel(channel)
export function subscribeToConversation(convId, { onMessage, onConvUpdate } = {}) {
  const channel = supabase
    .channel(`support-conv:${convId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${convId}` },
      payload => onMessage?.(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'support_conversations', filter: `id=eq.${convId}` },
      payload => onConvUpdate?.(payload.new),
    )
    .subscribe()

  return channel
}

export async function markRead(convId) {
  return supabase.rpc('mark_conversation_read', { p_conv_id: convId })
}

export function validateAttachment(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Only JPG, PNG, and WebP images are allowed'
  }
  if (file.size > MAX_BYTES) {
    return 'Image must be under 5 MB'
  }
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
  const { data, error } = await supabase.storage
    .from('support-attachments')
    .createSignedUrl(path, 3600) // 1-hour TTL
  if (error) return null
  return data?.signedUrl ?? null
}

export async function listMyConversations() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: null }

  const { data, error } = await supabase
    .from('support_conversations')
    .select(`
      id, status, subject, order_id, last_message_at, created_at,
      opener_id, counterparty_id,
      opener_last_read_at, counterparty_last_read_at,
      opener:profiles!opener_id(id, full_name),
      counterparty:profiles!counterparty_id(id, full_name),
      agent:profiles!assigned_agent_id(id, full_name, agent_display_name)
    `)
    .or(`opener_id.eq.${user.id},counterparty_id.eq.${user.id}`)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })

  return { data: data ?? [], error }
}
