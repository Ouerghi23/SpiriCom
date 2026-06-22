// src/hooks/useRole.jsx
import { useMemo }  from 'react'
import { useAuth }  from './useAuth.jsx'

const TOKEN_KEY = 'spiricomp_token'

function readRoleFromToken() {
  try {
    const token =
      sessionStorage.getItem(TOKEN_KEY) ||
      localStorage.getItem(TOKEN_KEY)
    if (!token) return null
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    )
    return payload?.role ?? null
  } catch { return null }
}

export function useRole() {
  // ← useAuth is the single source of truth (reactive React state)
  const { user: authUser } = useAuth()

  return useMemo(() => {
    // authUser is reactive — updates immediately on login/logout
    // readRoleFromToken is a fallback for components outside AuthProvider
    const role = (
      authUser?.role ??
      readRoleFromToken() ??
      'viewer'
    ).toLowerCase()

    return {
      role,
      isAdmin:    role === 'admin',
      isEngineer: role === 'engineer',
      isViewer:   role === 'viewer',
      canEdit:    role === 'admin' || role === 'engineer',
      canAdmin:   role === 'admin',
      username:   authUser?.username  ?? '',
      fullName:   authUser?.full_name ?? '',
    }
  }, [authUser])  // ← re-computes whenever auth state changes
}