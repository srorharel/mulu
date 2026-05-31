import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { homeForRole } from '../lib/roleHome.js'

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
    </div>
  )
}

// Returns a redirect destination for a washer based on their verification status + current path,
// or null if they should be allowed through.
function washerVerificationRedirect(verStatus, pathname) {
  const onPending = pathname.startsWith('/signup/washer/pending')
  const onVerify  = pathname.startsWith('/signup/washer/verify')

  if (onPending || onVerify) {
    // pending_review washers must stay on /pending (not resubmit yet)
    if (verStatus === 'pending_review' && onVerify) return '/signup/washer/pending'
    return null // allow through for all other status+route combos
  }

  // Non-signup routes: apply hard gate
  if (!verStatus || verStatus === 'pending_documents') return '/signup/washer/verify'
  if (verStatus === 'pending_review' || verStatus === 'rejected') return '/signup/washer/pending'
  return null // approved
}

export default function RoleGuard({ allowedRoles }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  // Initial hydration — never redirect during this window (avoids hard-refresh flicker)
  if (loading) return <Spinner />

  // Not authenticated
  if (!user) return <Navigate to="/login" replace />

  // Authenticated but profile not yet fetched (brief gap after sign-in)
  if (!profile) return <Spinner />

  // Washer verification gate — runs before role check so it applies to all washer routes
  if (profile.role === 'washer') {
    const dest = washerVerificationRedirect(profile.washer_verification_status, location.pathname)
    if (dest) return <Navigate to={dest} replace />
  }

  // Wrong role — send each role to its correct home. Unservable roles
  // (super_admin / admin / unknown) go to /profile, never a guarded route that
  // would bounce them back into an infinite redirect loop (blank-page bug).
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={homeForRole(profile.role)} replace />
  }

  return <Outlet />
}

export { washerVerificationRedirect }
