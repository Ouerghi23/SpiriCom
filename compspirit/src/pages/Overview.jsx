// src/pages/Overview.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Huawei SpiriComp — NOC Overview Dashboard
//
// Changes from original:
//   - Custom SVG Ico factory replaced with Lucide React (professional icon library,
//     already installed in node_modules). No AI-generated icons.
//   - NOC alarm severity colors aligned with ITU-T / Huawei iManager standard:
//       🔴 Critical  #DC2626  (network down / severe outage)
//       🟠 Major     #EA580C  (significant degradation)
//       🟡 Minor     #CA8A04  (warning threshold crossed)
//       🟢 Normal    #16A34A  (operational)
//       ⚪ Unknown   #6B7280  (no data)
//   - Information hierarchy reordered: System Health → Alarm Banner → KPIs →
//     Trend → Heatmap → Regional → Dataset
//   - Axis labels, units, and tooltips made explicit throughout
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useTranslation }      from 'react-i18next'
import ReactApexChart           from 'react-apexcharts'
import {
  Signal, Activity, Users, Globe, Calendar, Database,
  Radio, AlertTriangle, TrendingUp, LayoutGrid, Map,
  CheckCircle2, Cpu, Wifi, BarChart3, Clock, RefreshCw,
} from 'lucide-react'

import { analyticsApi }         from '../api/client'
import { Badge, Spinner, EmptyState, baseChartOptions } from '../components/UI'

// ── NOC Alarm Colour System (ITU-T aligned) ───────────────────────────────────
// Use ONLY these tokens throughout the component — never hardcode alarm colours
// inline.  This makes future theme changes a single-line edit.
const ALARM = {
  critical: '#DC2626',   // P1 — Network down / severe outage
  major:    '#EA580C',   // P2 — Significant degradation
  minor:    '#CA8A04',   // P3 — Warning threshold crossed
  normal:   '#16A34A',   // OK — Operational
  unknown:  '#6B7280',   // No data / indeterminate
}

// ── Dashboard Colour Palette ──────────────────────────────────────────────────
const C = {
  // Backgrounds
  bg:     '#080808',
  bg2:    '#0C0C0C',
  bg3:    '#0A0A0A',
  bg4:    '#0E0E0E',
  border: 'rgba(255,255,255,.055)',

  // Text
  text:     '#F8FAFC',
  textMuted:'rgba(248,250,252,.50)',
  textDim:  'rgba(248,250,252,.32)',

  // Data series (charts)
  blue:   '#3B82F6',
  cyan:   '#22D3EE',
  green:  ALARM.normal,
  amber:  ALARM.minor,
  red:    ALARM.critical,
  orange: ALARM.major,
  purple: '#A855F7',
  teal:   '#14B8A6',

  // Huawei brand accent
  huawei: '#CF0A2C',
}

// ── QoE Heatmap Ranges (aligned with alarm scale) ────────────────────────────
const HEATMAP_RANGES = [
  { from: 0,  to: 45,  color: '#450A0A', name: 'Critical'  },  // < 45 → Critical
  { from: 45, to: 60,  color: '#991B1B', name: 'Very Poor' },  // 45–60 → Major
  { from: 60, to: 70,  color: '#C2410C', name: 'Poor'      },  // 60–70 → Minor
  { from: 70, to: 80,  color: '#B45309', name: 'Fair'      },  // 70–80 → Warning
  { from: 80, to: 90,  color: '#3F6212', name: 'Good'      },  // 80–90 → Normal
  { from: 90, to: 100, color: '#14532D', name: 'Excellent' },  // > 90  → Excellent
]

const REGION_COLORS = [
  '#1659C5','#2066CC','#2B73D2','#3680D9',
  '#418DE0','#4C9AE7','#57A7EE','#62B4F4','#6DC1FA','#78CEFF',
]

// KPI tile icon mapping — one Lucide icon per KPI in the META order
const KPI_ICONS = [Signal, Activity, AlertTriangle, Users, Radio, TrendingUp, Globe, Cpu]

