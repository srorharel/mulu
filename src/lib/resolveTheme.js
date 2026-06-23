// Pure theme-resolution rule shared by useTheme(). Kept dependency-free so it can
// be unit-tested in isolation (src/__tests__/resolveTheme.test.js) without pulling
// in AuthContext / supabase.
//
// DEFAULT FOR EVERYONE IS LIGHT. Dark mode is opt-in only — a user (currently the
// washer, via Settings → Appearance) explicitly sets `display_preference = 'dark'`.
// There is NO role-based dark default anymore. This is the authoritative source;
// do not re-derive the default in onboarding, settings hints, or shell components.
//
// Returns 'light' | 'dark', or null when there's no profile yet so the caller can
// fall back to the cached/system theme during the brief pre-load window (anti-flash).
export function resolveTheme(profile) {
  if (!profile) return null
  if (profile.display_preference === 'dark')  return 'dark'
  if (profile.display_preference === 'light') return 'light'
  return 'light'
}
