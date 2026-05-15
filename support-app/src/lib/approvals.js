import { supabase } from './supabase.js'

export async function fetchPendingApprovals() {
  return supabase
    .from('orders')
    .select(`
      id, status, car_type, car_make, car_model, car_year, car_color, car_plate,
      evidence_before_path, evidence_after_path,
      created_at, updated_at,
      consumer_profile:profiles!consumer_id(full_name),
      washer_profile:profiles!washer_id(id, full_name, last_lat, last_lng, last_location_at)
    `)
    .eq('status', 'pending_approval')
    .order('updated_at', { ascending: false, nullsFirst: false })
}

export async function approveOrder(orderId) {
  return supabase.rpc('transition_order_status', {
    order_id:   orderId,
    new_status: 'completed',
  })
}

export async function getSignedUrl(path) {
  if (!path) return null
  const { data } = await supabase.storage
    .from('job-evidence')
    .createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}
