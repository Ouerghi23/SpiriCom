// src/pages/Overview.jsx
import { useState, useEffect, useCallback } from 'react'
import { useTranslation }                   from 'react-i18next'
import ReactApexChart                       from 'react-apexcharts'
import {
  Activity, Users, Globe, Calendar, Database,
  AlertTriangle, TrendingUp, TrendingDown,
  CheckCircle2, BarChart3, Clock, RefreshCw, Minus,
  ShieldAlert, Zap, Wifi,
} from 'lucide-react'

import { analyticsApi } from '../api/client'
import {
  HW, ALARM, FONT, gapColor, gridLine, blueRamp,
  SectionLabel, StatBlock, ChartPanel, GapGrid, StatStrip,
  AlertBanner, InfoCard, Badge, Spinner, EmptyState,
  baseChartOptions,
} from '../components/UI'
import { useTheme } from '../context/ThemeContext'

// ── O-8: named thresholds — UI text derives from these ───────────────
const SLA_OPEN_THRESHOLD   = 30    // % open above which SLA is breached
const UNRESOLVED_THRESHOLD = 40    // % unresolved escalation point
const SPIKE_SIGMA          = 2.5   // z-score threshold for spike flag

const DELTA_ICONS = { up: TrendingUp, down: TrendingDown, flat: Minus }

const DOW_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DOW_FULL  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday',
                   'Friday', 'Saturday', 'Sunday']

const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)

// ── Status grouping (domain logic — stays in the page) ───────────────
function groupStatuses(by_status = {}) {
  const closed   = (by_status['CLOSED'] || 0) +
                   (by_status['CLOSED ALERT RESOLVED'] || 0) +
                   (by_status['CLOSED REFUNDED'] || 0) +
                   (by_status['CLOSED DTFO'] || 0)
  const open_    = by_status['OPEN'] || 0
  const in_prog  = (by_status['IN PROGRESS RETURN FOR PROCESSING'] || 0) +
                   (by_status['IN PROGRESS DT'] || 0) +
                   (by_status['INPROGRESS'] || 0) +
                   (by_status['IN PROGRESS RETURN NOT COMPLETE'] || 0) +
                   (by_status['IN PROGRESS UNFOUNDED RETURN'] || 0)
  const resolved = (by_status['RESOLVED'] || 0) + (by_status['RESOLVED DT'] || 0)
  return { closed, open: open_, in_progress: in_prog, resolved }
}

// ── French → English complaint-type normalization ─────────────────────
const normalizeType = k => k
  .replace('DÉBIT FAIBLE', 'Slow').replace('INTERNET MOBILE', 'Internet')
  .replace('ECHEC ÉMISSION/RÉCEPTION APPEL', 'Call Failure')
  .replace("PAS D'ACCÈS", 'No Access')
  .replace('ECHEC CONNEXION', 'Conn. Fail')
  .replace('PAS DE COUVERTURE VOIX', 'No Voice Coverage')
  .replace('COUPURE DE CONNEXION', 'Internet Drop')
  .replace("COUPURE D'APPEL", 'Call Drop')
  .replace('MAUVAISE QUALITÉ DE SON', 'Poor Voice Quality')

