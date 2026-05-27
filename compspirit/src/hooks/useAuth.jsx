// src/hooks/useAuth.js
// ─────────────────────────────────────────────────────────────────────
// JWT auth hook — stores token in sessionStorage (cleared on tab close).
// Use localStorage instead if you want persistence across browser restarts.
// ─────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const KEY = 'spiricomp_token'
const USER_KEY = 'spiricomp_user'

// ── Provider ──────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(KEY))
  const [user,  setUser]  = useState(() => {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const login = useCallback(async (username, password) => {
    setLoading(true)
    setError(null)
    try {
      // FastAPI OAuth2 expects form-encoded body
      const form = new URLSearchParams({ username, password })
      const res  = await axios.post(`${API}/api/auth/login`, form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const { access_token, ...userInfo } = res.data
      sessionStorage.setItem(KEY,      access_token)
      sessionStorage.setItem(USER_KEY, JSON.stringify(userInfo))
      setToken(access_token)
      setUser(userInfo)
      return true
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// ── Axios interceptor — attach token to every request ─────────────────
// Call this once in main.jsx after AuthProvider is mounted.
export function setupAxiosAuth() {
  axios.interceptors.request.use(config => {
    const token = sessionStorage.getItem(KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // Auto-logout on 401
  axios.interceptors.response.use(
    res => res,
    err => {
      if (err.response?.status === 401) {
        sessionStorage.removeItem(KEY)
        sessionStorage.removeItem(USER_KEY)
        window.location.href = '/login'
      }
      return Promise.reject(err)
    }
  )
}