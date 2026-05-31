import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { useToast } from './components/ui/Toast.jsx'
import { initNotifications } from './lib/notifications.js'
import RoleGuard from './components/RoleGuard.jsx'
import { homeForRole } from './lib/roleHome.js'
import WasherShell from './components/ui/WasherShell.jsx'
import WasherMapShell from './components/ui/WasherMapShell.jsx'

import { lazy, Suspense } from 'react'

import Landing      from './pages/Landing.jsx'
import SignUp       from './pages/SignUp.jsx'
import Login        from './pages/Login.jsx'
import Profile      from './pages/Profile.jsx'
import Support      from './pages/Support.jsx'

const WasherVerify  = lazy(() => import('./pages/washer/Verify.jsx'))
const WasherPending = lazy(() => import('./pages/washer/Pending.jsx'))

function PageSuspense({ children }) {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    }>
      {children}
    </Suspense>
  )
}

import ConsumerHome   from './pages/consumer/Home.jsx'
import OrderTracking  from './pages/consumer/OrderTracking.jsx'
import OrderHistory   from './pages/consumer/OrderHistory.jsx'
import Vehicles         from './pages/consumer/Vehicles.jsx'
import ConsumerSettings from './pages/consumer/Settings.jsx'
import ConsumerLayout   from './components/consumer/ConsumerLayout.jsx'

import WasherDashboard from './pages/washer/Dashboard.jsx'
import JobDetail       from './pages/washer/JobDetail.jsx'
import Earnings        from './pages/washer/Earnings.jsx'
import Shop            from './pages/washer/Shop.jsx'
import Settings        from './pages/washer/Settings.jsx'

// Initialises push notifications once a logged-in user is confirmed.
// Renders nothing — exists only to call hooks inside the BrowserRouter context.
function NotificationsInit() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const showToast = useToast()
  const inited    = useRef(false)

  useEffect(() => {
    if (!user || inited.current) return
    inited.current = true
    initNotifications({ navigate, showToast })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// Redirects authenticated users away from public pages
function AuthRedirect({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return null
  if (!user) return children
  return <Navigate to={homeForRole(profile?.role)} replace />
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
      <NotificationsInit />
      <Routes>
        {/* Public — redirect away if already logged in */}
        <Route path="/"       element={<AuthRedirect><Landing /></AuthRedirect>} />
        <Route path="/signup" element={<AuthRedirect><SignUp /></AuthRedirect>} />
        <Route path="/login"  element={<AuthRedirect><Login /></AuthRedirect>} />

        {/* Washer verification routes — accessible while role=washer regardless of verification status */}
        <Route element={<RoleGuard allowedRoles={['washer']} />}>
          <Route path="/signup/washer/verify"  element={<PageSuspense><WasherVerify /></PageSuspense>} />
          <Route path="/signup/washer/pending" element={<PageSuspense><WasherPending /></PageSuspense>} />
        </Route>

        {/* Consumer-only */}
        <Route element={<RoleGuard allowedRoles={['consumer']} />}>
          <Route element={<ConsumerLayout />}>
            <Route path="/home"              element={<ConsumerHome />} />
            <Route path="/order/:id"         element={<OrderTracking />} />
            <Route path="/history"           element={<OrderHistory />} />
            <Route path="/profile/vehicles"  element={<Vehicles />} />
            <Route path="/profile/settings"  element={<ConsumerSettings />} />
          </Route>
        </Route>

        {/* Washer-only */}
        <Route element={<RoleGuard allowedRoles={['washer']} />}>
          <Route element={<WasherMapShell />}>
            <Route path="/washer" element={<WasherDashboard />} />
          </Route>
          <Route element={<WasherShell />}>
            <Route path="/washer/job/:id"   element={<JobDetail />} />
            <Route path="/washer/earnings"  element={<Earnings />} />
            <Route path="/washer/shop"      element={<Shop />} />
            <Route path="/washer/settings"  element={<Settings />} />
          </Route>
        </Route>

        {/* Unified Support — consumer, washer, and agent all reach /support */}
        <Route element={<RoleGuard allowedRoles={['consumer', 'washer', 'agent']} />}>
          <Route path="/support" element={<Support />} />
        </Route>

        {/* Legacy redirects — old paths point to /support */}
        <Route path="/washer/support"  element={<Navigate to="/support" replace />} />
        <Route path="/agent/approvals" element={<Navigate to="/support" replace />} />

        {/* Any authenticated user */}
        <Route element={<RoleGuard />}>
          <Route path="/profile" element={<Profile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
