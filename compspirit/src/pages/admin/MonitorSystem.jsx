// src/pages/admin/MonitorSystem.jsx
// ─────────────────────────────────────────────────────────────────────
// Real system health from GET /api/admin/system (v2)
//
// MIGRATION (vs previous version):
//  MS-1  LEGACY RED PURGED: #CF0A2C / #FF4060 in MetricCard defaults,
//        refresh button, offline banner, gauge thresholds, services,
//        and the section head. Health states use the ALARM ladder:
//        healthy→normal, degraded→minor, error/offline→critical;
//        CPU/RAM gauge thresholds map to critical/minor/normal-blue.
//        Refresh + section chrome → blue. The h1 italic accent keeps
//        HW.red as the page's one brand-red element.
//  MS-2  REAL BUG: the "Analytics API" service card read its status
//        from health.services.auth_api (copy-paste), so it could
//        never show its own state. Now reads services.analytics_api
//        with auth_api as explicit fallback — FLAG: confirm the
//        backend exposes an analytics_api key; until it does, the
//        card mirrors auth (now at least intentionally).
//  MS-3  '●  OK' / '●  ERROR' glyph values → dot span + text, colored
//      by the ALARM ladder (the value was blue regardless of state).
//  MS-4  15s auto-refresh skips ticks while the tab is hidden; local
//        spin/pulse keyframes deleted (global noc-* via AdminLayout's
//        <NocBaseStyles/>); tokens imported from UI.
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { HW, ALARM, FONT } from '../../components/UI'
import {
  Server, Database, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Cpu,
} from 'lucide-react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const authHeader = () => {
  const tok = sessionStorage.getItem('spiricomp_token') ||
              localStorage.getItem('spiricomp_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

// MS-1: gauge severity ladders
const cpuColor = pct =>
  pct > 80 ? ALARM.critical : pct > 50 ? ALARM.minor : ALARM.normal
const ramColor = mb =>
  mb > 400 ? ALARM.critical : mb > 200 ? ALARM.minor : HW.blue

const GaugeBar = ({ value, max = 100, color, T }) => {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: T.textDim }}>{value} / {max}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: T.border, borderRadius: 3,
        overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color,
          transition: 'width .6s cubic-bezier(.22,1,.36,1)',
          borderRadius: 3 }}/>
      </div>
    </div>
  )
}

const StatusDot = ({ ok }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
    background: ok ? 'rgba(22,163,74,.10)' : 'rgba(220,38,38,.10)',
    border: `1px solid ${ok ? 'rgba(22,163,74,.25)' : 'rgba(220,38,38,.28)'}`,
    color: ok ? ALARM.normal : ALARM.critical,
    padding: '3px 10px', fontSize: 9, fontWeight: 800,
    letterSpacing: '1px', textTransform: 'uppercase' }}>
    {ok ? <CheckCircle size={9} color={ALARM.normal}/>
        : <XCircle size={9} color={ALARM.critical}/>}
    {ok ? 'Online' : 'Offline'}
  </span>
)

const MetricCard = ({ icon: Icon, label, value, valueColor, sub, color, T,
  children }) => {
  const accent = color || HW.blue
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`,
      padding: '20px 18px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%',
        height: 1,
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}/>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.textDim,
            letterSpacing: '1.5px', textTransform: 'uppercase',
            marginBottom: 6 }}>{label}</div>
          {value !== undefined && (
            <div style={{ fontFamily: FONT.display,
              fontSize: 28, fontWeight: 900,
              color: valueColor || accent, lineHeight: 1,
              letterSpacing: '-1px',
              display: 'flex', alignItems: 'center', gap: 8 }}>
              {value}
            </div>
          )}
          {sub && <div style={{ fontSize: 10, color: T.textDim,
            marginTop: 4 }}>{sub}</div>}
        </div>
        {Icon && <div style={{ width: 32, height: 32,
          background: `${accent}18`, border: `1px solid ${accent}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0 }}>
          <Icon size={15} color={accent}/>
        </div>}
      </div>
      {children}
    </div>
  )
}

