import { supabase } from './supabase.js'

export async function fetchPendingVerifications() {
  return supabase
    .from('washer_verifications')
    .select(`
      id, dealer_number, service_areas, status, rejection_reason,
      submitted_at, reviewed_at,
      id_document_path, liveness_paths, business_license_path,
      washer:washer_id (
        id, full_name, email
      )
    `)
    .eq('status', 'pending_review')
    .order('submitted_at', { ascending: true })
}

export async function getVerificationSignedUrl(path) {
  if (!path) return null
  const { data } = await supabase.storage
    .from('washer-verification')
    .createSignedUrl(path, 600)
  return data?.signedUrl ?? null
}

export async function reviewVerification(verificationId, decision, reason = null) {
  return supabase.rpc('review_washer_verification', {
    p_verification_id: verificationId,
    p_decision:        decision,
    p_reason:          reason,
  })
}
