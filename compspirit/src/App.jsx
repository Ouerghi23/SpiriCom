// src/App.jsx
// FIX: added <Route path="about" element={<About />} />

import { lazy, Suspense, memo } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'

const LandingPage         = lazy(() => import('./pages/LandingPage'))
const Overview            = lazy(() => import('./pages/Overview'))
const ComplaintMap        = lazy(() => import('./pages/ComplaintMap'))
const AnomalyFeed         = lazy(() => import('./pages/AnomalyFeed'))
const Forecasting         = lazy(() => import('./pages/Forecasting'))
const RootCauseAnalysis   = lazy(() => import('./pages/RootCauseAnalysis'))
const UserSegments        = lazy(() => import('./pages/UserSegments'))
const NLPAnalysis         = lazy(() => import('./pages/NLPAnalysis'))
const About               = lazy(() => import('./pages/About'))

const Loader = () => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0F172A' }}>
    <div style={{ display:'flex', gap:6 }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:'#CF0A2C', animation:`_pl 1.2s ${i*.2}s infinite ease-in-out` }} />
      ))}
      <style>{`@keyframes _pl{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  </div>
)

const MemoLanding = memo(({ onEnter }) => <LandingPage onEnter={onEnter} />)

export default function App() {
  const goToDashboard = () => window.location.href = '/dashboard'

  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/"  element={<MemoLanding onEnter={goToDashboard} />} />
        <Route path="/dashboard" element={<Layout />}>
          <Route index            element={<Overview />} />
          <Route path="map"       element={<ComplaintMap />} />
          <Route path="anomalies" element={<AnomalyFeed />} />
          <Route path="forecast"  element={<Forecasting />} />
          <Route path="root-cause"element={<RootCauseAnalysis />} />
          <Route path="segments"  element={<UserSegments />} />
          <Route path="nlp"       element={<NLPAnalysis />} />
          <Route path="about"     element={<About />} />
          <Route path="*"         element={<Navigate to="/dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}