// src/pages/admin/AccessLogs.jsx
// ─────────────────────────────────────────────────────────────────────
// Real audit logs from GET /api/admin/logs (v2) — no mock data
//
// MIGRATION (vs previous version):
//  LG-1  REAL BUG: pagination rendered only pages 1..7
//        (Array.from({length: min(totalPages, 7)})) — with more than
//        175 log entries, pages 8+ were unreachable. Replaced with
//        the windowed paginator used on the NLP page (first · … ·
//     around current · … · last) and Lucide chevrons instead of
//        the ← / → glyph characters.
//  LG-2  ACTION_META severity corrected on the ALARM ladder:
//        login_failed / delete_user / delete_complaint → critical
//        (were legacy #FF4060/#CF0A2C); logout was AMBER — logging
//        out is not a warning — now neutral gray, as are all plain
//        view_* page-visit events (view_anomalies was amber too).
//        login → normal, creates → blue, updates → purple,
//        AI/config → blueLight.
//  LG-3  Legacy red purged from chrome: refresh button, count badge,
//        table accent, pagination active state, user avatar gradient
//        (now blue→navy like every other avatar). h1 italic accent
//        keeps HW.red as the page's one brand-red element.
//  LG-4  Export button labeled "Export Page" — it exports only the
//        currently loaded page (server-side pagination), and the old
//        label implied the full table. FLAG: a true full export needs
//        a backend endpoint (e.g. GET /api/admin/logs/export).
//  LG-5  Local keyframes deleted (global noc-* via AdminLayout);
//        inline hover mutation → CSS classes; selects + search get
//        aria-labels; IP code color → HW.blueLight token.
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { HW, ALARM, FONT } from '../../components/UI'
import {
  FileText, RefreshCw, Search, X, Download,
  LogIn, LogOut, Shield, Trash2, Edit2, Plus,
  AlertTriangle, CheckCircle, Clock, ChevronDown, Activity,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const authHeader = () => {
  const tok = sessionStorage.getItem('spiricomp_token') ||
              localStorage.getItem('spiricomp_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

// ── LG-2: action meta on the ALARM ladder ─────────────────────────────
const meta = (color, Icon, dim = '10', bd = '25') => ({
  color, Icon,
  bg: `${color}${dim === '10' ? '1A' : '14'}`.slice(0, 7) + (dim === '10' ? '1A' : '14'),
})
// (explicit table below for clarity instead of the helper)
const ACTION_META = {
  // Auth
  login:        { color: ALARM.normal,   bg: 'rgba(22,163,74,.10)',   border: 'rgba(22,163,74,.25)',   Icon: LogIn },
  logout:       { color: ALARM.unknown,  bg: 'rgba(107,114,128,.10)', border: 'rgba(107,114,128,.22)', Icon: LogOut },
  login_failed: { color: ALARM.critical, bg: 'rgba(220,38,38,.10)',   border: 'rgba(220,38,38,.28)',   Icon: AlertTriangle },

  // User management (admin actions)
  create_user:  { color: HW.blue,        bg: 'rgba(0,147,213,.10)',   border: 'rgba(0,147,213,.25)',   Icon: Plus },
  delete_user:  { color: ALARM.critical, bg: 'rgba(220,38,38,.12)',   border: 'rgba(220,38,38,.28)',   Icon: Trash2 },
  update_user:  { color: '#8B5CF6',      bg: 'rgba(139,92,246,.10)',  border: 'rgba(139,92,246,.25)',  Icon: Edit2 },

  // AI
  config_ai:    { color: HW.blueLight,   bg: 'rgba(0,195,255,.10)',   border: 'rgba(0,195,255,.25)',   Icon: Shield },
  ai_chat:      { color: HW.blueLight,   bg: 'rgba(0,195,255,.08)',   border: 'rgba(0,195,255,.2)',    Icon: Shield },

  // Messaging
  send_message: { color: HW.blue,        bg: 'rgba(0,147,213,.08)',   border: 'rgba(0,147,213,.2)',    Icon: Plus },

  // Complaints / NLP actions
  submit_complaint:        { color: HW.blue,        bg: 'rgba(0,147,213,.08)',   border: 'rgba(0,147,213,.2)',   Icon: Plus },
  update_complaint_status: { color: '#8B5CF6',      bg: 'rgba(139,92,246,.08)',  border: 'rgba(139,92,246,.2)',  Icon: Edit2 },
  delete_complaint:        { color: ALARM.critical, bg: 'rgba(220,38,38,.08)',   border: 'rgba(220,38,38,.2)',   Icon: Trash2 },

  // Dashboard views — LG-2: page visits are neutral, not warnings
  view_overview:  { color: ALARM.unknown, bg: 'rgba(107,114,128,.06)', border: 'rgba(107,114,128,.15)', Icon: FileText },
  view_anomalies: { color: ALARM.unknown, bg: 'rgba(107,114,128,.06)', border: 'rgba(107,114,128,.15)', Icon: AlertTriangle },
  view_map:       { color: ALARM.unknown, bg: 'rgba(107,114,128,.06)', border: 'rgba(107,114,128,.15)', Icon: FileText },
  view_nlp:       { color: ALARM.unknown, bg: 'rgba(107,114,128,.06)', border: 'rgba(107,114,128,.15)', Icon: FileText },
  view_logs:      { color: ALARM.unknown, bg: 'rgba(107,114,128,.06)', border: 'rgba(107,114,128,.15)', Icon: FileText },
  view_system:    { color: ALARM.unknown, bg: 'rgba(107,114,128,.06)', border: 'rgba(107,114,128,.15)', Icon: Activity },

  default: { color: ALARM.unknown, bg: 'rgba(107,114,128,.08)', border: 'rgba(107,114,128,.2)', Icon: FileText },
}

const ActionBadge = ({ action }) => {
  const m = ACTION_META[action] || ACTION_META.default
  const { Icon } = m
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
      background: m.bg, border: `1px solid ${m.border}`, color: m.color,
      padding: '3px 10px', fontSize: 9, fontWeight: 800,
      letterSpacing: '1px', textTransform: 'uppercase',
      whiteSpace: 'nowrap' }}>
      <Icon size={9} color={m.color}/>
      {action?.replace(/_/g, ' ')}
    </span>
  )
}

