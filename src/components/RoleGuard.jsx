import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
    </div>
  )
}

export default function RoleGuard({ allowedRoles }) {
  const { user, profile, loading } = useAuth()

  // Initial hydration — never redirect during this window (avoids hard-refresh flicker)
  if (loading) return <Spinner />

  // Not authenticated
  if (!user) return <Navigate to="/login" replace />

  // Authenticated but profile not yet fetched (brief gap after sign-in)
  if (!profile) return <Spinner />

  // Agents belong in the support-app, not here — send to landing
  if (profile.role === 'agent') {
    return <Navigate to="/" replace />
  }

  // Wrong role — send to the user's correct home
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={profile.role === 'washer' ? '/washer' : '/home'} replace />
  }

  return <Outlet />
}