export default function MonitorSystem() {
  const { theme: T } = useTheme()
  const [health,    setHealth]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [apiOnline, setApiOnline] = useState(true)
  const [lastFetch, setLastFetch] = useState(null)
  const [latency,   setLatency]   = useState(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    const t0 = Date.now()
    try {
      const r = await axios.get(`${API}/api/admin/system`,
        { headers: authHeader() })
      setHealth(r.data)
      setLatency(Date.now() - t0)
      setApiOnline(true)
      setLastFetch(new Date())
    } catch (err) {
      console.error('MonitorSystem:', err)
      setApiOnline(false)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])
  // MS-4: 15s poll, skipped while tab hidden
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) fetchHealth()
    }, 15000)
    return () => clearInterval(id)
  }, [fetchHealth])

  // MS-1: status → ALARM ladder
  const statusColor = health?.status === 'healthy'
    ? ALARM.normal : ALARM.minor
  const dbOk = !!health?.database?.ok

  return (
    <div style={{ padding: '32px 36px 80px', background: T.bg,
      minHeight: 'calc(100vh - 64px)', color: T.text }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${T.border}`,
        paddingBottom: 22, marginBottom: 24 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
          background: apiOnline ? 'rgba(22,163,74,.08)' : 'rgba(220,38,38,.08)',
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
            {apiOnline ? 'LIVE · System Monitor' : 'OFFLINE'}
            {lastFetch && apiOnline && ' · refreshes every 15s'}
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
              SYSTEM <span style={{ color: HW.red,
                fontStyle: 'italic' }}>HEALTH</span>
            </h1>
            <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>
              Real-time server, database, and API health metrics
              {lastFetch && <span style={{ color: T.textDim }}>
                {' '}· Last: {lastFetch.toLocaleTimeString()}</span>}
            </p>
          </div>
          {/* MS-1: refresh = blue chrome */}
          <button onClick={fetchHealth} disabled={loading} style={{
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
        </div>
      </div>

      {!apiOnline && <div style={{ display: 'flex',
        alignItems: 'flex-start', gap: 10,
        background: 'rgba(220,38,38,.07)',
        border: '1px solid rgba(220,38,38,.25)',
        padding: '12px 18px', marginBottom: 20 }}>
        <AlertTriangle size={13} color={ALARM.critical}
          style={{ flexShrink: 0, marginTop: 1 }}/>
        <div style={{ fontSize: 11, color: T.textMuted }}>
          <span style={{ color: ALARM.critical, fontWeight: 700,
            marginRight: 6 }}>Cannot reach backend.</span>
          Start FastAPI:{' '}
          <code style={{ background: T.mode === 'dark'
              ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)',
            padding: '1px 6px', fontSize: 10, color: HW.blueLight }}>
            uvicorn src.api.auth_api:app --reload --port 8000
          </code>
        </div>
      </div>}

      {loading && !health && <div style={{ textAlign: 'center',
        padding: 60, color: T.textDim }}>
        <RefreshCw size={24} color={T.textDim}
          style={{ animation: 'noc-spin .8s linear infinite',
            display: 'block', margin: '0 auto 12px' }}/>
        Fetching real system metrics…
      </div>}

      {health && <>
        {/* Overall status banner — MS-1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16,
          background: health.status === 'healthy'
            ? 'rgba(22,163,74,.06)' : 'rgba(202,138,4,.06)',
          border: `1px solid ${health.status === 'healthy'
            ? 'rgba(22,163,74,.2)' : 'rgba(202,138,4,.2)'}`,
          padding: '14px 20px', marginBottom: 20 }}>
          {health.status === 'healthy'
            ? <CheckCircle size={20} color={ALARM.normal}/>
            : <AlertTriangle size={20} color={ALARM.minor}/>}
          <div>
            <div style={{ fontFamily: FONT.display, fontSize: 18,
              fontWeight: 900, color: statusColor,
              letterSpacing: '-.3px' }}>
              System {health.status.toUpperCase()}
            </div>
            <div style={{ fontSize: 11, color: T.textDim }}>
              Uptime: <strong style={{ color: T.text }}>{health.uptime}</strong>
              {latency && <span style={{ marginLeft: 12 }}>
                API latency: <strong style={{ color: HW.blueLight }}>
                  {latency}ms</strong>
              </span>}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10,
            flexWrap: 'wrap' }}>
            {Object.entries(health.services || {}).map(([svc, ok]) => (
              <div key={svc} style={{ display: 'flex',
                alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: T.textDim,
                  textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {svc.replace('_', ' ')}
                </span>
                <StatusDot ok={ok}/>
              </div>
            ))}
          </div>
        </div>

        {/* Metrics grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
          gap: 1, background: T.mode === 'dark'
            ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.09)',
          marginBottom: 1 }}>
          {/* DB — MS-3: state-colored value with dot span */}
          <MetricCard icon={Database} label="Database" color={HW.blue} T={T}
            valueColor={dbOk ? ALARM.normal : ALARM.critical}
            value={<>
              <span style={{ width: 8, height: 8, borderRadius: '50%',
                background: dbOk ? ALARM.normal : ALARM.critical,
                display: 'inline-block' }}/>
              {dbOk ? 'OK' : 'ERROR'}
            </>}
            sub={`${health.database.path} · ${health.database.size_kb} KB`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 10, marginTop: 12 }}>
              {[{ l: 'Users',       v: health.database.users, c: HW.blue },
                { l: 'Log Entries', v: health.database.logs,  c: HW.blueLight },
              ].map(k => (
                <div key={k.l} style={{ background: T.bgCardHover,
                  padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, color: T.textDim,
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                    marginBottom: 4 }}>{k.l}</div>
                  <div style={{ fontFamily: FONT.display,
                    fontSize: 22, fontWeight: 900, color: k.c }}>
                    {k.v.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </MetricCard>

          {/* Process — MS-1: severity-laddered gauges */}
          <MetricCard icon={Cpu} label="Process Resources"
            color="#8B5CF6" T={T}>
            <div style={{ display: 'flex', flexDirection: 'column',
              gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: T.textDim,
                  marginBottom: 8 }}>
                  CPU Usage · {health.process.cpu_pct}%
                </div>
                <GaugeBar value={health.process.cpu_pct} max={100}
                  color={cpuColor(health.process.cpu_pct)} T={T}/>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.textDim,
                  marginBottom: 8 }}>
                  RAM Usage · {health.process.ram_mb} MB
                </div>
                <GaugeBar value={Math.round(health.process.ram_mb)} max={512}
                  color={ramColor(health.process.ram_mb)} T={T}/>
              </div>
            </div>
          </MetricCard>

          {/* Host info */}
          <MetricCard icon={Server} label="Host Information"
            color={HW.blueLight} T={T}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { l: 'Hostname', v: health.host.hostname },
                { l: 'Platform', v: health.host.platform },
                { l: 'Python',   v: health.host.python   },
                { l: 'Uptime',   v: health.uptime         },
              ].map(row => (
                <div key={row.l} style={{ display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: `1px solid ${T.border}`,
                  paddingBottom: 7 }}>
                  <span style={{ fontSize: 10, color: T.textDim,
                    textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {row.l}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700,
                    color: T.text,
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    {row.v}
                  </span>
                </div>
              ))}
            </div>
          </MetricCard>
        </div>

        {/* Services — MS-1: blue section chrome; MS-2: analytics key */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`,
          padding: '18px 20px', marginTop: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: HW.blue,
            letterSpacing: '4px', textTransform: 'uppercase',
            marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 18, height: 1, background: HW.blue }}/>
            API Services
          </div>
          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))',
            gap: 10 }}>
            {[
              { name: 'Auth API', ok: health.services.auth_api,
                port: 8000, desc: 'JWT / User management' },
              { name: 'NLP API', ok: health.services.nlp_api,
                port: 8000, desc: 'Complaint classification' },
              // MS-2: own key, explicit fallback (was auth_api copy-paste)
              { name: 'Analytics API',
                ok: health.services.analytics_api ?? health.services.auth_api,
                port: 8000, desc: 'KPI data & anomalies' },
            ].map(svc => (
              <div key={svc.name} style={{ background: T.bgCardHover,
                border: `1px solid ${svc.ok
                  ? 'rgba(22,163,74,.15)' : 'rgba(220,38,38,.15)'}`,
                padding: '14px 16px', position: 'relative',
                overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0,
                  right: 0, height: 1.5,
                  background: `linear-gradient(90deg, transparent, ${svc.ok
                    ? ALARM.normal : ALARM.critical}, transparent)` }}/>
                <div style={{ display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700,
                    color: T.text }}>{svc.name}</span>
                  <StatusDot ok={svc.ok}/>
                </div>
                <div style={{ fontSize: 10, color: T.textDim }}>{svc.desc}</div>
                <div style={{ fontSize: 9, color: T.textDim, marginTop: 4,
                  fontFamily: 'monospace' }}>
                  ::{svc.port}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>}
    </div>
  )
}