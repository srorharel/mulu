import { supabase } from './supabase.js'

export async function fetchPendingApprovals() {
  return supabase
    .from('orders')
    .select(`
      id, status, car_type, car_make, car_model, car_year, car_color, car_plate,
      evidence_before_path, evidence_after_path,
      arrival_photo_front, arrival_photo_back, arrival_photo_driver, arrival_photo_passenger,
      completion_photo_front, completion_photo_back, completion_photo_driver, completion_photo_passenger,
      created_at, accepted_at,
      submitted_lat, submitted_lng, submitted_location_at,
      lat, lng, address_label,
      consumer_profile:profiles!consumer_id(full_name),
      washer_profile:profiles!washer_id(id, full_name)
    `)
    .eq('status', 'pending_approval')
    .order('accepted_at', { ascending: false, nullsFirst: false })
}

export async function approveOrder(orderId) {
  return supabase.rpc('transition_order_status', {
    order_id:   orderId,
    new_status: 'completed',
  })
}

export async function declineOrder(orderId, reason) {
  return supabase.rpc('decline_order', {
    p_order_id: orderId,
    p_reason:   reason,
  })
}

export async function getSignedUrl(path) {
  if (!path) return null
  const { data } = await supabase.storage
    .from('job-evidence')
    .createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}