const PAGE_SIZE = 25

export default function AccessLogs() {
  const { theme: T } = useTheme()
  const [logs,         setLogs]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [apiOnline,    setApiOnline]    = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterAction, setFilterAction] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [page,         setPage]         = useState(1)

  const uniqueActions = useMemo(() => [
    'All',
    'login', 'logout', 'login_failed',
    'create_user', 'update_user', 'delete_user',
    'ai_chat', 'config_ai',
    'send_message',
    'submit_complaint', 'update_complaint_status', 'delete_complaint',
    'view_overview', 'view_anomalies', 'view_map', 'view_nlp',
    'view_logs', 'view_system',
  ], [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
        ...(filterAction !== 'All' && { action: filterAction }),
        ...(filterStatus !== 'All' && { status: filterStatus }),
      })
      const r = await axios.get(`${API}/api/admin/logs?${params}`,
        { headers: authHeader() })
      setLogs(r.data.logs || [])
      setTotal(r.data.total || 0)
      setApiOnline(true)
    } catch (err) {
      console.error('AccessLogs fetch:', err)
      setApiOnline(false)
      setLogs([])
    } finally { setLoading(false) }
  }, [page, filterAction, filterStatus])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { setPage(1) }, [filterAction, filterStatus, search])

  const filtered = useMemo(() => {
    if (!search.trim()) return logs
    const q = search.toLowerCase()
    return logs.filter(l =>
      l.user?.toLowerCase().includes(q)   ||
      l.action?.toLowerCase().includes(q) ||
      l.ip?.toLowerCase().includes(q)     ||
      l.target?.toLowerCase().includes(q) ||
      l.detail?.toLowerCase().includes(q)
    )
  }, [logs, search])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // LG-4: exports the current page only — full export needs backend
  const exportCSV = () => {
    const rows = ['Timestamp,User,Action,Target,IP,Status,Detail'.split(',')]
    logs.forEach(l => rows.push([l.timestamp, l.user, l.action,
      l.target, l.ip, l.status, l.detail || '']))
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a   = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `access_logs_page${page}.csv`; a.click()
  }

  return (
    <div style={{ padding: '32px 36px 80px', background: T.bg,
      minHeight: 'calc(100vh - 64px)', color: T.text }}>
      <style>{`
        .al-row:hover td { background: ${T.bgCardHover} !important; }
        .al-export { transition: all .2s; }
        .al-export:hover { border-color: ${HW.blue} !important;
          color: ${HW.blue} !important; }
        .al-page { transition: all .18s; }
        .al-page:hover:not(:disabled):not(.active) {
          border-color: ${HW.blue} !important; color: ${HW.blue} !important; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${T.border}`,
        paddingBottom: 24, marginBottom: 24 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
          background: apiOnline
            ? 'rgba(22,163,74,.08)' : 'rgba(220,38,38,.08)',
          border: `1px solid ${apiOnline
            ? 'rgba(22,163,74,.25)' : 'rgba(220,38,38,.25)'}`,
          padding: '5px 12px', marginBottom: 14 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%',
            background: apiOnline ? ALARM.normal : ALARM.critical,
            display: 'inline-block',
            animation: apiOnline ? 'noc-pulse 2s infinite' : 'none' }}/>
          <span style={{ fontSize: 9, fontWeight: 800,
            letterSpacing: '2.5px', textTransform: 'uppercase',
            color: apiOnline ? ALARM.normal : ALARM.critical }}>
            {apiOnline ? 'LIVE · Real Audit Log' : 'OFFLINE · No data'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
          <div>
            {/* The ONE brand-red element on this page */}
            <h1 style={{ fontFamily: FONT.display,
              fontSize: 'clamp(24px,3vw,44px)', fontWeight: 900,
              letterSpacing: '-1.5px', lineHeight: 1, color: T.text,
              margin: '0 0 6px' }}>
              ACCESS <span style={{ color: HW.red,
                fontStyle: 'italic' }}>LOGS</span>
            </h1>
            <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>
              Real-time audit trail · {total.toLocaleString()} total
              events in database
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* LG-3: refresh = blue chrome */}
            <button onClick={fetchLogs} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: HW.blueDim, border: `1px solid ${HW.blueBd}`,
              color: HW.blue, padding: '8px 16px', fontSize: 11,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1 }}>
              <RefreshCw size={12} style={{ animation: loading
                ? 'noc-spin .8s linear infinite' : undefined }}/>
              Refresh
            </button>
            {/* LG-4: honest label + CSS hover */}
            <button onClick={exportCSV} className="al-export" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent',
              border: `1px solid ${T.border}`, color: T.textMuted,
              padding: '8px 16px', fontSize: 11, fontWeight: 700,
              cursor: 'pointer' }}>
              <Download size={12}/>Export Page
            </button>
          </div>
        </div>
      </div>

      {/* Offline warning */}
      {!apiOnline && <div style={{ display: 'flex',
        alignItems: 'flex-start', gap: 10,
        background: 'rgba(202,138,4,.07)',
        border: '1px solid rgba(202,138,4,.25)',
        padding: '12px 18px', marginBottom: 16 }}>
        <AlertTriangle size={13} color={ALARM.minor}
          style={{ flexShrink: 0, marginTop: 1 }}/>
        <div style={{ fontSize: 11, color: T.textMuted }}>
          <span style={{ color: ALARM.minor, fontWeight: 700,
            marginRight: 6 }}>Backend not reachable.</span>
          Start the FastAPI server with{' '}
          <code style={{ background: T.mode === 'dark'
              ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)',
            padding: '1px 6px', fontSize: 10, color: HW.blueLight }}>
            uvicorn src.api.auth_api:app --reload --port 8000
          </code>
        </div>
      </div>}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 1,
        background: T.mode === 'dark'
          ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.09)',
        marginBottom: 1, flexWrap: 'wrap' }}>
        <div style={{ background: T.bgCard, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8, flex: 1,
          minWidth: 220 }}>
          <Search size={12} color={T.textDim}/>
          <input type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search user, action, IP…"
            aria-label="Search logs"
            style={{ background: 'transparent', border: 'none',
              outline: 'none', color: T.text, fontSize: 12,
              fontFamily: 'inherit', flex: 1 }}/>
          {search && <button onClick={() => setSearch('')}
            aria-label="Clear search"
            style={{ background: 'transparent', border: 'none',
              cursor: 'pointer', color: T.textDim, padding: 0 }}>
            <X size={11}/>
          </button>}
        </div>
        <div style={{ background: T.bgCard, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: T.textDim,
            letterSpacing: '2px', textTransform: 'uppercase' }}>Action</span>
          <div style={{ position: 'relative' }}>
            <select value={filterAction} aria-label="Filter by action"
              onChange={e => setFilterAction(e.target.value)}
              style={{ appearance: 'none', background: T.bgCardHover,
                color: T.text, border: `1px solid ${T.border}`,
                padding: '6px 28px 6px 10px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                outline: 'none', fontFamily: 'inherit', minWidth: 130 }}>
              {uniqueActions.map(a => (
                <option key={a} value={a}>
                  {a === 'All' ? 'All Actions' : a.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <ChevronDown size={10} color={T.textDim}
              style={{ position: 'absolute', right: 8, top: '50%',
                transform: 'translateY(-50%)', pointerEvents: 'none' }}/>
          </div>
        </div>
        <div style={{ background: T.bgCard, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: T.textDim,
            letterSpacing: '2px', textTransform: 'uppercase' }}>Status</span>
          <div style={{ position: 'relative' }}>
            <select value={filterStatus} aria-label="Filter by status"
              onChange={e => setFilterStatus(e.target.value)}
              style={{ appearance: 'none', background: T.bgCardHover,
                color: T.text, border: `1px solid ${T.border}`,
                padding: '6px 28px 6px 10px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                outline: 'none', fontFamily: 'inherit', minWidth: 110 }}>
              <option value="All">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
            <ChevronDown size={10} color={T.textDim}
              style={{ position: 'absolute', right: 8, top: '50%',
                transform: 'translateY(-50%)', pointerEvents: 'none' }}/>
          </div>
        </div>
        <div style={{ background: T.bgCard, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 6,
          marginLeft: 'auto' }}>
          <span style={{ fontFamily: FONT.display, fontSize: 15,
            fontWeight: 800, color: HW.blue }}>{filtered.length}</span>
          <span style={{ fontSize: 10, color: T.textDim }}>
            shown / {total} total
          </span>
        </div>
      </div>

      {/* Table — LG-3: blue chrome accent */}
      <div style={{ border: `1px solid ${T.border}`, overflow: 'hidden',
        position: 'relative', marginBottom: 1 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0,
          height: 1.5,
          background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse',
            fontSize: 11, minWidth: 800 }}>
            <thead>
              <tr style={{ background: T.mode === 'dark'
                  ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.04)',
                borderBottom: `1px solid ${T.border}` }}>
                {['Timestamp', 'User', 'Action', 'Target', 'IP Address',
                  'Status', 'Detail'].map(h => (
                  <th key={h} style={{ padding: '11px 14px',
                    textAlign: 'left', fontSize: 9, fontWeight: 800,
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                    color: T.textDim, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40,
                  textAlign: 'center', color: T.textDim }}>
                  <RefreshCw size={18} color={T.textDim}
                    style={{ animation: 'noc-spin .8s linear infinite',
                      display: 'block', margin: '0 auto 8px' }}/>
                  Loading logs from database…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 48,
                  textAlign: 'center', color: T.textMuted }}>
                  <FileText size={24} color={T.textDim}
                    style={{ display: 'block', margin: '0 auto 10px' }}/>
                  {apiOnline
                    ? 'No log entries found — admin actions will appear here automatically'
                    : 'Cannot connect to backend — start FastAPI server'}
                </td></tr>
              ) : filtered.map((log, i) => (
                <tr key={log.id || i} className="al-row"
                  style={{ borderBottom: `1px solid ${T.mode === 'dark'
                      ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)'}`,
                    transition: 'all .12s' }}>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center',
                      gap: 6 }}>
                      <Clock size={10} color={T.textDim}/>
                      <span style={{ fontFamily: FONT.display,
                        fontSize: 12, fontWeight: 700,
                        color: T.textMuted }}>
                        {new Date(log.timestamp).toLocaleString([], {
                          month: 'short', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center',
                      gap: 7 }}>
                      {/* LG-3: avatar gradient = platform blue, not red */}
                      <div style={{ width: 24, height: 24,
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9, fontWeight: 800, color: '#fff',
                        flexShrink: 0 }}>
                        {(log.user || '?')[0].toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, color: T.text,
                        fontSize: 12 }}>{log.user}</span>
                    </div>
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <ActionBadge action={log.action}/>
                  </td>
                  <td style={{ padding: '9px 14px', color: T.textDim,
                    fontSize: 11 }}>
                    {log.target || <span style={{ opacity: .4 }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <code style={{ fontSize: 10, color: HW.blueLight,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                      {log.ip}
                    </code>
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <span style={{ padding: '3px 10px', fontSize: 9,
                      fontWeight: 800, letterSpacing: '1px',
                      textTransform: 'uppercase',
                      background: log.status === 'success'
                        ? 'rgba(22,163,74,.10)' : 'rgba(220,38,38,.10)',
                      border: `1px solid ${log.status === 'success'
                        ? 'rgba(22,163,74,.25)' : 'rgba(220,38,38,.28)'}`,
                      color: log.status === 'success'
                        ? ALARM.normal : ALARM.critical }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', color: T.textDim,
                    fontSize: 11, maxWidth: 160, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.detail || <span style={{ opacity: .4 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination — LG-1: windowed, reaches every page */}
      {total > PAGE_SIZE && <div style={{ display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        background: T.bgCard, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 11, color: T.textMuted }}>
          <span style={{ fontFamily: FONT.display, fontSize: 15,
            fontWeight: 800, color: HW.blue }}>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
          </span>
          <span style={{ color: T.textDim }}> / {total} entries</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="al-page" aria-label="Previous page"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ width: 30, height: 30,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.textMuted,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? .4 : 1,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center' }}>
            <ChevronLeft size={12}/>
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages ||
              Math.abs(p - page) <= 1)
            .reduce((acc, p, idx, arr) => {
              if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…')
              acc.push(p); return acc
            }, [])
            .map((p, idx) => p === '…' ? (
              <span key={`e${idx}`} style={{ width: 30,
                textAlign: 'center', color: T.textDim,
                fontSize: 11 }}>…</span>
            ) : (
              <button key={p} onClick={() => setPage(p)}
                className={`al-page${p === page ? ' active' : ''}`}
                aria-label={`Page ${p}`}
                aria-current={p === page ? 'page' : undefined}
                style={{ width: 30, height: 30,
                  background: p === page ? HW.blue : 'transparent',
                  border: `1px solid ${p === page ? HW.blue : T.border}`,
                  color: p === page ? '#fff' : T.textMuted,
                  cursor: 'pointer', fontSize: 11,
                  fontWeight: p === page ? 800 : 500,
                  fontFamily: FONT.display }}>
                {p}
              </button>
            ))
          }

          <button className="al-page" aria-label="Next page"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ width: 30, height: 30,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.textMuted,
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              opacity: page === totalPages ? .4 : 1,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center' }}>
            <ChevronRight size={12}/>
          </button>
        </div>
        <div style={{ fontSize: 9, color: T.textDim,
          letterSpacing: '1.5px', textTransform: 'uppercase',
          fontWeight: 700 }}>
          Page {page} / {totalPages}
        </div>
      </div>}
    </div>
  )
}