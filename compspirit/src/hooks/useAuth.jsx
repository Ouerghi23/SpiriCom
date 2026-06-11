// src/hooks/useAuth.jsx

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Storage helpers ───────────────────────────────────────────────────
const readToken = () =>
  sessionStorage.getItem('spiricomp_token') ||
  localStorage.getItem('spiricomp_token') || null

const readUser = () => {
  const raw = sessionStorage.getItem('spiricomp_user') ||
              localStorage.getItem('spiricomp_user')
  try { return raw ? JSON.parse(raw) : null } catch { return null }
}

const writeSession = (tokenData, persistent = false) => {
  const store = persistent ? localStorage : sessionStorage
  store.setItem('spiricomp_token', tokenData.access_token || '')
  store.setItem('spiricomp_user', JSON.stringify({
    username:  tokenData.username,
    full_name: tokenData.full_name || tokenData.username,
    role:      (tokenData.role || 'engineer').toLowerCase(),
  }))
}

const clearSession = () => {
  ['spiricomp_token', 'spiricomp_user'].forEach(k => {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  })
}

// ── Context ───────────────────────────────────────────────────────────
const AuthContext = createContext(null)

// ── AuthProvider ──────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [token,   setToken]   = useState(readToken)
  const [user,    setUser]    = useState(readUser)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Sync across tabs (e.g. logout in another tab)
  useEffect(() => {
    const onStorage = () => {
      setToken(readToken())
      setUser(readUser())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // ── login ─────────────────────────────────────────────────────────
  const login = useCallback(async (username, password, remember = false) => {
    setLoading(true)
    setError(null)
    try {
      // MUST use URLSearchParams — OAuth2PasswordRequestForm requires
      // application/x-www-form-urlencoded, not JSON
      const form = new URLSearchParams()
      form.append('username', username)
      form.append('password', password)

      const res = await axios.post(`${API}/api/auth/login`, form)

      writeSession(res.data, remember)

      const u = {
        username:  res.data.username,
        full_name: res.data.full_name || res.data.username,
        role:      (res.data.role || 'engineer').toLowerCase(),
      }
      setToken(res.data.access_token)
      setUser(u)
      return true
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  // ── logout ────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearSession()
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── useAuth hook ──────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// ── setupAxiosAuth ────────────────────────────────────────────────────
// Called once in main.jsx before the React tree mounts.
// Attaches Bearer token to every axios request.
// Redirects to /login on 401.
let _interceptorSetUp = false
export function setupAxiosAuth() {
  if (_interceptorSetUp) return
  _interceptorSetUp = true

  axios.interceptors.request.use(config => {
    const token = readToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  axios.interceptors.response.use(
    res => res,
    err => {
      if (err.response?.status === 401) {
        clearSession()
        window.location.href = '/login'
      }
      return Promise.reject(err)
    }
  )
}

export default useAuth