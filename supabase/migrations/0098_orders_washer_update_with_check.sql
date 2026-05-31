-- Migration 0098: orders washer UPDATE WITH CHECK (audit HIGH #3)
--
-- ADR-031 (heal): 0002's "orders: washer update assigned" policy has a USING
-- clause but NO WITH CHECK. validate_order_prices is BEFORE INSERT only, so a
-- washer could `supabase.from('orders').update({...})` directly and:
--   • jump status straight to 'completed' (skip the state machine + photos/GPS),
--   • reassign the order to another washer_id, or
--   • otherwise mutate the row outside transition_order_status.
--
-- RLS WITH CHECK sees only the NEW row (not OLD), so it cannot validate the full
-- OLD→NEW transition matrix — that remains the job of transition_order_status
-- (SECURITY DEFINER, owned by postgres → bypasses this policy entirely, so legit
-- accept/advance/cancel RPC calls are unaffected). What WITH CHECK CAN pin on the
-- resulting row, and what this adds:
--   • washer_id = auth.uid()  → a washer can never hand the order to someone else
--                                (no reassignment / hijack).
--   • status ∈ washer-controlled set → blocks a direct jump to 'completed' (the
--                                payout-triggering terminal) or any bogus status.
--
-- The only legitimate DIRECT client write by a washer is the arrival/completion
-- photo columns (JobDrawer.jsx → from('orders').update({arrival_photo_*/completion_photo_*})),
-- which happen while status is en_route / arrived / in_progress and leave
-- washer_id + status unchanged — both pass the new WITH CHECK.
--
-- NOTE: payout_amount / total_price immutability on direct UPDATE is NOT
-- expressible in WITH CHECK (needs OLD); it still relies on routing money writes
-- through definer RPCs. A follow-up could REVOKE UPDATE on those columns or add a
-- guard trigger (see 0096 for the pattern) if direct-write immutability is wanted.
--
-- Idempotent: DROP POLICY IF EXISTS before CREATE. USING clause preserved verbatim
-- from 0002.
-- No inner BEGIN/COMMIT: the runner wraps each file in one transaction
-- (audit finding #7).

DROP POLICY IF EXISTS "orders: washer update assigned" ON public.orders;

CREATE POLICY "orders: washer update assigned"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    washer_id = auth.uid()
    OR (status = 'pending' AND washer_id IS NULL)
  )
  WITH CHECK (
    washer_id = auth.uid()
    AND status IN ('accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval')
  );

NOTIFY pgrst, 'reload schema';
