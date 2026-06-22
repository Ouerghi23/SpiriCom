// src/components/ViewerBanner.jsx
import { useRole } from '../hooks/useRole'

export default function ViewerBanner() {
  const { isViewer } = useRole()
  if (!isViewer) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 20px',
      background: 'rgba(107,114,128,.06)',
      borderBottom: '1px solid rgba(107,114,128,.15)',
      fontSize: 11, color: '#6B7280',
    }}>
      🔒
      <span>
        <strong>Read-only access</strong> — You can view all dashboards.
        Contact an administrator to request write access.
      </span>
    </div>
  )
}