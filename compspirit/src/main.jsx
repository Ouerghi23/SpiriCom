// src/main.jsx
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import './i18n/index.js'
import { StrictMode }                         from 'react'
import { createRoot }                         from 'react-dom/client'
import { BrowserRouter }                      from 'react-router-dom'
import App                                    from './App'
import './index.css'
import { AuthProvider, setupAxiosAuth }       from './hooks/useAuth.jsx'

setupAxiosAuth()   // attach Bearer token to every axios request before any component mounts

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition:   true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)