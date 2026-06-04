import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { initBackButton } from './lib/backButton.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'
import Legal from './pages/Legal.jsx'

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-agent border-t-transparent" />
    </div>
  )
}

// Redirects already-authenticated agents away from the login page.
function RedirectIfAuthed({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (session && profile) return <Navigate to="/" replace />
  return children
}

function RequireAgent({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session || !profile) return <Navigate to="/login" replace />
  return children
}

export function AppRouter() {
  useEffect(() => { initBackButton() }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
        <Route
          path="/"
          element={
            <RequireAgent>
              <Dashboard />
            </RequireAgent>
          }
        />
        <Route
          path="/conversations/:conversationId"
          element={
            <RequireAgent>
              <Dashboard />
            </RequireAgent>
          }
        />
        <Route
          path="/unassigned"
          element={
            <RequireAgent>
              <Dashboard />
            </RequireAgent>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAgent>
              <Settings />
            </RequireAgent>
          }
        />
        <Route
          path="/legal"
          element={
            <RequireAgent>
              <Legal />
            </RequireAgent>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