// ════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ════════════════════════════════════════════════════════════════════
export default function Overview() {
  const { t }        = useTranslation()
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)

  // ── State ─────────────────────────────────────────────────────────
  const [overview,    setOverview]    = useState(null)
  const [trend,       setTrend]       = useState([])
  const [regions,     setRegions]     = useState([])
  const [dow,         setDow]         = useState({})
  const [status,      setStatus]      = useState({})
  const [analysis,    setAnalysis]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [refreshing,  setRefreshing]  = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)   // O-5

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async (background = false) => {
    try {
      setError(null)
      background ? setRefreshing(true) : setLoading(true)

      const [ovRes, trRes, rgRes, dowRes, stRes] = await Promise.allSettled([
        analyticsApi.overview(),
        analyticsApi.complaintsTrend(),
        analyticsApi.complaintsByRegion(),
        analyticsApi.complaintsDow(),
        analyticsApi.complaintsStatus(),
      ])

      if (ovRes.status  === 'fulfilled') setOverview(ovRes.value.data)
      if (trRes.status  === 'fulfilled') setTrend(trRes.value.data?.trend || [])
      if (rgRes.status  === 'fulfilled') setRegions(rgRes.value.data?.regions || [])
      if (dowRes.status === 'fulfilled') setDow(dowRes.value.data?.dow || {})
      if (stRes.status  === 'fulfilled') setStatus(stRes.value.data?.status || {})

      try {
        const anRes = await analyticsApi.analysisResults()
        setAnalysis(anRes.data)
      } catch { /* fallback: derive from overview data */ }

      setLastUpdated(new Date())   // O-5: data time, not render time
    } catch {
      setError(t('overview.connectionError'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    fetchData(false)
    const interval = setInterval(() => fetchData(true), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  const base = baseChartOptions(T)

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
        <Wifi size={14} color={ALARM.normal}
          style={{ animation: 'noc-pulse 1.8s ease-in-out infinite' }}/>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
          textTransform: 'uppercase', color: HW.blue }}>
          {t('overview.initializing') || 'INITIALIZING NOC'}
        </span>
      </div>
      <Spinner size={48}/>
    </div>
  )

  // ── Error ─────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ padding: '40px 48px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ background: `${ALARM.major}10`, border: `1px solid ${ALARM.major}40`,
        padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 16, marginTop: 40 }}>
        <AlertTriangle size={22} color={ALARM.major}/>
        <div>
          <div style={{ color: ALARM.major, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            {t('overview.connectionError')}
          </div>
          <div style={{ color: T.textMuted, fontSize: 12 }}>{error}</div>
        </div>
        <button onClick={() => fetchData(false)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted,
            padding: '6px 14px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
          <RefreshCw size={12}/> {t('common.retry') || 'Retry'}
        </button>
      </div>
    </div>
  )

  // ══ Derived values ══════════════════════════════════════════════
  const spikeCount    = trend.filter(d => d.is_spike).length
  const todayVal      = trend.length > 0 ? trend[trend.length - 1]?.total_complaints : null
  const roll7Val      = trend.length > 0 ? trend[trend.length - 1]?.roll7 : null
  const regionsSorted = [...regions].sort((a, b) => b.total_complaints - a.total_complaints)

  const totalComplaints = overview?.total_complaints || analysis?.overview?.total_complaints || 0
  const unresolved      = analysis?.overview?.unresolved_pct || 0
  const statusGroups    = groupStatuses(analysis?.by_status || status)
  const openPct         = totalComplaints > 0
    ? (statusGroups.open / totalComplaints) * 100 : 0
  const slaBreached     = openPct > SLA_OPEN_THRESHOLD

  // ── System health severity (computed) ─────────────────────────────
  const spikeRate = trend.length > 0 ? spikeCount / trend.length : 0
  const healthSeverity =
    spikeRate > 0.10 ? 'critical' :
    spikeRate > 0.05 ? 'minor'    : 'normal'
  const healthText =
    healthSeverity === 'critical' ? (t('overview.critical') || 'CRITICAL') :
    healthSeverity === 'minor'    ? (t('overview.degraded') || 'DEGRADED') :
                                    (t('overview.nominal')  || 'NOMINAL')

  // ── Monthly trend (O-4: partial-month handled honestly) ───────────
  const monthlyEntries = analysis?.monthly_trend
    ? Object.entries(analysis.monthly_trend)
        .sort(([a], [b]) => new Date(a) - new Date(b))
    : []
  let monthlyData = monthlyEntries.map(([k, v]) => ({
    month: new Date(k).toLocaleString('en', { month: 'short' }),
    count: v,
  }))
  const dateMaxStr = analysis?.overview?.date_max || overview?.date_max
  if (dateMaxStr && monthlyEntries.length > 1) {
    const dMax    = new Date(dateMaxStr)
    const lastKey = new Date(monthlyEntries[monthlyEntries.length - 1][0])
    const daysInM = new Date(dMax.getFullYear(), dMax.getMonth() + 1, 0).getDate()
    const partial = lastKey.getMonth() === dMax.getMonth()
                 && lastKey.getFullYear() === dMax.getFullYear()
                 && dMax.getDate() < daysInM
    if (partial) monthlyData = monthlyData.slice(0, -1)
  }

  // O-3: monthly insight computed
  const peakMonth = monthlyData.length
    ? monthlyData.reduce((m, d) => (d.count > m.count ? d : m), monthlyData[0])
    : null

  // ── DOW (O-3: weekly insights computed) ───────────────────────────
  const dowData    = Object.keys(dow).length > 0 ? dow : analysis?.dow_distribution || {}
  const dowValues  = DOW_ORDER.map(d => dowData[d] || 0)
  const hasDow     = dowValues.some(v => v > 0)
  const todayDow   = DOW_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
  const peakIdx    = dowValues.indexOf(Math.max(...dowValues))
  const peakDay    = hasDow ? DOW_FULL[peakIdx] : '—'
  const weekdayAvg = avg(dowValues.slice(0, 5))
  const weekendAvg = avg(dowValues.slice(5))
  const wkdDelta   = weekendAvg > 0
    ? ((weekdayAvg - weekendAvg) / weekendAvg) * 100 : null

  // ── Complaint types (O-3: top type computed) ──────────────────────
  const complaintTypes = analysis?.by_sub_sub_category || {}
  const typeLabels = Object.keys(complaintTypes).map(normalizeType)
  const typeValues = Object.values(complaintTypes)
  const typeTotal  = typeValues.reduce((a, b) => a + b, 0)
  const topTypeIdx = typeValues.length ? typeValues.indexOf(Math.max(...typeValues)) : -1
  const topType    = topTypeIdx >= 0 ? typeLabels[topTypeIdx] : null
  const topTypePct = topTypeIdx >= 0 && typeTotal > 0
    ? (typeValues[topTypeIdx] / typeTotal) * 100 : 0

  // ── Segments (O-3: top-2 computed, correct denominator) ───────────
  const segmentData = analysis?.by_segment || {}
  const segSorted   = Object.entries(segmentData).sort((a, b) => b[1] - a[1])
  const segLabels   = segSorted.map(([k]) => k)
  const segValues   = segSorted.map(([, v]) => v)
  const segTotal    = segValues.reduce((a, b) => a + b, 0)
  const top2Names   = segSorted.slice(0, 2).map(([k]) => k)
  const top2Pct     = segTotal > 0
    ? (segSorted.slice(0, 2).reduce((s, [, v]) => s + v, 0) / segTotal) * 100 : 0

  // ── Spike threshold from trend (badge derives from SPIKE_SIGMA) ───
  const vals     = trend.map(d => d.total_complaints).filter(v => v != null)
  const meanC    = avg(vals)
  const stdC     = vals.length
    ? Math.sqrt(vals.reduce((s, v) => s + (v - meanC) ** 2, 0) / vals.length) : 0
  const spikeThr = Math.round(meanC + SPIKE_SIGMA * stdC)

  // ══ Charts ══════════════════════════════════════════════════════

  // 1. Complaint trend — area + spike scatter + 7d rolling + threshold
  const trendChart = {
    series: [
      { name: t('overview.dailyComplaints'), type: 'area',
        data: trend.map(d => ({ x: d.date, y: d.total_complaints })) },
      { name: t('overview.anomalySpike'), type: 'scatter',
        data: trend.filter(d => d.is_spike).map(d => ({ x: d.date, y: d.total_complaints })) },
      { name: t('overview.avgLine'), type: 'line',
        data: trend.map(d => ({ x: d.date, y: d.roll7 != null ? parseFloat(d.roll7.toFixed(1)) : null })) },
    ],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'line', stacked: false },
      colors: [HW.blue, ALARM.critical, HW.blueLight],
      stroke: { curve: ['smooth', 'straight', 'smooth'], width: [2, 0, 1.5], dashArray: [0, 0, 6] },
      // O-6: marker ring matches card background in both themes
      markers: { size: [0, 8, 0], strokeWidth: [0, 2, 0],
        strokeColors: ['transparent', T.bgCard, 'transparent'], hover: { size: 10 } },
      fill: { type: ['gradient', 'solid', 'solid'],
        gradient: { shade: 'dark', type: 'vertical', gradientToColors: ['transparent'],
          opacityFrom: 0.2, opacityTo: 0.01, stops: [0, 95] } },
      xaxis: { type: 'datetime',
        labels: { format: 'dd MMM', style: { fontSize: '10px', colors: T.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { min: 0,
        title: { text: t('overview.complaintsPerDay') || 'Complaints/Day',
          style: { fontSize: '10px', color: T.textMuted, fontWeight: 400 } },
        labels: { style: { fontSize: '10px', colors: T.textMuted }, formatter: v => v?.toFixed(0) } },
      annotations: spikeThr > 0 ? {
        yaxis: [{ y: spikeThr, borderColor: ALARM.minor, borderWidth: 1, strokeDashArray: 5,
          label: { text: `${t('overview.spikeThreshold') || 'Threshold'} — ${spikeThr}`,
            position: 'right', offsetX: -8,
            style: { background: `${ALARM.minor}1A`, color: ALARM.minor,
              fontSize: '9px', fontWeight: 600 } } }],
      } : {},
      tooltip: { shared: true, intersect: false, x: { format: 'dd MMM yyyy' },
        y: { formatter: (val, { seriesIndex }) =>
          seriesIndex === 1 ? `Alert: ${val}` :
          seriesIndex === 2 ? `${val} (7d avg)` : String(val) } },
      legend: { position: 'top', horizontalAlign: 'left', offsetY: -4,
        labels: { colors: T.textMuted }, itemMargin: { horizontal: 16 } },
      grid: { borderColor: gridLine(T), strokeDashArray: 3,
        xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    },
  }

  // 2. Resolution Status donut — O-2: pipeline order, Open = critical
  const DONUT = [
    { label: 'Open',        value: statusGroups.open,        color: ALARM.critical },
    { label: 'In Progress', value: statusGroups.in_progress, color: ALARM.minor    },
    { label: 'Resolved',    value: statusGroups.resolved,    color: HW.blue        },
    { label: 'Closed',      value: statusGroups.closed,      color: ALARM.normal   },
  ]
  const totalGrouped = DONUT.reduce((s, d) => s + d.value, 0)
  const resolutionChart = totalGrouped > 0 ? {
    series: DONUT.map(d => d.value),
    options: {
      ...base,
      chart:  { ...base.chart, type: 'donut' },
      labels: DONUT.map(d => d.label),
      colors: DONUT.map(d => d.color),
      stroke: { width: 2, colors: [T.bgCard] },
      plotOptions: { pie: { donut: { size: '68%', labels: {
        show: true,
        name:  { fontSize: '11px', color: T.textMuted, offsetY: -6 },
        value: { fontFamily: FONT.display, fontSize: '28px', fontWeight: 900,
          color: T.text, offsetY: 4, formatter: v => `${(+v).toLocaleString()}` },
        total: { show: true, label: 'Total', fontSize: '10px', color: T.textMuted,
          formatter: () => totalGrouped.toLocaleString() },
      } } } },
      legend: { position: 'bottom', fontSize: '11px', labels: { colors: T.textMuted },
        itemMargin: { horizontal: 8, vertical: 4 } },
      dataLabels: { enabled: false },
      tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v.toLocaleString()} (${((v / totalGrouped) * 100).toFixed(1)}%)` } },
    },
  } : null

  // 3. Weekly pattern — O-2: today = full blue, others dimmed, no red
  const weeklyChart = {
    series: [{ name: t('overview.complaints') || 'Complaints', data: dowValues }],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'bar' },
      colors: DOW_ORDER.map(d => {
        if (d === todayDow) return HW.blue                       // today: full
        if (d === 'Sat' || d === 'Sun')
          return T.mode === 'dark' ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.16)'
        return 'rgba(0,147,213,.40)'                             // weekdays: dimmed
      }),
      plotOptions: { bar: { columnWidth: '72%', borderRadius: 0, distributed: true } },
      xaxis: { categories: DOW_ORDER,
        labels: { style: { fontSize: '11px', fontFamily: FONT.display,
          colors: T.textMuted, fontWeight: 600 } },
        axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { fontSize: '10px', colors: T.textMuted },
        formatter: v => v?.toFixed(0) } },
      dataLabels: { enabled: true,
        style: { fontSize: '10px', fontWeight: 700, fontFamily: FONT.display,
          colors: [T.text] },                                   // O-6
        formatter: v => (v > 0 ? v.toLocaleString() : '') },
      legend: { show: false },
      grid: { borderColor: gridLine(T), strokeDashArray: 3,
        xaxis: { lines: { show: false } } },
      tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v?.toLocaleString()} complaints` } },
    },
  }

  // 4. Monthly trend area — O-2: blue markers
  const monthlyChart = monthlyData.length > 0 ? {
    series: [{ name: t('overview.monthlyComplaints') || 'Monthly Complaints',
      data: monthlyData.map(d => d.count) }],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'area' },
      colors: [HW.blue],
      stroke: { curve: 'smooth', width: 2.5 },
      fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical',
        gradientToColors: ['transparent'], opacityFrom: 0.3, opacityTo: 0.01 } },
      markers: { size: 5, colors: [HW.blue], strokeColors: T.bgCard,
        strokeWidth: 2, hover: { size: 7 } },
      xaxis: { categories: monthlyData.map(d => d.month),
        labels: { style: { fontSize: '11px', fontFamily: FONT.display,
          colors: T.textMuted, fontWeight: 600 } },
        axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { fontSize: '10px', colors: T.textMuted },
        formatter: v => `${(v / 1000).toFixed(1)}k` } },
      dataLabels: { enabled: true,
        style: { fontSize: '10px', fontWeight: 700, fontFamily: FONT.display,
          colors: [T.text] },
        formatter: v => `${(v / 1000).toFixed(1)}k` },
      grid: { borderColor: gridLine(T), strokeDashArray: 3 },
      tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v?.toLocaleString()} complaints` } },
    },
  } : null

  // 5. Complaint types — O-2: rank-graded blue, no rainbow
  const typeChart = typeValues.length > 0 ? {
    series: [{ name: t('overview.complaints') || 'Complaints', data: typeValues }],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'bar' },
      colors: typeValues.map((_, i) => blueRamp(i)),
      plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: '60%',
        distributed: true, dataLabels: { position: 'top' } } },
      xaxis: { categories: typeLabels,
        labels: { style: { fontSize: '10px', colors: T.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false },
        title: { text: t('overview.complaints') || 'Complaints',
          style: { fontSize: '10px', color: T.textDim } } },
      yaxis: { labels: { style: { fontSize: '10px', colors: T.textMuted }, maxWidth: 150 } },
      dataLabels: { enabled: true, textAnchor: 'start', offsetX: 8,
        style: { fontSize: '10px', fontWeight: 700, colors: [T.text] },
        formatter: v => `${v.toLocaleString()} (${((v / typeTotal) * 100).toFixed(0)}%)` },
      legend: { show: false },
      grid: { xaxis: { lines: { show: false } }, borderColor: gridLine(T), strokeDashArray: 3 },
      tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v?.toLocaleString()} (${((v / typeTotal) * 100).toFixed(1)}%)` } },
    },
  } : null

  // 6. Segment bar — O-2: rank-graded blue (data pre-sorted desc)
  const segmentChart = segValues.length > 0 ? {
    series: [{ name: 'Complaints', data: segValues }],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'bar' },
      colors: segValues.map((_, i) => blueRamp(i)),
      plotOptions: { bar: { columnWidth: '65%', borderRadius: 0, distributed: true } },
      xaxis: { categories: segLabels,
        labels: { rotate: -25, style: { fontSize: '10px', fontFamily: FONT.display,
          colors: T.textMuted, fontWeight: 600 } },
        axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { fontSize: '10px', colors: T.textMuted },
        formatter: v => v?.toLocaleString() } },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: { borderColor: gridLine(T), strokeDashArray: 3 },
      tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v?.toLocaleString()} (${((v / segTotal) * 100).toFixed(1)}%)` } },
    },
  } : null

  // 7. Region bar — O-2: shared blueRamp (was an inline copy of it)
  const regChart = regionsSorted.length > 0 ? {
    series: [{ name: t('overview.complaints'),
      data: regionsSorted.map(r => r.total_complaints) }],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'bar' },
      plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: '55%',
        distributed: true, dataLabels: { position: 'top' } } },
      colors: regionsSorted.map((_, i) => blueRamp(i)),
      dataLabels: { enabled: true, textAnchor: 'start', offsetX: 10,
        style: { fontSize: '10px', fontWeight: 600, colors: [T.text] },
        formatter: v => v.toLocaleString() },
      xaxis: { categories: regionsSorted.map(r =>
          (r.region || '').replace(' GOUVERNORAT', '').replace(' Governorate', '')),
        labels: { style: { fontSize: '11px', colors: T.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false },
        title: { text: t('overview.complaints'),
          style: { fontSize: '10px', color: T.textDim } } },
      yaxis: { labels: { style: { fontSize: '11px', colors: T.textMuted }, maxWidth: 130 } },
      legend: { show: false },
      grid: { xaxis: { lines: { show: false } } },
      tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v.toLocaleString()} complaints` } },
    },
  } : null

  // ══ KPI tiles ═══════════════════════════════════════════════════
  const kpiTiles = [
    {
      label: t('overview.totalComplaints') || 'Total Complaints',
      value: totalComplaints.toLocaleString(),
      color: HW.blue,
      icon:  Database,
      sub:   `${overview?.date_min || '—'} → ${overview?.date_max || '—'}`,
    },
    {
      label: t('overview.openComplaints') || 'Open Complaints',
      value: statusGroups.open.toLocaleString(),
      color: slaBreached ? ALARM.critical : ALARM.normal,   // O-2: severity, not brand red
      icon:  slaBreached ? ShieldAlert : CheckCircle2,
      sub:   `${openPct.toFixed(1)}% open rate`,
      alert: slaBreached,
      delta: slaBreached ? +(openPct - SLA_OPEN_THRESHOLD).toFixed(1) : null,
      good:  false,
    },
    {
      label: t('overview.uniqueSubs') || 'Unique Subscribers',
      value: (overview?.unique_msisdns || analysis?.overview?.unique_msisdns || 0).toLocaleString(),
      color: '#8B5CF6',
      icon:  Users,
      sub:   `${overview?.unique_cities || analysis?.overview?.n_cities || 0} cities covered`,
    },
    {
      label: t('overview.unresolvedPct') || 'Unresolved Rate',
      value: `${unresolved.toFixed(1)}`,
      unit:  '%',
      color: unresolved > UNRESOLVED_THRESHOLD ? ALARM.major : ALARM.minor,
      icon:  AlertTriangle,
      sub:   `${statusGroups.closed.toLocaleString()} closed`,
      delta: +(unresolved - UNRESOLVED_THRESHOLD).toFixed(1),
      good:  false,
    },
  ]

  // ══ Render ══════════════════════════════════════════════════════
  return (
    <div style={{ padding: '36px 44px 80px', maxWidth: 1600, margin: '0 auto',
      background: T.bg, minHeight: '100vh', transition: 'background .3s' }}>

      {/* ══ HERO HEADER ════════════════════════════════════════════ */}
      <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 28, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          {/* O-2: live = healthy → green status pill (was brand red) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7,
            background: `${ALARM.normal}10`, border: `1px solid ${ALARM.normal}40`,
            padding: '5px 13px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ALARM.normal,
              display: 'inline-block', animation: 'noc-pulse 2s ease-in-out infinite' }}/>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
              textTransform: 'uppercase', color: ALARM.normal }}>
              {t('overview.liveNetwork') || 'LIVE NETWORK'}
            </span>
          </div>
          <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '1.5px' }}>
            Huawei Technologies Tunisia
          </span>
          {refreshing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 6 }}>
              <RefreshCw size={11} color={T.textDim}
                style={{ animation: 'noc-spin .9s linear infinite' }}/>
              <span style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.5px',
                textTransform: 'uppercase' }}>
                {t('overview.refreshing') || 'Refreshing'}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
          <div>
            {/* The ONE brand-red element on this page (hero accent) */}
            <h1 style={{ fontFamily: FONT.display, fontSize: 'clamp(26px,3.5vw,52px)',
              fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1,
              color: T.text, marginBottom: 8 }}>
              {t('overview.titleShort') || 'NOC'}{' '}
              <span style={{ color: HW.red, fontStyle: 'italic' }}>
                {t('overview.titleAccent') || 'OVERVIEW'}
              </span>
            </h1>
            <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 300, letterSpacing: '.3px' }}>
              {t('overview.subtitle') || 'Real-time telecom complaint analytics — SpiriCom & Ooredoo Tunisia'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              `${totalComplaints.toLocaleString()} ${t('layout.complaints') || 'Complaints'}`,
              `${overview?.unique_regions || analysis?.overview?.n_provinces || 0} ${t('layout.governorates') || 'Governorates'}`,
              `${overview?.unique_cities || analysis?.overview?.n_cities || 0} ${t('overview.cities') || 'Cities'}`,
            ].map(label => (
              <span key={label} style={{ fontSize: 10, fontWeight: 800,
                letterSpacing: '1.5px', textTransform: 'uppercase', padding: '5px 13px',
                border: `1px solid ${T.border}`,
                background: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)',
                color: T.textMuted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══ 1. SYSTEM HEALTH + SLA ALERT ══════════════════════════ */}
      <AlertBanner
        severity={healthSeverity}
        title={`${t('overview.health') || 'SYSTEM'} — ${healthText}`}
        message={`${spikeCount} ${t('overview.spikes') || 'complaint spike(s)'} in ${trend.length} days`}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Clock size={11} color={T.textDim}/>
            <span style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
              textTransform: 'uppercase' }}>
              {t('overview.updated') || 'UPDATED'}
            </span>
            <span style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: 700,
              color: T.textMuted }}>
              {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}   {/* O-5 */}
            </span>
          </div>
        }
      />
      {slaBreached && (
        <AlertBanner
          severity="critical"
          icon={ShieldAlert}
          title={t('overview.slaAlert') || 'SLA BREACH'}
          message={t('overview.slaAlertDesc') ||
            `${openPct.toFixed(1)}% of complaints remain OPEN — exceeds ${SLA_OPEN_THRESHOLD}% SLA threshold`}
          value={`${openPct.toFixed(1)}%`}
        />
      )}

      {/* ══ 2. KPI TILES ══════════════════════════════════════════ */}
      <SectionLabel
        sub={`${analysis?.overview?.date_range_days || trend.length || 0} days monitored · ${spikeCount} anomaly spikes detected`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge variant={slaBreached ? 'critical' : 'normal'}>
              {statusGroups.open.toLocaleString()} OPEN
            </Badge>
            <Badge variant="normal">{statusGroups.closed.toLocaleString()} CLOSED</Badge>
          </div>
        }>
        {t('overview.kpiSection') || 'COMPLAINT INTELLIGENCE'}
      </SectionLabel>

      <GapGrid columns="repeat(4,1fr)">
        {kpiTiles.map((kpi, i) => (
          <StatBlock key={i} {...kpi} deltaIcons={DELTA_ICONS}/>
        ))}
      </GapGrid>

      {/* ══ 3. COMPLAINT TREND ════════════════════════════════════ */}
      <SectionLabel
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge variant={spikeCount > 0 ? 'minor' : 'normal'}>
              {spikeCount} {t('overview.spikeBadge') || 'SPIKES'}
            </Badge>
            {/* O-3: badge derives from the actual constant */}
            <Badge variant="gray">{`Z-SCORE ≥ ${SPIKE_SIGMA}σ`}</Badge>
          </div>
        }
        sub={t('overview.trendSubtitle') ||
          'Daily complaint volume with 7-day rolling average and spike detection'}>
        {t('overview.trendSection') || 'COMPLAINT VOLUME — DAILY TREND'}
      </SectionLabel>

      <StatStrip items={[
        { label: t('overview.spikeEvents') || 'SPIKE EVENTS', value: spikeCount,
          color: spikeCount > 0 ? ALARM.minor : ALARM.normal },
        { label: t('overview.spikeRate') || 'SPIKE RATE',
          value: `${(spikeRate * 100).toFixed(1)}%`,
          color: spikeRate > 0.05 ? ALARM.critical : ALARM.normal },
        { label: t('overview.todayVsAvg') || 'TODAY VS 7D AVG',
          value: todayVal != null && roll7Val != null
            ? `${todayVal - roll7Val > 0 ? '+' : ''}${(todayVal - roll7Val).toFixed(0)}` : '—',
          color: todayVal != null && roll7Val != null
            ? (todayVal - roll7Val > 0 ? ALARM.critical
              : todayVal - roll7Val < 0 ? ALARM.normal : T.textMuted)
            : T.textMuted },
        { label: t('overview.daysRecorded') || 'DAYS RECORDED',
          value: trend.length, color: HW.blue },
      ]}/>
      <ChartPanel style={{ marginTop: 1 }}>
        <ReactApexChart options={trendChart.options} series={trendChart.series}
          type="line" height={380}/>
      </ChartPanel>

      {/* ══ 4. RESOLUTION STATUS + WEEKLY PATTERN ════════════════ */}
      <SectionLabel
        sub={`Status breakdown from NB01 · Day-of-week distribution${hasDow ? ` · ${peakDay} peak` : ''}`}
        action={slaBreached
          ? <Badge variant="critical">SLA BREACH {openPct.toFixed(1)}%</Badge>
          : <Badge variant="normal">SLA OK</Badge>}>
        {t('overview.resolutionSection') || 'RESOLUTION STATUS & WEEKLY PATTERN'}
      </SectionLabel>

      <GapGrid columns="1fr 1.6fr">
        {/* Resolution donut */}
        <ChartPanel
          title={t('overview.resolutionTitle') || 'Resolution Status'}
          sub={`${statusGroups.open.toLocaleString()} open · ${statusGroups.closed.toLocaleString()} closed · SLA threshold ${SLA_OPEN_THRESHOLD}%`}>
          {resolutionChart ? (
            <>
              <ReactApexChart options={resolutionChart.options}
                series={resolutionChart.series} type="donut" height={280}/>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 6, marginTop: 12 }}>
                {DONUT.map(({ label, value, color }) => (
                  <div key={label} style={{
                    background: T.mode === 'dark' ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.03)',
                    padding: '7px 12px', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 7, height: 7, background: color, borderRadius: 1 }}/>
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.textDim,
                        letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                        {label}
                      </span>
                    </div>
                    <span style={{ fontFamily: FONT.display, fontSize: 16,
                      fontWeight: 800, color }}>
                      {value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={BarChart3} title="No status data"
              desc="Waiting for /api/analytics/complaints/status"/>
          )}
        </ChartPanel>

        {/* Weekly pattern */}
        <ChartPanel
          title={t('overview.weeklyTitle') || 'Weekly Complaint Pattern'}
          sub={hasDow
            ? `${peakDay} peak${wkdDelta != null ? ` · weekdays ${wkdDelta >= 0 ? '+' : ''}${wkdDelta.toFixed(1)}% vs weekend` : ''} · full bar = today`
            : 'Day-of-week distribution'}>
          {hasDow ? (
            <ReactApexChart options={weeklyChart.options} series={weeklyChart.series}
              type="bar" height={320}/>
          ) : (
            <EmptyState icon={Activity} title="DOW data unavailable"
              desc="Run /api/analytics/complaints/dow"/>
          )}
          {/* O-3: weekly stats computed from the same data as the chart */}
          {hasDow && (
            <StatStrip style={{ marginTop: 12 }} items={[
              { label: 'PEAK DAY',    value: peakDay,                          color: HW.blue },
              { label: 'PEAK VOLUME', value: dowValues[peakIdx].toLocaleString(), color: HW.blue },
              { label: 'WEEKEND AVG', value: Math.round(weekendAvg).toLocaleString(), color: T.textMuted },
              { label: 'WKD vs WKND',
                value: wkdDelta != null ? `${wkdDelta >= 0 ? '+' : ''}${wkdDelta.toFixed(1)}%` : '—',
                color: ALARM.minor },
            ]}/>
          )}
        </ChartPanel>
      </GapGrid>

      {/* ══ 5. COMPLAINT TYPES + MONTHLY TREND ═══════════════════ */}
      <SectionLabel
        sub={topType
          ? `sub_sub_category breakdown from NB01 · ${typeValues.length} issue types · ${topType} #1 at ${topTypePct.toFixed(1)}%`
          : 'sub_sub_category breakdown from NB01'}>
        {t('overview.typeSection') || 'COMPLAINT TYPES & MONTHLY TREND'}
      </SectionLabel>

      <GapGrid columns="1.4fr 1fr">
        <ChartPanel
          title={t('overview.typeTitle') || 'Top Complaint Types'}
          sub={topType
            ? `${topType} leads at ${topTypePct.toFixed(1)}% of categorized complaints`
            : 'Categorized complaint volume'}>
          {typeChart ? (
            <ReactApexChart options={typeChart.options} series={typeChart.series}
              type="bar" height={340}/>
          ) : (
            <EmptyState icon={BarChart3} title="No type data"
              desc="Requires analysis_results.json from NB01"/>
          )}
        </ChartPanel>

        <ChartPanel
          title={t('overview.monthlyTitle') || 'Monthly Volume Trend'}
          sub={peakMonth
            ? `Peak ${peakMonth.month} — ${peakMonth.count.toLocaleString()} complaints · partial months excluded`
            : 'Complaints per month'}>
          {monthlyChart ? (
            <ReactApexChart options={monthlyChart.options} series={monthlyChart.series}
              type="area" height={340}/>
          ) : (
            <EmptyState icon={TrendingUp} title="No monthly data"
              desc="Requires analysis_results.json from NB01"/>
          )}
        </ChartPanel>
      </GapGrid>

      {/* ══ 6. SUBSCRIBER SEGMENTS ════════════════════════════════ */}
      <SectionLabel
        sub={top2Names.length === 2
          ? `${top2Names[0]} + ${top2Names[1]} = ${top2Pct.toFixed(1)}% of segmented complaints`
          : 'Complaint volume by customer segment'}
        action={<Badge variant="blue">{segLabels.length} Segments</Badge>}>
        {t('overview.segmentSection') || 'COMPLAINTS BY SUBSCRIBER SEGMENT'}
      </SectionLabel>

      <ChartPanel
        title={t('overview.segmentTitle') || 'Complaint Volume by Customer Segment'}
        sub={top2Names.length === 2
          ? `Top two segments drive ${top2Pct.toFixed(1)}% of segmented complaint volume`
          : undefined}>
        {segmentChart ? (
          <>
            <ReactApexChart options={segmentChart.options} series={segmentChart.series}
              type="bar" height={240}/>
            {top2Names.length === 2 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12,
                padding: '10px 14px',
                background: T.mode === 'dark' ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.03)',
                border: `1px solid ${T.border}` }}>
                <Zap size={13} color={ALARM.minor}/>
                <span style={{ fontSize: 11, color: T.textMuted }}>
                  Premium segments ({top2Names.join(' + ')}) account for{' '}
                  <strong style={{ color: ALARM.minor }}>{top2Pct.toFixed(1)}%</strong>{' '}
                  of segmented complaints — NOC priority for SLA enforcement
                </span>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon={Users} title="No segment data"
            desc="Requires analysis_results.json from NB01"/>
        )}
      </ChartPanel>

      {/* ══ 7. REGION DISTRIBUTION ════════════════════════════════ */}
      <SectionLabel
        action={<Badge variant="blue">{regionsSorted.length} {t('overview.regions') || 'Regions'}</Badge>}
        sub={t('overview.regionSubtitle') || 'Total complaint volume per governorate'}>
        {t('overview.regionSection') || 'GEOGRAPHIC DISTRIBUTION'}
      </SectionLabel>

      {regChart ? (
        <ChartPanel>
          <ReactApexChart options={regChart.options} series={regChart.series}
            type="bar" height={Math.max(320, regionsSorted.length * 34)}/>
        </ChartPanel>
      ) : (
        <EmptyState icon={Globe} title={t('overview.noRegion') || 'No region data'}
          desc="Waiting for /api/analytics/complaints/by-region"/>
      )}

      {/* ══ 8. DATASET SUMMARY ════════════════════════════════════ */}
      <SectionLabel sub="NB01 analysis_results.json · complaints_clean.parquet">
        {t('overview.datasetSection') || 'DATASET SUMMARY'}
      </SectionLabel>

      {/* Metadata, not alarms → neutral accent colors (O-2) */}
      <GapGrid columns="repeat(4,1fr)">
        <InfoCard label={t('overview.totalComplaints') || 'Total Complaints'}
          value={totalComplaints.toLocaleString()} color={HW.blue} icon={Database}/>
        <InfoCard label={t('overview.uniqueSubs') || 'Unique Subscribers'}
          value={(analysis?.overview?.unique_msisdns || 0).toLocaleString()}
          color="#8B5CF6" icon={Users}/>
        <InfoCard label={t('overview.geoCoverage') || 'Geographic Coverage'}
          value={`${analysis?.overview?.n_cities || 0} Cities`}
          color="#14B8A6" icon={Globe}/>
        <InfoCard label={t('overview.analysisPeriod') || 'Analysis Period'}
          value={`${analysis?.overview?.date_min || '—'} → ${analysis?.overview?.date_max || '—'}`}
          color="#6366F1" icon={Calendar}/>
      </GapGrid>
    </div>
  )
}