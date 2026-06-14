// src/components/NotificationBell.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC — Notification Center
//
// Drop this into the nav-bar right-side controls:
//   import NotificationBell from '../components/NotificationBell'
//   <NotificationBell role={user?.role === 'admin' ? 'admin' : 'engineer'} />
//
// Features:
//   NB-1  Bell badge: live unread count, turns red on first notification
//   NB-2  SSE stream for instant updates; falls back to 30s polling
//   NB-3  Severity ladder (ALARM.critical → ALARM.normal → HW.blue) for
//         the left-edge colour bar — same ladder as AnomalyFeed
//   NB-4  Type-specific Lucide icons per notification category
//   NB-5  Click → mark read + navigate to the relevant dashboard page
//   NB-6  "Mark all read" clears the badge; soft-delete keeps history
//   NB-7  Empty state with "Scan for alerts" trigger
//   NB-8  Keyboard accessible: Escape closes, Tab navigates items
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme }    from '../context/ThemeContext'
import {
  Bell, BellOff, X, Check, CheckCheck,
  AlertTriangle, AlertCircle, ShieldAlert,
  Wifi, WifiOff, Activity, Users, UserPlus,
  MessageSquare, RefreshCw, Cpu, Bot,
  TrendingDown, Radio, Zap,
} from 'lucide-react'
import { HW, ALARM, FONT } from './UI'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const hdr  = () => {
  const tok = sessionStorage.getItem('spiricomp_token') ||
              localStorage.getItem('spiricomp_token') || ''
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

const POLL_MS  = 30_000
const MAX_LIST = 50

// ── Severity config ───────────────────────────────────────────────────
const SEV = {
  critical: { color: ALARM.critical,  bg: 'rgba(220,38,38,.08)',  bd: 'rgba(220,38,38,.25)' },
  major:    { color: ALARM.major,     bg: 'rgba(234,88,12,.08)',  bd: 'rgba(234,88,12,.25)' },
  minor:    { color: ALARM.minor,     bg: 'rgba(202,138,4,.08)',  bd: 'rgba(202,138,4,.25)' },
  normal:   { color: ALARM.normal,    bg: 'rgba(22,163,74,.08)',  bd: 'rgba(22,163,74,.25)' },
  info:     { color: HW.blue,         bg: 'rgba(0,147,213,.08)',  bd: 'rgba(0,147,213,.25)' },
}

// ── Type → { icon, label, route } ────────────────────────────────────
const TYPE_META = {
  new_complaint:    { Icon: AlertCircle,   label: 'New complaint',     route: '/complaint-map' },
  complaint_update: { Icon: RefreshCw,     label: 'Complaint update',  route: '/complaint-map' },
  new_feedback:     { Icon: MessageSquare, label: 'New feedback',      route: '/complaint-map' },
  new_message:      { Icon: MessageSquare, label: 'New message',       route: null },
  high_risk_churn:  { Icon: TrendingDown,  label: 'High-risk alert',   route: '/forecasting' },
  high_risk_summary:{ Icon: ShieldAlert,   label: 'Risk summary',      route: '/forecasting' },
  coverage_gap:     { Icon: Radio,         label: '5G coverage gap',   route: '/forecasting' },
  anomaly_detected: { Icon: Activity,      label: 'Anomaly detected',  route: '/anomaly-feed' },
  anomaly:          { Icon: Activity,      label: 'Anomaly detected',  route: '/anomaly-feed' },
  shift_start:      { Icon: Zap,           label: 'Shift start',       route: '/admin/users' },
  shift_end:        { Icon: WifiOff,       label: 'Shift end',         route: '/admin/users' },
  new_engineer:     { Icon: UserPlus,      label: 'New engineer',      route: '/admin/users' },
  system_error:     { Icon: AlertTriangle, label: 'System error',      route: '/admin/system' },
  ml_complete:      { Icon: Bot,           label: 'ML training done',  route: '/forecasting' },
  ml_failed:        { Icon: Cpu,           label: 'ML training failed',route: '/forecasting' },
  info:             { Icon: Bell,          label: 'Notification',      route: null },
}

function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.info
}

// ── Relative time ─────────────────────────────────────────────────────
function relTime(iso) {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60)   return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  } catch { return '' }
}

