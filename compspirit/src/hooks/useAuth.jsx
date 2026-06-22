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

  // ── applySession ──────────────────────────────────────────────────
  // Applique un token DÉJÀ obtenu (register, guest) au state du contexte
  // ET au storage. Sans ça, signup/guest n'écrivaient que dans le storage
  // et le state (token/user) restait null dans l'onglet courant — le
  // listener `storage` ne se déclenche que pour les AUTRES onglets.
  const applySession = useCallback((tokenData, persistent = false) => {
    writeSession(tokenData, persistent)
    setToken(tokenData.access_token || '')
    setUser({
      username:  tokenData.username,
      full_name: tokenData.full_name || tokenData.username,
      role:      (tokenData.role || 'engineer').toLowerCase(),
    })
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

      applySession(res.data, remember)
      return true
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }, [applySession])

  // ── logout ────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearSession()
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, applySession, logout, loading, error }}>
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
    response => response,
    error => {
      if (
        error.response?.status === 401 &&
        !error.config?.url?.includes('/api/auth/login')
      ) {
        clearSession()
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }
  )
}

export default useAuth