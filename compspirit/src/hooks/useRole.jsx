// src/hooks/useRole.jsx
import { useMemo } from 'react'
import { useAuth } from './useAuth.jsx'

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
  const { user: authUser } = useAuth()

  return useMemo(() => {
    const role = (
      authUser?.role ??
      readRoleFromToken() ??
      'viewer'
    ).toLowerCase()

    // isGuest MUST be inside useMemo — needs role + authUser
    const isGuest = role === 'viewer' && authUser?.username === 'guest'

    return {
      role,
      isAdmin:    role === 'admin',
      isEngineer: role === 'engineer',
      isViewer:   role === 'viewer',
      isGuest,                          // ← anonymous guest (1h token, not in DB)
      canEdit:    role === 'admin' || role === 'engineer',
      canAdmin:   role === 'admin',
      username:   authUser?.username  ?? '',
      fullName:   authUser?.full_name ?? '',
    }
  }, [authUser])
}