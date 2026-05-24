import { supabase } from './supabase.js'

export async function fetchPendingVerifications() {
  return supabase.rpc('get_washer_verifications', { p_status: 'pending_review' })
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