// ══════════════════════════════════════════════════════════════════════
export default function NotificationBell({ role = 'engineer' }) {
  const { theme: T }  = useTheme()
  const navigate      = useNavigate()
  const [open, setOpen]               = useState(false)
  const [notifs, setNotifs]           = useState([])
  const [unread, setUnread]           = useState(0)
  const [loading, setLoading]         = useState(false)
  const [scanning, setScanning]       = useState(false)
  const panelRef  = useRef(null)
  const btnRef    = useRef(null)
  const evtSrcRef = useRef(null)
  const pollRef   = useRef(null)

  // ── Fetch list ──────────────────────────────────────────────────
  const fetchNotifs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await fetch(
        `${BASE}/api/notifications?role=${role}&limit=${MAX_LIST}`,
        { headers: hdr() })
      if (!r.ok) throw new Error(r.status)
      const d = await r.json()
      setNotifs(d.notifications || [])
      setUnread((d.notifications || []).filter(n => !n.is_read).length)
    } catch { /* backend not ready yet */ }
    finally { if (!silent) setLoading(false) }
  }, [role])

  // ── SSE + polling ───────────────────────────────────────────────
  useEffect(() => {
    fetchNotifs()

    // SSE for instant badge bump
    const startSSE = () => {
      try {
        const tok = sessionStorage.getItem('spiricomp_token') ||
                    localStorage.getItem('spiricomp_token') || ''
        const es = new EventSource(
          `${BASE}/api/notifications/stream?role=${role}`)
        es.onmessage = () => fetchNotifs(true)
        es.onerror = () => { es.close(); evtSrcRef.current = null }
        evtSrcRef.current = es
      } catch { /* SSE not supported or backend down */ }
    }
    startSSE()

    // Polling fallback
    pollRef.current = setInterval(() => fetchNotifs(true), POLL_MS)
    return () => {
      evtSrcRef.current?.close()
      clearInterval(pollRef.current)
    }
  }, [fetchNotifs])

  // ── Close on outside click / Escape ─────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
      else if (!panelRef.current?.contains(e.target) &&
               !btnRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      document.removeEventListener('mousedown', handler)
    }
  }, [open])

  // ── Actions ──────────────────────────────────────────────────────
  const markRead = useCallback(async (id) => {
    setNotifs(prev => prev.map(n => n.id === id ? {...n, is_read: true} : n))
    setUnread(c => Math.max(0, c - 1))
    try {
      await fetch(`${BASE}/api/notifications/${id}/read`,
        { method: 'PATCH', headers: hdr() })
    } catch {}
  }, [])

  const markAllRead = useCallback(async () => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
    try {
      await fetch(`${BASE}/api/notifications/mark-all-read`,
        { method: 'POST',
          headers: { 'Content-Type': 'application/json', ...hdr() },
          body: JSON.stringify({ role }) })
    } catch {}
  }, [role])

  const handleClick = useCallback(async (notif) => {
    if (!notif.is_read) await markRead(notif.id)
    const route = notif.meta?.url || typeMeta(notif.type).route
    if (route) { setOpen(false); navigate(route) }
  }, [markRead, navigate])

  const triggerScan = useCallback(async () => {
    setScanning(true)
    try {
      await fetch(`${BASE}/api/notifications/scan`,
        { method: 'POST', headers: hdr() })
      await fetchNotifs()
    } catch {}
    setScanning(false)
  }, [fetchNotifs])

  const hasCritical = notifs.some(n => !n.is_read && n.severity === 'critical')

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        .nb-item { transition: background .15s; cursor: pointer; }
        .nb-item:hover { background: ${T.bgCardHover} !important; }
        .nb-btn-sm { background: transparent; border: 1px solid ${T.border};
          color: ${T.textDim}; cursor: pointer; display: flex;
          align-items: center; gap: 4px; padding: 4px 9px; font-size: 10px;
          font-weight: 700; letter-spacing: 1px; transition: all .15s;
          font-family: inherit; }
        .nb-btn-sm:hover { border-color: ${HW.blue}; color: ${HW.blue}; }
        .nb-scan:hover { border-color: ${ALARM.normal} !important;
          color: ${ALARM.normal} !important; }
      `}</style>

      {/* ── BELL BUTTON ── */}
      <button ref={btnRef}
        onClick={() => setOpen(v => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          position: 'relative', background: 'transparent',
          border: `1px solid ${open ? HW.blue : T.border}`,
          color: open ? HW.blue : T.textDim,
          width: 34, height: 34, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .2s',
        }}>
        {hasCritical
          ? <BellOff size={15} style={{ animation: 'noc-pulse 1.5s infinite' }}/>
          : <Bell size={15}/>}

        {/* Badge */}
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            minWidth: 18, height: 18, borderRadius: 9,
            background: hasCritical ? ALARM.critical : ALARM.major,
            border: `2px solid ${T.bg}`, color: '#fff',
            fontSize: 9, fontWeight: 800, fontFamily: FONT.display,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', letterSpacing: 0,
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* ── DROPDOWN PANEL ── */}
      {open && (
        <div ref={panelRef}
          role="dialog" aria-label="Notifications"
          style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0,
            width: 360, maxHeight: 520,
            background: T.bgCard, border: `1px solid ${T.border}`,
            boxShadow: '0 8px 32px rgba(0,0,0,.35)',
            display: 'flex', flexDirection: 'column',
            zIndex: 9999,
            // Brand accent top strip
            borderTop: `2px solid ${hasCritical ? ALARM.critical : HW.blue}`,
          }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
                textTransform: 'uppercase', color: T.text }}>
                NOTIFICATIONS
              </span>
              {unread > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '2px 7px',
                  background: `${ALARM.major}20`,
                  border: `1px solid ${ALARM.major}50`, color: ALARM.major,
                  letterSpacing: '1px',
                }}>
                  {unread} NEW
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {unread > 0 && (
                <button className="nb-btn-sm" onClick={markAllRead}
                  title="Mark all read">
                  <CheckCheck size={10}/> All read
                </button>
              )}
              <button className="nb-btn-sm nb-scan"
                onClick={triggerScan} disabled={scanning}
                title="Scan artifacts for new alerts">
                <RefreshCw size={10}
                  style={{ animation: scanning
                    ? 'noc-spin .8s linear infinite' : 'none' }}/>
                Scan
              </button>
              <button style={{
                background: 'transparent', border: 'none', color: T.textDim,
                cursor: 'pointer', padding: 2,
              }} onClick={() => setOpen(false)} aria-label="Close">
                <X size={14}/>
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}
            className="aib-scroll">
            {loading && notifs.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center',
                color: T.textDim, fontSize: 11 }}>
                <RefreshCw size={16} style={{
                  animation: 'noc-spin .8s linear infinite',
                  display: 'block', margin: '0 auto 8px',
                }}/>
                Loading…
              </div>
            ) : notifs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Bell size={24} color={T.textDim}
                  style={{ display: 'block', margin: '0 auto 12px', opacity: .4 }}/>
                <div style={{ fontSize: 12, color: T.textMuted,
                  marginBottom: 6 }}>
                  No notifications yet
                </div>
                <div style={{ fontSize: 10, color: T.textDim }}>
                  Click <strong>Scan</strong> to check for new alerts
                </div>
              </div>
            ) : (
              notifs.map(n => <NotifRow key={n.id} n={n} T={T}
                onRead={() => markRead(n.id)}
                onClick={() => handleClick(n)} />)
            )}
          </div>

          {/* Footer */}
          {notifs.length > 0 && (
            <div style={{
              padding: '8px 16px', borderTop: `1px solid ${T.border}`,
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexShrink: 0,
            }}>
              <span style={{ fontSize: 10, color: T.textDim }}>
                {notifs.length} notification{notifs.length !== 1 ? 's' : ''}
                {unread > 0 ? ` · ${unread} unread` : ''}
              </span>
              <span style={{ fontSize: 9, color: T.textDim,
                letterSpacing: '1px' }}>
                {role.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── Single notification row ───────────────────────────────────────────
function NotifRow({ n, T, onRead, onClick }) {
  const sev  = SEV[n.severity] || SEV.info
  const meta = typeMeta(n.type)
  const { Icon } = meta

  return (
    <div className="nb-item"
      onClick={onClick}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      aria-label={`${n.title} — ${n.severity}`}
      style={{
        display: 'flex', gap: 0,
        borderBottom: `1px solid ${T.border}`,
        background: n.is_read ? 'transparent' : `${sev.color}06`,
        opacity: n.is_read ? 0.7 : 1,
        position: 'relative',
      }}>

      {/* Left severity bar */}
      <div style={{
        width: 3, flexShrink: 0,
        background: n.is_read ? 'transparent' : sev.color,
        transition: 'background .3s',
      }}/>

      <div style={{ flex: 1, padding: '10px 14px 10px 12px',
        display: 'flex', gap: 10 }}>
        {/* Icon */}
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: `${sev.color}18`,
          border: `1px solid ${sev.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={13} color={sev.color}/>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', gap: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: n.is_read ? 600 : 800,
              color: T.text, lineHeight: 1.3,
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {n.title}
            </span>
            {/* Unread dot */}
            {!n.is_read && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: sev.color, flexShrink: 0, marginTop: 3,
              }}/>
            )}
          </div>

          {n.body && (
            <div style={{
              fontSize: 10, color: T.textMuted, marginTop: 3,
              lineHeight: 1.45,
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {n.body}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center',
            gap: 8, marginTop: 5 }}>
            <span style={{ fontSize: 9, color: T.textDim,
              letterSpacing: '.5px' }}>
              {relTime(n.created_at)}
            </span>
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: '1.5px',
              padding: '1px 6px',
              background: `${sev.color}18`, color: sev.color,
              border: `1px solid ${sev.color}30`,
            }}>
              {n.severity.toUpperCase()}
            </span>
            {!n.is_read && (
              <button onClick={e => { e.stopPropagation(); onRead() }}
                aria-label="Mark as read"
                style={{
                  background: 'transparent', border: 'none',
                  color: T.textDim, cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 9, fontWeight: 700,
                }}>
                <Check size={9}/> Read
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}