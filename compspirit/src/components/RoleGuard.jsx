// src/components/RoleGuard.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom — Declarative role-based rendering guard
//
// Usage patterns:
//
//  1. Hide a button for viewers
//     <RoleGuard minRole="engineer">
//       <button onClick={resolve}>Resolve</button>
//     </RoleGuard>
//
//  2. Replace with a disabled/locked version for viewers
//     <RoleGuard minRole="engineer" fallback={<button disabled>Resolve</button>}>
//       <button onClick={resolve}>Resolve</button>
//     </RoleGuard>
//
//  3. Admin-only section with a "no access" message
//     <RoleGuard minRole="admin" fallback={<AccessDenied/>}>
//       <AdminPanel/>
//     </RoleGuard>
//
//  4. Route-level guard (wrap in App.jsx)
//     <Route path="/admin/*" element={
//       <RoleGuard minRole="admin" fallback={<Navigate to="/dashboard"/>}>
//         <AdminLayout/>
//       </RoleGuard>
//     }/>
// ─────────────────────────────────────────────────────────────────────

import { Navigate } from 'react-router-dom'
import { useRole }  from '../hooks/useRole'

/** Role hierarchy — higher index = more privileged */
const ROLE_RANK = { viewer: 0, engineer: 1, admin: 2 }

/**
 * RoleGuard
 *
 * @param {string}      minRole   Minimum role required ('viewer'|'engineer'|'admin')
 * @param {ReactNode}   children  Content to render when access is granted
 * @param {ReactNode}   fallback  Content to render when access is denied
 *                                Defaults to null (renders nothing)
 * @param {string}      redirect  If provided, redirects to this path on denial
 *                                (overrides fallback)
 */
export default function RoleGuard({
  minRole  = 'viewer',
  children,
  fallback = null,
  redirect,
}) {
  const { role } = useRole()
  const hasAccess = (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minRole] ?? 0)

  if (hasAccess) return children

  if (redirect) return <Navigate to={redirect} replace/>

  return fallback
}

// ─────────────────────────────────────────────────────────────────────
// Convenience wrapper — "viewer tooltip" badge shown instead of action
// Useful when you want the UI element visible but disabled + labelled.
// ─────────────────────────────────────────────────────────────────────
export function ViewerBadge({ label = 'View Only', style = {} }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 9, fontWeight: 700, letterSpacing: '1.2px',
      textTransform: 'uppercase',
      padding: '3px 10px',
      background: 'rgba(107,114,128,.1)',
      border: '1px solid rgba(107,114,128,.25)',
      color: '#6B7280',
      borderRadius: 4,
      ...style,
    }}>
      🔒 {label}
    </span>
  )
}