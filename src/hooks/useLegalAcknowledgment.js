import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'

// Roles subject to legal acknowledgment. Agents / super_admins are never gated
// (pending_legal_acknowledgments also returns nothing for them, server-side).
const ACK_ROLES = ['consumer', 'washer']

// Surfaces the legal documents the current user still needs to acknowledge at
// their current version, and lets the caller record an acknowledgment. Re-checks
// when a new version is published (legal_documents realtime INSERT) so a live
// publish surfaces without a reload.
export function useLegalAcknowledgment() {
  const { user, profile } = useAuth()
  const [pending, setPending] = useState([])

  const role = profile?.role
  const eligible = !!user && ACK_ROLES.includes(role)

  const refresh = useCallback(async () => {
    if (!eligible) { setPending([]); return }
    const { data, error } = await supabase.rpc('pending_legal_acknowledgments', { p_user_id: user.id })
    if (!error) setPending(data ?? [])
  }, [eligible, user?.id])

  useEffect(() => { refresh() }, [refresh])

  // Live publish → re-check.
  useEffect(() => {
    if (!eligible) return
    const channel = supabase
      .channel('legal_documents_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'legal_documents' },
        () => refresh()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [eligible, refresh])

  const acknowledge = useCallback(async (docType, version) => {
    const { error } = await supabase.rpc('acknowledge_legal_document', {
      p_doc_type: docType,
      p_version: version,
    })
    // Optimistically drop the acknowledged doc so the queue advances even before
    // the next refresh; a stale realtime refresh won't resurface it (version matches).
    if (!error) setPending(prev => prev.filter(d => d.doc_type !== docType))
    return { error: error ?? null }
  }, [])

  return { pending, acknowledge, refresh }
}
