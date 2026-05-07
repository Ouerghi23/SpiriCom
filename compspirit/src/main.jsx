// src/main.jsx
// Added v7_startTransition and v7_relativeSplatPath future flags to silence
// React Router v6 deprecation warnings (cosmetic — not a functional bug).

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition:    true,
        v7_relativeSplatPath:  true,
      }}
    >
      <App />
    </BrowserRouter>
  </StrictMode>
)