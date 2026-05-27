// src/App.jsx
// ─────────────────────────────────────────────────────────────────────
// Routes:
//   /              → LandingPage   (public)
//   /login         → LoginPage     (public)
//   /dashboard/*   → Layout + pages (protected — requires JWT)
//   /complaint     → redirect to http://localhost:8000/form
// ─────────────────────────────────────────────────────────────────────

import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'

import LandingPage        from './pages/LandingPage'
import LoginPage          from './pages/LoginPage'
import Layout             from './components/Layout'
import Overview           from './pages/Overview'
import ComplaintMap       from './pages/ComplaintMap'
import ComplaintForm      from './pages/ComplaintForm'
import AnomalyFeed        from './pages/AnomalyFeed'
import Forecasting        from './pages/Forecasting'
import RootCauseAnalysis  from './pages/RootCauseAnalysis'
import UserSegments       from './pages/UserSegments'
import NLPAnalysis        from './pages/NLPAnalysis'
import About              from './pages/About'

// ── Protected route wrapper ───────────────────────────────────────────
function Protected({ children }) {
  const { token }  = useAuth()
  const location   = useLocation()
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}
export default function App() {
  const { token } = useAuth()
  const enterDashboard = () => window.location.href = '/dashboard'

  return (
    <Routes>
      {/* ── Public ────────────────────────────────────────────── */}
      <Route path="/"      element={<LandingPage onEnter={enterDashboard} />} />
      <Route path="/login" element={token ? <Navigate to="/dashboard" replace /> : <LoginPage />} />

      {/* ✅ FIX — /form est PUBLIC, hors Layout, hors Protected */}
      <Route path="/form"  element={<ComplaintForm />} />

      {/* ── Protected dashboard ───────────────────────────────── */}
      <Route path="/dashboard" element={<Protected><Layout /></Protected>}>
        <Route index              element={<Overview />} />
        <Route path="map"         element={<ComplaintMap />} />
        {/* ✅ FIX — ligne /form SUPPRIMÉE d'ici */}
        <Route path="anomalies"   element={<AnomalyFeed />} />
        <Route path="forecast"    element={<Forecasting />} />
        <Route path="root-cause"  element={<RootCauseAnalysis />} />
        <Route path="segments"    element={<UserSegments />} />
        <Route path="nlp"         element={<NLPAnalysis />} />
        <Route path="about"       element={<About />} />
      </Route>

      {/* ── Fallback ──────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}