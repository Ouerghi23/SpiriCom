// src/App.jsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth }      from './hooks/useAuth'
import { ThemeProvider } from './context/ThemeContext'

import LandingPage       from './pages/LandingPage'
import LoginPage         from './pages/LoginPage'
import Layout            from './components/Layout'
import Overview          from './pages/Overview'
import ComplaintMap      from './pages/ComplaintMap'
import ComplaintForm     from './pages/ComplaintForm'
import AnomalyFeed       from './pages/AnomalyFeed'
import Forecasting       from './pages/Forecasting'
import RootCauseAnalysis from './pages/RootCauseAnalysis'
import UserSegments      from './pages/UserSegments'
import NLPAnalysis       from './pages/NLPAnalysis'
import NOCAssistant      from './pages/NOCAssistant'

// ── Admin pages ───────────────────────────────────────────────────────
import AdminLayout   from './pages/admin/AdminLayout'
import ManageUsers   from './pages/admin/ManageUsers'
import ConfigureAI   from './pages/admin/ConfigureAI'
import MonitorSystem from './pages/admin/MonitorSystem'
import AccessLogs    from './pages/admin/AccessLogs'

// ─────────────────────────────────────────────────────────────────────
//  ROUTE GUARDS
//  All three guards use useAuth() so they always read the LIVE context
//  value — never a stale snapshot from module-level state.
// ─────────────────────────────────────────────────────────────────────

/**
 * Protected — base guard.
 * Any logged-in user (engineer, admin, viewer) can pass.
 * Not-logged-in users are sent to /login with a `from` state so they are
 * redirected back after a successful login.
 */
function Protected({ children }) {
  const { token }  = useAuth()
  const location   = useLocation()
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

/**
 * AdminProtected — admin-only guard.
 * Not logged in → /login
 * Logged in but not admin → /dashboard  (silent redirect; no 403 page)
 */
function AdminProtected({ children }) {
  const { token, user } = useAuth()
  const location        = useLocation()
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  if (user?.role?.toLowerCase() !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

/**
 * EngineerProtected — NOC dashboard guard.
 * Not logged in   → /login
 * Logged in admin → /admin  (admin has their own panel, not the NOC dashboard)
 *
 * BUG-FIX: Admins should never land on /dashboard.  They are redirected
 * here as a safety net in case roleDestination() in LoginPage is bypassed
 * (e.g. direct URL entry, back-button navigation).
 */
function EngineerProtected({ children }) {
  const { token, user } = useAuth()
  const location        = useLocation()
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  if (user?.role?.toLowerCase() === 'admin') return <Navigate to="/admin" replace />
  return children
}

// ─────────────────────────────────────────────────────────────────────
//  APP
// ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { token, user } = useAuth()

  // BUG-FIX (BUG-1 + BUG-3):
  // The /login route previously redirected any logged-in user to /dashboard.
  // That meant admins who refreshed /login would land on /dashboard, then get
  // bounced back to /admin by EngineerProtected — causing a flash redirect.
  //
  // Correct behaviour:
  //   admin  already logged in → /admin
  //   anyone else logged in    → /dashboard
  const loginRedirect = token
    ? <Navigate to={user?.role?.toLowerCase() === 'admin' ? '/admin' : '/dashboard'} replace />
    : <LoginPage />

  return (
    <ThemeProvider>
      <Routes>
        {/* ── Public ──────────────────────────────────────────────────── */}
        <Route path="/"      element={<LandingPage />} />
        <Route path="/login" element={loginRedirect} />

        {/* Public complaint form — no auth required */}
        <Route path="/form"      element={<ComplaintForm />} />
        <Route path="/complaint" element={<Navigate to="/form" replace />} />

        {/* ── NOC Dashboard (engineer / viewer only) ───────────────────── */}
        {/*
          EngineerProtected wraps the entire Layout outlet.
          Admin users are redirected to /admin by the guard — they will
          never see the NOC dashboard pages.
        */}
        <Route
          path="/dashboard"
          element={
            <EngineerProtected>
              <Layout />
            </EngineerProtected>
          }
        >
          <Route index             element={<Overview />} />
          <Route path="map"        element={<ComplaintMap />} />
          <Route path="anomalies"  element={<AnomalyFeed />} />
          <Route path="forecast"   element={<Forecasting />} />
          <Route path="root-cause" element={<RootCauseAnalysis />} />
          <Route path="segments"   element={<UserSegments />} />
          <Route path="nlp"        element={<NLPAnalysis />} />
          <Route path="about"      element={<NOCAssistant />} />
        </Route>

        {/* ── Admin panel (role = admin only) ──────────────────────────── */}
        {/*
          AdminProtected wraps AdminLayout.
          Non-admin users who navigate here directly are silently sent to
          /dashboard — no scary 403 page, just a clean redirect.
        */}
        <Route
          path="/admin"
          element={
            <AdminProtected>
              <AdminLayout />
            </AdminProtected>
          }
        >
          <Route index        element={<Navigate to="/admin/users" replace />} />
          <Route path="users"  element={<ManageUsers />} />
          <Route path="ai"     element={<ConfigureAI />} />
          <Route path="system" element={<MonitorSystem />} />
          <Route path="logs"   element={<AccessLogs />} />
        </Route>

        {/* ── Fallback ─────────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  )
}