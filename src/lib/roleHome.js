// Single source of truth for "where does a role land in the MAIN app".
//
// Roles the main app actually serves get their real home. Any role the main app
// CANNOT serve — `super_admin` (belongs to the admin console), the legacy
// `admin`, or an unknown value — must land on a TERMINAL route that renders for
// ANY authenticated user, never a role-guarded route that would re-reject it.
//
// Sending an unservable role to a guarded route (e.g. /home, which is
// consumer-only) makes RoleGuard bounce it straight back → an infinite redirect
// loop that renders nothing = the "white page after logging in with the wrong
// user" bug. /profile is wrapped by <RoleGuard /> with no allowedRoles, so it
// always renders and exposes a Sign-out button (the recovery path).
//
// We deliberately do NOT sign these users out: a super_admin needs a live
// main-app session for the design editor (?design_edit=1 + RLS-gated writes).
export const FALLBACK_HOME = '/profile'

export function homeForRole(role) {
  switch (role) {
    case 'consumer': return '/home'
    case 'washer':   return '/washer'
    case 'agent':    return '/support'
    // Not-yet-loaded role → consumer default so a momentarily-null profile isn't
    // bounced off /home (RoleGuard shows a spinner until the profile resolves).
    case undefined:
    case null:
    case '':         return '/home'
    // super_admin, admin, and anything unexpected → terminal, never loops.
    default:         return FALLBACK_HOME
  }
}
