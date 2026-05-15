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

  // Wrong role — send each role to its correct home
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    if (profile.role === 'agent')  return <Navigate to="/support" replace />
    if (profile.role === 'admin')  return <Navigate to="/support" replace /> // stale data fallback
    if (profile.role === 'washer') return <Navigate to="/washer" replace />
    return <Navigate to="/home" replace />
  }

  return <Outlet />
}
