// src/main.jsx
// Added v7_startTransition and v7_relativeSplatPath future flags to silence
// React Router v6 deprecation warnings (cosmetic — not a functional bug).
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import './i18n/index.js'  
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { AuthProvider, setupAxiosAuth } from './hooks/useAuth.jsx'
setupAxiosAuth()   // attaches token to every axios request


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition:    true,
        v7_relativeSplatPath:  true,
      }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)