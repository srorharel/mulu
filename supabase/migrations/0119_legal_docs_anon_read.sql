-- Migration 0119: let logged-out users read published legal documents.
--
-- The signup consent links (Terms of Use + Privacy Policy) are shown on the
-- register screen, where the user is NOT authenticated yet. The viewer calls
-- get_current_legal_document, which was granted to `authenticated` only — so a
-- logged-out tap loaded nothing (and the route itself was auth-gated; see
-- src/router.jsx, now public for /legal/terms + /legal/privacy).
--
-- get_current_legal_document is SECURITY DEFINER and returns ONLY the current
-- published row (is_current), which is public information by nature. Granting
-- EXECUTE to anon is therefore safe and exposes no user data. The function is
-- unchanged (no shape change, no DROP/CREATE) — this is an additive grant only.
-- No inner BEGIN/COMMIT (the runner wraps this file in one transaction).

grant execute on function public.get_current_legal_document(text, text) to anon;

NOTIFY pgrst, 'reload schema';