// ── Base ApexCharts options (dark theme) ─────────────────────────────────────
const base = {
  ...baseChartOptions,
  chart: {
    ...baseChartOptions?.chart,
    foreColor:  C.textMuted,
    background: 'transparent',
    animations: { enabled: false },    // disable for real-time readability
    toolbar:    { show: false },
    zoom:       { enabled: false },
  },
  grid:    { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3 },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '11px', fontFamily: "'Barlow Condensed', system-ui" },
  },
}

// ── Alarm state helper ────────────────────────────────────────────────────────
// Returns the appropriate ALARM colour for a KPI tile based on its delta.
const getKpiAlarmColor = kpi => {
  if (kpi.delta == null) return C.blue
  const improving   = kpi.good ? kpi.delta >= 0 : kpi.delta <= 0
  const magnitude   = Math.abs(kpi.delta)
  if (!improving && magnitude > 10) return ALARM.critical
  if (!improving && magnitude > 5)  return ALARM.major
  if (!improving && magnitude > 2)  return ALARM.minor
  if (improving)                    return ALARM.normal
  return C.blue
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════════════

// ── SectionLabel ─────────────────────────────────────────────────────────────
const SectionLabel = ({ children, action, sub }) => (
  <div style={{ marginTop: 40, marginBottom: 18 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: C.huawei,
        letterSpacing: '4.5px', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ width: 22, height: 1, background: C.huawei, display: 'inline-block', flexShrink: 0 }}/>
        {children}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
    {sub && (
      <div style={{ fontSize: 10, color: C.textDim, letterSpacing: '1px', marginTop: 6, paddingLeft: 34 }}>
        {sub}
      </div>
    )}
  </div>
)

// ── StatBlock (KPI Tile) ──────────────────────────────────────────────────────
const StatBlock = ({ label, value, unit, delta, good, color, icon: IconComp, sub }) => {
  const accent     = color || C.blue
  const deltaColor = good ? (delta >= 0 ? ALARM.normal : ALARM.critical)
                          : (delta >= 0 ? ALARM.critical : ALARM.normal)
  return (
    <div className="ov-stat-block" style={{
      background:  C.bg3,
      border:      `1px solid ${C.border}`,
      padding:     '28px 22px',
      position:    'relative',
      overflow:    'hidden',
      transition:  'all .3s cubic-bezier(.22,1,.36,1)',
      cursor:      'default',
    }}>
      {/* Top accent line — colour encodes alarm severity */}
      <div style={{
        position: 'absolute', top: 0, left: '12%', right: '12%', height: 2,
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
      }}/>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: C.textDim,
          letterSpacing: '1.8px', textTransform: 'uppercase', lineHeight: 1.5,
        }}>
          {label}
        </span>
        {IconComp && (
          <div style={{
            width: 28, height: 28,
            border: `1px solid ${accent}30`, background: `${accent}10`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {/* Lucide icons receive size + color as props */}
            <IconComp size={13} color={accent}/>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
        <span style={{
          fontFamily:    "'Barlow Condensed', sans-serif",
          fontSize:      38,
          fontWeight:    900,
          color:         accent,
          lineHeight:    1,
          letterSpacing: '-1.5px',
        }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>
            {unit}
          </span>
        )}
      </div>

      {(delta !== undefined || sub) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {delta != null && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: deltaColor,
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && (
            <span style={{ fontSize: 9, color: C.textDim, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              {sub}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── SystemHealthBanner ────────────────────────────────────────────────────────
// Priority 1: always the first element a NOC engineer sees.
function SystemHealthBanner({ kpis, spikeCount, total }) {
  const { t } = useTranslation()

  const spikeRate = total > 0 ? spikeCount / total : 0
  const degraded  = kpis.filter(k => {
    if (k.delta == null) return false
    const ok = k.good ? k.delta >= 0 : k.delta <= 0
    return !ok && Math.abs(k.delta) > 5
  }).length

  // Alarm state determination — maps to ITU-T alarm levels
  let statusKey = 'overview.nominal'
  let dotColor  = ALARM.normal
  let border    = `${ALARM.normal}40`
  let bg        = `${ALARM.normal}0D`
  let StatusIcon = CheckCircle2

  if (spikeRate > 0.1 || degraded >= 3) {
    statusKey  = 'overview.critical'
    dotColor   = ALARM.critical
    border     = `${ALARM.critical}4D`
    bg         = `${ALARM.critical}12`
    StatusIcon = AlertTriangle
  } else if (spikeRate > 0.05 || degraded >= 1) {
    statusKey  = 'overview.degraded'
    dotColor   = ALARM.minor
    border     = `${ALARM.minor}4D`
    bg         = `${ALARM.minor}12`
    StatusIcon = AlertTriangle
  }

  const detail = [
    degraded   > 0 ? `${degraded} ${t('overview.kpiDegraded')}`  : null,
    spikeCount > 0 ? `${spikeCount} ${t('overview.spikes')}`      : null,
    degraded === 0 && spikeCount === 0 ? t('overview.allNormal')   : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: bg, border: `1px solid ${border}`, padding: '11px 22px', marginBottom: 1,
    }}>
      {/* Pulsing severity dot */}
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: dotColor,
        display: 'inline-block', animation: 'ov-pulse 2s ease-in-out infinite', flexShrink: 0,
      }}/>

      <span style={{
        fontSize: 9, fontWeight: 800, color: dotColor,
        letterSpacing: '2.5px', textTransform: 'uppercase', flexShrink: 0,
      }}>
        {t('overview.health')} — {t(statusKey)}
      </span>

      <span style={{ width: 1, height: 12, background: border, flexShrink: 0 }}/>
      <StatusIcon size={12} color={dotColor}/>
      <span style={{ fontSize: 11, color: C.textMuted }}>{detail}</span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Clock size={11} color={C.textDim}/>
        <span style={{ fontSize: 9, color: C.textDim, letterSpacing: '2px', textTransform: 'uppercase' }}>
          {t('overview.updated')}
        </span>
        <span style={{
          fontFamily: "'Barlow Condensed', monospace",
          fontSize: 13, fontWeight: 700, color: C.textMuted,
        }}>
          {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}

// ── PulseBar (trend summary strip) ───────────────────────────────────────────
function PulseBar({ spikeCount, total, today, roll7 }) {
  const { t }     = useTranslation()
  const spikeRate = total > 0 ? ((spikeCount / total) * 100).toFixed(1) : 0
  const delta     = today != null && roll7 != null ? today - roll7 : null
  const deltaSign = delta > 0 ? '+' : ''
  const deltaColor = delta > 0 ? ALARM.critical : delta < 0 ? ALARM.normal : C.textMuted

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.04)' }}>
      {[
        { labelKey: 'overview.spikeEvents',   value: spikeCount,                                          color: spikeCount > 0 ? ALARM.minor : ALARM.normal },
        { labelKey: 'overview.spikeRate',     value: `${spikeRate}%`,                                    color: +spikeRate > 5  ? ALARM.critical : ALARM.normal },
        { labelKey: 'overview.todayVsAvg',    value: delta != null ? `${deltaSign}${delta?.toFixed(0)}` : '—', color: deltaColor },
        { labelKey: 'overview.daysRecorded',  value: total,                                               color: C.blue },
      ].map(it => (
        <div key={it.labelKey} style={{
          background: C.bg3, padding: '12px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 9, color: C.textDim, letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700 }}>
            {t(it.labelKey)}
          </span>
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 18, fontWeight: 800, color: it.color, letterSpacing: '-.5px',
          }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── ChartPanel ────────────────────────────────────────────────────────────────
const ChartPanel = ({ title, sub, children, action, style = {} }) => (
  <div className="ov-chart-panel" style={{
    background: C.bg2, border: `1px solid ${C.border}`, padding: '22px 24px',
    position: 'relative', overflow: 'hidden', transition: 'border-color .3s', ...style,
  }}>
    <div className="ov-panel-accent" style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
      background: `linear-gradient(90deg, transparent, ${C.huawei}, transparent)`,
      transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s ease',
    }}/>
    {(title || sub || action) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          {title && <div style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '.5px', marginBottom: 3 }}>{title}</div>}
          {sub   && <div style={{ fontSize: 10, color: C.textDim, letterSpacing: '1px' }}>{sub}</div>}
        </div>
        {action && <div style={{ flexShrink: 0, marginLeft: 16 }}>{action}</div>}
      </div>
    )}
    {children}
  </div>
)

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function Overview() {
  const { t, i18n } = useTranslation()

  const [overview, setOverview] = useState(null)
  const [kpis,     setKpis]     = useState([])
  const [trend,    setTrend]    = useState([])
  const [regions,  setRegions]  = useState([])
  const [heatmap,  setHeatmap]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [lastFetch, setLastFetch] = useState(null)

  const fetchData = async () => {
    try {
      setError(null)
      const [ov, kp, tr, rg, hm] = await Promise.all([
        analyticsApi.overview(),
        analyticsApi.kpiTiles(),
        analyticsApi.complaintsTrend(),
        analyticsApi.complaintsByRegion(),
        analyticsApi.kpiHeatmap(),
      ])
      setOverview(ov.data)
      setKpis(kp.data?.tiles      || [])
      setTrend(tr.data?.trend     || [])
      setRegions(rg.data?.regions || [])
      setHeatmap(hm.data?.series  || [])
      setLastFetch(new Date())
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError(t('overview.connectionError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // Auto-refresh every 5 minutes — appropriate for NOC operational tempo
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <Wifi size={14} color={ALARM.normal} style={{ animation: 'ov-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.huawei }}>
          {t('overview.initializing')}
        </span>
      </div>
      <Spinner size={48}/>
    </div>
  )

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{
        background: `${ALARM.major}12`, border: `1px solid ${ALARM.major}40`,
        padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 16, marginTop: 40,
      }}>
        <AlertTriangle size={24} color={ALARM.major}/>
        <div>
          <div style={{ color: ALARM.major, fontSize: 13, fontWeight: 700, letterSpacing: '.5px', marginBottom: 4 }}>
            {t('overview.connectionError')}
          </div>
          <div style={{ color: C.textMuted, fontSize: 12 }}>{error}</div>
        </div>
        <button
          onClick={fetchData}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.textMuted, padding: '6px 14px', cursor: 'pointer', fontSize: 11,
          }}
        >
          <RefreshCw size={12}/> {t('common.retry')}
        </button>
      </div>
    </div>
  )

  // ── Derived values ────────────────────────────────────────────────────────
  const spikeCount    = trend.filter(d => d.is_spike).length
  const todayVal      = trend.length > 0 ? trend[trend.length - 1]?.total_complaints : null
  const roll7Val      = trend.length > 0 ? trend[trend.length - 1]?.roll7 : null
  const svcVals       = overview?.by_service || {}
  const svcTotal      = Object.values(svcVals).reduce((a, b) => a + b, 0)
  const regionsSorted = [...regions].sort((a, b) => b.total_complaints - a.total_complaints)

  const vals     = trend.map(d => d.total_complaints).filter(v => v != null)
  const meanC    = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
  const stdC     = vals.length > 0 ? Math.sqrt(vals.reduce((s, v) => s + (v - meanC) ** 2, 0) / vals.length) : 0
  const spikeThr = Math.round(meanC + 2.5 * stdC)

  // ── Chart: Complaint Trend ────────────────────────────────────────────────
  const trendChart = {
    series: [
      {
        name: t('overview.dailyComplaints'),
        type: 'area',
        data: trend.map(d => ({ x: d.date, y: d.total_complaints })),
      },
      {
        name: t('overview.anomalySpike'),
        type: 'scatter',
        data: trend.filter(d => d.is_spike).map(d => ({ x: d.date, y: d.total_complaints })),
      },
      {
        name: t('overview.avgLine'),
        type: 'line',
        data: trend.map(d => ({ x: d.date, y: d.roll7 != null ? parseFloat(d.roll7.toFixed(1)) : null })),
      },
    ],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'line', stacked: false },
      colors: [C.blue, ALARM.critical, C.cyan],
      stroke: { curve: ['smooth', 'straight', 'smooth'], width: [2, 0, 1.5], dashArray: [0, 0, 6] },
      markers: {
        size:         [0, 9, 0],
        strokeWidth:  [0, 2.5, 0],
        strokeColors: ['transparent', '#fff', 'transparent'],
        shape:        'circle',
        hover:        { size: 10 },
      },
      fill: {
        type:     ['gradient', 'solid', 'solid'],
        gradient: {
          shade: 'dark', type: 'vertical',
          gradientToColors: ['transparent'],
          opacityFrom: 0.22, opacityTo: 0.01, stops: [0, 95],
        },
      },
      xaxis: {
        type:       'datetime',
        title:      { text: 'Date', style: { fontSize: '10px', color: C.textDim } },
        labels:     { format: 'dd MMM', style: { fontSize: '10px', colors: C.textMuted } },
        axisBorder: { show: false },
        axisTicks:  { show: false },
      },
      yaxis: {
        min:   0,
        title: { text: t('overview.complaintsPerDay'), style: { fontSize: '10px', color: C.textMuted, fontWeight: 400 } },
        labels: { style: { fontSize: '10px', colors: C.textMuted }, formatter: v => v?.toFixed(0) },
      },
      // Spike threshold annotation — visual alarm line
      annotations: spikeThr > 0 ? {
        yaxis: [{
          y:               spikeThr,
          borderColor:     ALARM.minor,
          borderWidth:     1,
          strokeDashArray: 5,
          label: {
            text:      `${t('overview.spikeThreshold')} — ${spikeThr}`,
            position:  'right',
            offsetX:   -8,
            style: {
              background: `${ALARM.minor}1A`,
              color:      ALARM.minor,
              fontSize:   '9px',
              fontWeight: 600,
              padding:    { top: 3, right: 6, bottom: 3, left: 6 },
            },
          },
        }],
      } : {},
      tooltip: {
        shared:    true,
        intersect: false,
        x:         { format: 'dd MMM yyyy' },
        y: {
          formatter: (val, { seriesIndex }) => {
            if (seriesIndex === 1) return val != null ? `⚠ ${val} (spike)` : null
            if (seriesIndex === 2) return val != null ? `${val} (7d avg)` : null
            return val != null ? String(val) : null
          },
        },
      },
      legend: {
        position:        'top',
        horizontalAlign: 'left',
        offsetY:         -4,
        labels:          { colors: C.textMuted },
        markers:         { radius: 2 },
        itemMargin:      { horizontal: 16 },
      },
      grid: {
        borderColor:   'rgba(255,255,255,.04)',
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true }  },
      },
    },
  }

  // ── Chart: QoE Heatmap ────────────────────────────────────────────────────
  const heatChart = heatmap.length > 0 ? {
    series: heatmap,
    options: {
      ...base,
      chart: { ...base.chart, type: 'heatmap' },
      plotOptions: {
        heatmap: {
          radius:       0,
          enableShades: false,
          colorScale:   { ranges: HEATMAP_RANGES },
        },
      },
      dataLabels: { enabled: false },
      xaxis: {
        labels:     { rotate: -25, style: { fontSize: '9px', colors: C.textMuted } },
        position:   'top',
        axisBorder: { show: false },
        axisTicks:  { show: false },
        title:      { text: 'Month', style: { fontSize: '10px', color: C.textDim } },
      },
      yaxis: {
        labels: { style: { fontSize: '10px', colors: C.textMuted }, maxWidth: 120 },
        title:  { text: 'Region', style: { fontSize: '10px', color: C.textDim } },
      },
      tooltip: {
        y: {
          formatter: v => v != null
            ? `QoE ${v.toFixed(1)}/100 — ${
                v < 45 ? 'Critical' : v < 60 ? 'Very Poor' : v < 70 ? 'Poor' :
                v < 80 ? 'Fair'     : v < 90 ? 'Good'      : 'Excellent'
              }`
            : 'No data',
        },
      },
      legend: { show: false },
    },
  } : null

  // ── Chart: Complaints by Service (Donut) ──────────────────────────────────
  const svcChart = Object.keys(svcVals).length > 0 ? {
    series: Object.values(svcVals),
    options: {
      ...base,
      chart:  { ...base.chart, type: 'donut' },
      labels: Object.keys(svcVals),
      colors: [C.blue, C.cyan, C.teal, C.purple, '#5B8DEF', '#2DB8C5'],
      stroke: { width: 2, colors: [C.bg2] },
      plotOptions: {
        pie: {
          donut: {
            size:   '70%',
            labels: {
              show:  true,
              name:  { fontSize: '11px', color: C.textMuted, offsetY: -6 },
              value: {
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize:   '30px', fontWeight: 900, color: C.text, offsetY: 4,
                formatter:  v => `${((+v / svcTotal) * 100).toFixed(0)}%`,
              },
              total: {
                show:      true,
                label:     t('overview.categories'),
                fontSize:  '10px',
                color:     C.textMuted,
                formatter: () => String(Object.keys(svcVals).length),
              },
            },
          },
        },
      },
      tooltip: {
        y: { formatter: v => `${v.toLocaleString()} (${((v / svcTotal) * 100).toFixed(1)}%)` },
      },
      legend: {
        position:        'bottom',
        horizontalAlign: 'center',
        fontSize:        '11px',
        labels:          { colors: C.textMuted },
        itemMargin:      { horizontal: 8, vertical: 4 },
      },
      dataLabels: { enabled: false },
    },
  } : null

  // ── Chart: Complaints by Region (Horizontal Bar) ──────────────────────────
  const regChart = regionsSorted.length > 0 ? {
    series: [{ name: t('overview.complaints'), data: regionsSorted.map(r => r.total_complaints) }],
    options: {
      ...base,
      chart: { ...base.chart, type: 'bar' },
      plotOptions: {
        bar: {
          horizontal:   true,
          borderRadius: 0,
          barHeight:    '55%',
          distributed:  true,
          dataLabels:   { position: 'top' },
        },
      },
      colors:      regionsSorted.map((_, i) => REGION_COLORS[i % REGION_COLORS.length]),
      dataLabels:  {
        enabled:     true,
        textAnchor:  'start',
        offsetX:     10,
        style:       { fontSize: '10px', fontWeight: 600, colors: [C.text] },
        formatter:   v => v.toLocaleString(),
      },
      xaxis: {
        categories: regionsSorted.map(r => (r.region || '').replace(' Gouvernorat', '')),
        labels:     { style: { fontSize: '11px', colors: C.textMuted } },
        axisBorder: { show: false },
        axisTicks:  { show: false },
        title:      { text: t('overview.complaints'), style: { fontSize: '10px', color: C.textDim } },
      },
      yaxis: {
        labels: { style: { fontSize: '11px', colors: C.textMuted }, maxWidth: 130 },
      },
      legend:  { show: false },
      tooltip: { y: { formatter: v => `${v.toLocaleString()} ${t('overview.complaints')}` } },
      grid:    { xaxis: { lines: { show: false } } },
    },
  } : null

  // ── Dataset summary cards ─────────────────────────────────────────────────
  const infoCards = [
    { labelKey: 'overview.totalComplaints', value: overview?.total_complaints?.toLocaleString() || '—', color: ALARM.critical, Icon: Database   },
    { labelKey: 'overview.uniqueSubs',      value: overview?.unique_msisdns?.toLocaleString()   || '—', color: C.blue,         Icon: Users       },
    { labelKey: 'overview.geoCoverage',     value: `${overview?.unique_cities || '—'} ${t('overview.cities')}`,                color: ALARM.minor, Icon: Globe },
    { labelKey: 'overview.analysisPeriod',  value: overview?.date_min ? `${overview.date_min} → ${overview.date_max}` : '—',  color: C.purple,   Icon: Calendar },
  ]

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '40px 48px 80px', maxWidth: 1600, margin: '0 auto' }}>
      <style>{`
        @keyframes ov-pulse {
          0%,100% { opacity:1; transform:scale(1)   }
          50%      { opacity:.4; transform:scale(.8) }
        }
        .ov-stat-block:hover {
          border-color: rgba(207,10,44,.22) !important;
          background:   rgba(207,10,44,.03) !important;
          transform:    translateY(-2px);
          box-shadow:   0 8px 28px rgba(207,10,44,.06);
        }
        .ov-chart-panel:hover { border-color: rgba(207,10,44,.2) !important; }
        .ov-chart-panel:hover .ov-panel-accent { transform: scaleX(1) !important; }
        .ov-info-card:hover {
          border-color: rgba(207,10,44,.2) !important;
          background:   rgba(207,10,44,.025) !important;
          transform:    translateY(-1px);
        }
      `}</style>

      {/* ── HERO HEADER ── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 32, marginBottom: 28 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: `${C.huawei}1A`, border: `1px solid ${C.huawei}47`, padding: '6px 14px',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: C.huawei,
              display: 'inline-block', animation: 'ov-pulse 2s ease-in-out infinite',
            }}/>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.huawei }}>
              {t('overview.liveNetwork')}
            </span>
          </div>
          <span style={{ fontSize: 11, color: C.textDim, letterSpacing: '1.5px' }}>
            Huawei Technologies Tunisia
          </span>
          {/* Language toggle */}
          <button
            onClick={() => i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')}
            style={{
              marginLeft: 8, background: 'transparent', border: `1px solid ${C.border}`,
              color: C.textMuted, padding: '4px 10px', cursor: 'pointer', fontSize: 10,
              letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 5,
            }}
            title={t('layout.lang.toggle')}
          >
            <Globe size={10}/>
            {i18n.language === 'zh' ? 'EN' : '中文'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <h1 style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize:   'clamp(28px,3.5vw,54px)',
              fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1,
              color: C.text, marginBottom: 8,
            }}>
              {t('overview.title').replace(' Dashboard', '').replace(' 仪表板', '')}{' '}
              <span style={{ color: C.huawei, fontStyle: 'italic' }}>DASHBOARD</span>
            </h1>
            <p style={{ fontSize: 13, color: C.textMuted, fontWeight: 300, letterSpacing: '.3px' }}>
              {t('overview.subtitle')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: `● ${t('layout.live')}`,                                           color: ALARM.normal,  bg: `${ALARM.normal}14`,   bd: `${ALARM.normal}47` },
              { label: `${(overview?.total_complaints || 0).toLocaleString()} ${t('layout.complaints')}`, color: C.textMuted, bg: 'rgba(255,255,255,.02)', bd: C.border },
              { label: `${overview?.unique_regions || 0} ${t('layout.governorates')}`,    color: C.textMuted,   bg: 'rgba(255,255,255,.02)', bd: C.border },
              { label: `${overview?.unique_cities  || 0} ${t('overview.cities')}`,        color: C.textMuted,   bg: 'rgba(255,255,255,.02)', bd: C.border },
            ].map((b, i) => (
              <span key={i} style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase',
                padding: '5px 14px', border: `1px solid ${b.bd}`, background: b.bg, color: b.color,
              }}>
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── 1. SYSTEM HEALTH BANNER (highest hierarchy — NOC sees this first) ── */}
      <SystemHealthBanner kpis={kpis} spikeCount={spikeCount} total={trend.length}/>

      {/* ── 2. KPI TILES ── */}
      <SectionLabel
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge variant="green">▲ {t('overview.improving')}</Badge>
            <Badge variant="red">▼ {t('overview.degrading')}</Badge>
            <Badge variant="blue">→ {t('overview.flat')}</Badge>
          </div>
        }
        sub={t('overview.kpiSubtitle')}
      >
        {t('overview.kpiSection')}
      </SectionLabel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.04)' }}>
        {kpis.map((kpi, i) => (
          <StatBlock key={i} {...kpi} color={getKpiAlarmColor(kpi)} icon={KPI_ICONS[i % KPI_ICONS.length]}/>
        ))}
      </div>

      {/* ── 3. COMPLAINT TREND ── */}
      <SectionLabel
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge variant="amber">{spikeCount} {t('overview.spikeBadge')}</Badge>
            <Badge variant="gray">{t('overview.zScore')}</Badge>
          </div>
        }
        sub={t('overview.trendSubtitle')}
      >
        {t('overview.trendSection')}
      </SectionLabel>

      <PulseBar spikeCount={spikeCount} total={trend.length} today={todayVal} roll7={roll7Val}/>

      <ChartPanel style={{ marginTop: 1 }}>
        <ReactApexChart options={trendChart.options} series={trendChart.series} type="line" height={420}/>
      </ChartPanel>

      {/* ── 4. QoE HEATMAP + COMPLAINTS BY SERVICE ── */}
      <SectionLabel sub={t('overview.heatSectionSub')}>
        {t('overview.heatSection')} &amp; {t('overview.svcSection')}
      </SectionLabel>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>
        <ChartPanel title={t('overview.heatSection')} sub={t('overview.heatSubtitle')}>
          {heatChart ? (
            <>
              <ReactApexChart options={heatChart.options} series={heatChart.series} type="heatmap" height={380}/>
              {/* Inline legend for alarm colours */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                {HEATMAP_RANGES.map(r => (
                  <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, background: r.color }}/>
                    <span style={{ fontSize: 9, color: C.textDim, letterSpacing: '.5px' }}>{r.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Activity size={36} color="rgba(255,255,255,.18)"/>}
              title={t('overview.noHeatmap')}
              desc={t('overview.noHeatmapDesc')}
            />
          )}
        </ChartPanel>

        <ChartPanel
          title={t('overview.svcSection')}
          sub={`${Object.keys(svcVals).length} ${t('overview.categories')} · ${svcTotal.toLocaleString()}`}
        >
          {svcChart
            ? <ReactApexChart options={svcChart.options} series={svcChart.series} type="donut" height={380}/>
            : <EmptyState icon={<LayoutGrid size={36} color="rgba(255,255,255,.18)"/>} title={t('overview.noService')}/>
          }
        </ChartPanel>
      </div>

      {/* ── 5. COMPLAINTS BY REGION ── */}
      <SectionLabel
        action={<Badge variant="blue">{regionsSorted.length} {t('overview.regions')}</Badge>}
        sub={t('overview.regionSubtitle')}
      >
        {t('overview.regionSection')}
      </SectionLabel>

      {regChart
        ? <ChartPanel>
            <ReactApexChart
              options={regChart.options} series={regChart.series} type="bar"
              height={Math.max(320, regionsSorted.length * 34)}
            />
          </ChartPanel>
        : <EmptyState icon={<Map size={36} color="rgba(255,255,255,.18)"/>} title={t('overview.noRegion')}/>
      }

      {/* ── 6. DATASET SUMMARY ── */}
      <SectionLabel sub={t('overview.datasetSubtitle')}>
        {t('overview.datasetSection')}
      </SectionLabel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.04)' }}>
        {infoCards.map((item, i) => (
          <div key={i} className="ov-info-card" style={{
            background:    C.bg3,
            border:        `1px solid ${C.border}`,
            borderLeft:    `2px solid ${item.color}`,
            padding:       '20px 22px',
            display:       'flex',
            alignItems:    'center',
            gap:           16,
            transition:    'all .25s',
            position:      'relative',
            overflow:      'hidden',
          }}>
            <div style={{
              width: 38, height: 38,
              background: `${item.color}12`, border: `1px solid ${item.color}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {/* Lucide icon — size and color as props */}
              <item.Icon size={15} color={item.color}/>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 9, color: C.textDim, letterSpacing: '1.8px',
                textTransform: 'uppercase', fontWeight: 700, marginBottom: 5,
              }}>
                {t(item.labelKey)}
              </div>
              <div style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 16, fontWeight: 800, color: item.color,
                wordBreak: 'break-all', lineHeight: 1.2, letterSpacing: '-.3px',
              }}>
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}