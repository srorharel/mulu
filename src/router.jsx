import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import RoleGuard from './components/RoleGuard.jsx'
import WasherShell from './components/ui/WasherShell.jsx'
import WasherMapShell from './components/ui/WasherMapShell.jsx'

import Landing      from './pages/Landing.jsx'
import SignUp       from './pages/SignUp.jsx'
import Login        from './pages/Login.jsx'
import Profile      from './pages/Profile.jsx'

import ConsumerHome   from './pages/consumer/Home.jsx'
import OrderTracking  from './pages/consumer/OrderTracking.jsx'
import OrderHistory   from './pages/consumer/OrderHistory.jsx'

import WasherDashboard from './pages/washer/Dashboard.jsx'
import JobDetail       from './pages/washer/JobDetail.jsx'
import ActiveJob       from './pages/washer/ActiveJob.jsx'
import Earnings        from './pages/washer/Earnings.jsx'
import Shop            from './pages/washer/Shop.jsx'
import Support         from './pages/washer/Support.jsx'
import Settings        from './pages/washer/Settings.jsx'

// Redirects authenticated users away from public pages
function AuthRedirect({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return null
  if (!user) return children
  return <Navigate to={profile?.role === 'washer' ? '/washer' : '/home'} replace />
}

export function AppRouter() {
  // Fix A: ensure there is always a history entry behind the current one so
  // back-gesture from the root authenticated page doesn't exit the app.
  useEffect(() => {
    if (window.history.length === 1) {
      window.history.pushState({ sentinel: true }, '', window.location.href)
    }
  }, [])

  // When the user backs onto the sentinel entry, immediately re-push the
  // current URL so they stay on the page. Visually nothing changes.
  useEffect(() => {
    const handler = (e) => {
      if (e.state?.sentinel) {
        window.history.pushState(null, '', window.location.href)
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public — redirect away if already logged in */}
        <Route path="/"       element={<AuthRedirect><Landing /></AuthRedirect>} />
        <Route path="/signup" element={<AuthRedirect><SignUp /></AuthRedirect>} />
        <Route path="/login"  element={<AuthRedirect><Login /></AuthRedirect>} />

        {/* Consumer-only */}
        <Route element={<RoleGuard allowedRoles={['consumer']} />}>
          <Route path="/home"       element={<ConsumerHome />} />
          <Route path="/order/:id"  element={<OrderTracking />} />
          <Route path="/history"    element={<OrderHistory />} />
        </Route>

        {/* Washer-only — two layout shells:
            WasherMapShell: full-bleed map (Dashboard only, no BottomNav)
            WasherShell:    standard layout (remaining washer pages via PageShell) */}
        <Route element={<RoleGuard allowedRoles={['washer']} />}>
          <Route element={<WasherMapShell />}>
            <Route path="/washer" element={<WasherDashboard />} />
          </Route>
          <Route element={<WasherShell />}>
            <Route path="/washer/job/:id"    element={<JobDetail />} />
            <Route path="/washer/active/:id" element={<ActiveJob />} />
            <Route path="/washer/earnings"   element={<Earnings />} />
            <Route path="/washer/shop"       element={<Shop />} />
            <Route path="/washer/support"    element={<Support />} />
            <Route path="/washer/settings"   element={<Settings />} />
          </Route>
        </Route>

        {/* Any authenticated user */}
        <Route element={<RoleGuard />}>
          <Route path="/profile" element={<Profile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
