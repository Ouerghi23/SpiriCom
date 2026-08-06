// src/pages/AnomalyFeed.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useTranslation }   from 'react-i18next'
import ReactApexChart        from 'react-apexcharts'
import {
  Database, Search, TrendingUp, Target, Link, AlertTriangle,
  Activity, Globe, Radio, GitBranch, CheckCircle2,
  ChevronDown, ArrowUpDown, RefreshCw, X, Download, Clock,
  Filter, AlertOctagon, Eye
} from 'lucide-react'
import {
  HW, ALARM, FONT, gapColor, gridLine, blueRamp,
  SectionLabel, StatBlock, ChartPanel, GapGrid,
  AlertBanner, Badge, Spinner, EmptyState, baseChartOptions,
  sevDim, sevBd,
} from '../components/UI'
import { useTheme }     from '../context/ThemeContext'
import { analyticsApi } from '../api/client'

// ── AF-2: one severity ladder for the whole page ─────────────────────
const SEV = {
  Critical: ALARM.critical,
  High:     ALARM.major,
  Medium:   ALARM.minor,
  Low:      ALARM.normal,
}
const SEV_BADGE = {
  Critical: 'critical', High: 'major', Medium: 'minor', Low: 'normal',
}
const SCORE_ALERT = 0.7

// ── Method identity ──────────────────────────────────────────────
const METHOD = { if: '#8B5CF6', stat: '#14B8A6', consensus: ALARM.critical }

// ── Format date ─────────────────────────────────────────────────
function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return String(raw).slice(0, 10)
  const now  = new Date()
  const sameY = d.getFullYear() === now.getFullYear()
  const diffMs = now - d
  const diffD  = diffMs / 86_400_000
  if (diffD < 7) {
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
  }
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short',
    year: sameY ? undefined : 'numeric',
  })
}

// ── Normalise regions ────────────────────────────────────────────
function normaliseRegion(r) {
  if (typeof r === 'string') return r
  return r?.region || r?.name || String(r)
}

// ── Drivers chart builder ────────────────────────────────────────
function buildDriversChart(events, base, t, T) {
  const drivers = {}
  events.forEach(e => {
    const d = e.top_anomaly_driver || 'Unknown'
    drivers[d] = (drivers[d] || 0) + 1
  })
  const list = Object.entries(drivers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  return {
    series: [{ name: t('anomaly.occurrences'), data: list.map(d => d[1]) }],
    options: {
      ...base,
      chart:       { ...base.chart, type: 'bar' },
      plotOptions: { bar: { horizontal: true, borderRadius: 0,
        barHeight: '60%', distributed: true } },
      colors: list.map((_, i) => blueRamp(i)),
      xaxis: {
        categories: list.map(d =>
          d[0].replace(/_/g, ' ').replace('mean', '').trim()),
        labels:     { style: { fontSize: '10px', colors: T.textMuted } },
        axisBorder: { show: false },
        axisTicks:  { show: false },
      },
      yaxis: { labels: { style: { fontSize: '10px', colors: T.textMuted },
        maxWidth: 120 } },
      dataLabels: {
        enabled: true, textAnchor: 'start', offsetX: 8,
        style: { fontSize: '10px', fontWeight: 700, colors: [T.text],
          fontFamily: FONT.display },
      },
      legend: { show: false },
      grid: { borderColor: gridLine(T), strokeDashArray: 3,
        xaxis: { lines: { show: false } } },
      tooltip: {
        theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v} ${t('anomaly.occurrences')}` },
      },
    },
  }
}

// ═════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function AnomalyFeed() {
  const { t }        = useTranslation()
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)
  const base         = useMemo(() => baseChartOptions(T), [T])

  // ── State ──────────────────────────────────────────────────────
  const [summary,   setSummary]   = useState(null)
  const [timeline,  setTimeline]  = useState([])
  const [events,    setEvents]    = useState([])
  const [regions,   setRegions]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [selRegion, setSelRegion] = useState(null)
  const [apiOnline, setApiOnline] = useState(true)

  // ── Filtres ──────────────────────────────────────────────────────
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('all')

  // ── Auto-refresh ────────────────────────────────────────────────
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const refreshInterval = useRef(null)

  // ── Modal détails ──────────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState(null)

  // ── Sparkline data ─────────────────────────────────────────────
  const [trendData, setTrendData] = useState({
    consensus: [5, 8, 6, 12, 9, 7, 4, 10, 8, 6],
    if_count: [12, 15, 14, 18, 16, 13, 10, 15, 12, 9],
    stat_count: [20, 25, 22, 30, 27, 24, 20, 28, 22, 18]
  })

  // ── Fetch data ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [sumRes, regRes] = await Promise.all([
        analyticsApi.anomaliesSummary(),
        analyticsApi.anomalyRegions(),
      ])
      const s    = sumRes.data?.summary || {}
      const regs = (regRes.data?.regions || []).map(normaliseRegion)
      setSummary(s)
      setEvents(s.consensus_events || [])
      setRegions(regs)
      if (regs.length > 0) {
        setSelRegion(regs[0])
        const tlRes = await analyticsApi.anomaliesTimeline(regs[0])
        setTimeline(tlRes.data?.timeline || [])
      }
      setApiOnline(true)
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Anomaly fetch error:', err)
      setApiOnline(false)
      setError(`FastAPI offline — ${t('anomaly.noDataDesc')}`)
    } finally {
      setLoading(false)
    }
  }, [t])

  // ── Auto-refresh effect ─────────────────────────────────────────
  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (autoRefresh) {
      refreshInterval.current = setInterval(fetchData, 30000) // 30s
    } else {
      clearInterval(refreshInterval.current)
    }
    return () => clearInterval(refreshInterval.current)
  }, [autoRefresh, fetchData])

  // ── Handlers ────────────────────────────────────────────────────
  const handleRegionChange = useCallback(async region => {
    setSelRegion(region)
    try {
      const tlRes = await analyticsApi.anomaliesTimeline(region)
      setTimeline(tlRes.data?.timeline || [])
    } catch { setTimeline([]) }
  }, [])

  const handleManualRefresh = useCallback(() => {
    setLoading(true)
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  // ── Computed values ─────────────────────────────────────────────
  const topRegions    = summary?.top_regions || []
  const anomalyPoints = useMemo(
    () => timeline.filter(d => d.anomaly_flag === 1), [timeline])

  const sevCounts = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
    events.forEach(e => {
      if (e.if_severity && counts[e.if_severity] !== undefined)
        counts[e.if_severity]++
    })
    return counts
  }, [events])

  const sevTotal = useMemo(() =>
    sevCounts.Critical + sevCounts.High + sevCounts.Medium + sevCounts.Low,
    [sevCounts])

  const highSevCount = useMemo(() =>
    events.filter(e =>
      e.if_severity === 'Critical' || e.if_severity === 'High').length,
    [events])

  // ── Events filtrés ──────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let filtered = [...events]
    
    // Filtre par sévérité
    if (filterSeverity !== 'all') {
      filtered = filtered.filter(e => e.if_severity === filterSeverity)
    }
    
    // Filtre par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(e =>
        (e.region || '').toLowerCase().includes(query) ||
        (e.top_anomaly_driver || '').toLowerCase().includes(query)
      )
    }
    
    // Tri par score
    return filtered.sort((a, b) =>
      (b.combined_score || 0) - (a.combined_score || 0)
    ).slice(0, 14)
  }, [events, filterSeverity, searchQuery])

  // ── KPIs avec sparklines ────────────────────────────────────────
  const kpis = useMemo(() => [
    { label: t('anomaly.kpiTotal'),
      value: (summary?.total || 0).toLocaleString(),
      color: HW.blue, icon: Database, sub: t('anomaly.subFullData') },
    { label: t('anomaly.kpiIf'), value: summary?.if_count || 0,
      color: METHOD.if, icon: Search, sub: t('anomaly.subIf'),
      trend: trendData.if_count },
    { label: t('anomaly.kpiStat'), value: summary?.stat_count || 0,
      color: METHOD.stat, icon: TrendingUp, sub: t('anomaly.subStat'),
      trend: trendData.stat_count },
    { label: t('anomaly.kpiConsensus'), value: summary?.consensus || 0,
      color: ALARM.critical, icon: Target,
      alert: (summary?.consensus || 0) > 0, sub: t('anomaly.subBoth'),
      trend: trendData.consensus },
    { label: t('anomaly.kpiHigh'), value: highSevCount,
      color: ALARM.critical, icon: AlertTriangle,
      alert: highSevCount > 0, sub: t('anomaly.subHighSev') },
    { label: t('anomaly.kpiRate'), value: `${summary?.rate_pct || 0}%`,
      color: HW.blueLight, icon: Activity, sub: t('anomaly.subTotal') },
    { label: t('anomaly.kpiRegions'), value: topRegions.length,
      color: HW.blue, icon: Globe, sub: t('anomaly.subGov') },
  ], [summary, highSevCount, topRegions, trendData, t])

  // ── Export CSV ──────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const headers = ['Region', 'Date', 'Score', 'Severity', 'Driver']
    const rows = filteredEvents.map(e => [
      e.region || 'Unknown',
      formatDate(e.date),
      e.combined_score || 0,
      e.if_severity || 'N/A',
      e.top_anomaly_driver || 'Unknown'
    ])
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `anomalies_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredEvents])

  // ── Method cards ────────────────────────────────────────────────
  const methodCards = useMemo(() => [
    {
      Icon: GitBranch, title: t('anomaly.ifTitle'),
      tag: t('anomaly.mlTag'), accent: METHOD.if,
      desc: t('anomaly.ifDesc'),
      metrics: [`${summary?.if_count || 0} ${t('anomaly.ifMetric1')}`,
        t('anomaly.ifMetric2')],
    },
    {
      Icon: Activity, title: t('anomaly.statTitle'),
      tag: t('anomaly.statsTag'), accent: METHOD.stat,
      desc: t('anomaly.statDesc'),
      metrics: [`${summary?.stat_count || 0} ${t('anomaly.statMetric1')}`,
        t('anomaly.statMetric2')],
    },
    {
      Icon: CheckCircle2, title: t('anomaly.consensusTitle'),
      tag: t('anomaly.highConfTag'), accent: METHOD.consensus,
      desc: t('anomaly.consensusDesc'),
      metrics: [`${summary?.consensus || 0} ${t('anomaly.consensusMetric1')}`,
        t('anomaly.consensusMetric2')],
    },
  ], [summary, t])

  // ── Charts ──────────────────────────────────────────────────────
  const timelineChart = useMemo(() => timeline.length > 0 ? {
    series: [
      { name: t('anomaly.timeline'), type: 'area',
        data: timeline.map(d => ({ x: d.date, y: d.combined_score || 0 })) },
      { name: t('anomaly.noData'), type: 'scatter',
        data: anomalyPoints.map(d => ({ x: d.date, y: d.combined_score || 0 })) },
    ],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'line', stacked: false },
      colors: [METHOD.if, ALARM.critical],
      stroke: { curve: 'smooth', width: [2, 0] },
      markers: {
        size: [0, 8], strokeWidth: [0, 2],
        strokeColors: ['transparent', T.bgCard],
        hover: { size: 9 },
      },
      fill: {
        type: ['gradient', 'solid'],
        gradient: { shade: 'dark', type: 'vertical',
          gradientToColors: ['transparent'],
          opacityFrom: 0.28, opacityTo: 0.01, stops: [0, 95] },
      },
      xaxis: {
        type: 'datetime',
        labels: { format: 'dd MMM',
          style: { fontSize: '10px', colors: T.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: {
        min: 0,
        title: { text: 'Combined Score',
          style: { color: T.textMuted, fontSize: '10px', fontWeight: 400 } },
        labels: { style: { fontSize: '10px', colors: T.textMuted },
          formatter: v => v?.toFixed(2) },
      },
      annotations: {
        yaxis: [{
          y: SCORE_ALERT,
          borderColor: ALARM.major, borderWidth: 1, strokeDashArray: 5,
          label: {
            text: t('anomaly.alertThreshold'),
            position: 'right', offsetX: -8,
            style: { background: sevDim(ALARM.major, '14'),
              color: ALARM.major, fontSize: '10px', fontWeight: 600,
              padding: { top: 3, right: 6, bottom: 3, left: 6 } },
          },
        }],
      },
      tooltip: {
        shared: false, intersect: true,
        x: { format: 'dd MMM yyyy' },
        y: {
          formatter: (val, { seriesIndex }) =>
            seriesIndex === 1
              ? `${t('anomaly.detectedScore')} ${val?.toFixed(3)}`
              : val?.toFixed(3),
        },
      },
      legend: {
        position: 'top', horizontalAlign: 'left',
        labels: { colors: T.textMuted }, markers: { radius: 2 },
        itemMargin: { horizontal: 16 },
      },
      grid: {
        borderColor: gridLine(T), strokeDashArray: 3,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
      },
    },
  } : null, [timeline, anomalyPoints, base, t, T])

  const regionsChart = useMemo(() => topRegions.length > 0 ? {
    series: [{ name: t('anomaly.anomalyDays'),
      data: topRegions.map(r => r?.count ?? 0) }],
    options: {
      ...base,
      chart:       { ...base.chart, type: 'bar' },
      plotOptions: { bar: { horizontal: true, borderRadius: 0,
        barHeight: '58%', distributed: true } },
      colors: topRegions.map((_, i) => blueRamp(i)),
      dataLabels: {
        enabled: true, textAnchor: 'start', offsetX: 8,
        style: { fontSize: '10px', fontWeight: 700, colors: [T.text],
          fontFamily: FONT.display },
      },
      xaxis: {
        categories: topRegions.map(r => (r?.region || r || '')
          .replace(/_/g, ' ')
          .replace(' Governorate', '').replace(' Gouvernorat', '')),
        labels:     { style: { fontSize: '10px', colors: T.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: { labels: { style: { fontSize: '10px', colors: T.textMuted },
        maxWidth: 110 } },
      legend: { show: false },
      grid: { borderColor: gridLine(T), strokeDashArray: 3,
        xaxis: { lines: { show: false } } },
      tooltip: {
        theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v} ${t('anomaly.anomalyDays')}` },
      },
    },
  } : null, [topRegions, base, t, T])

  const severityDonutOptions = useMemo(() => ({
    ...base,
    chart:  { ...base.chart, type: 'donut' },
    labels: ['Critical', 'High', 'Medium', 'Low'],
    colors: [SEV.Critical, SEV.High, SEV.Medium, SEV.Low],
    stroke: { width: 2, colors: [T.bgCard] },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: {
            show: true,
            name:  { fontSize: '11px', color: T.textMuted, offsetY: -6 },
            value: { fontFamily: FONT.display, fontSize: '28px',
              fontWeight: 900, color: T.text, offsetY: 4,
              formatter: v => `${v}` },
            total: { show: true, label: 'Total', fontSize: '10px',
              color: T.textMuted, formatter: () => `${sevTotal}` },
          },
        },
      },
    },
    legend: { position: 'bottom', horizontalAlign: 'center', fontSize: '11px',
      labels: { colors: T.textMuted },
      itemMargin: { horizontal: 10, vertical: 4 } },
    dataLabels: { enabled: false },
    tooltip: {
      theme: T.mode === 'dark' ? 'dark' : 'light',
      y: { formatter: v => `${v} ${t('anomaly.eventsCount')} (${
        sevTotal > 0 ? ((v / sevTotal) * 100).toFixed(1) : 0}%)` },
    },
  }), [base, T, sevTotal, t])

  const driversChart = useMemo(() =>
    events.length > 0 ? buildDriversChart(events, base, t, T) : null,
    [events, base, t, T]
  )

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%',
          background: HW.blue, display: 'inline-block',
          animation: 'noc-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
          textTransform: 'uppercase', color: HW.blue }}>
          {t('common.loading')}
        </span>
      </div>
      <Spinner size={48}/>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, minHeight: '100vh', color: T.text,
      transition: 'background .3s' }}>
      <style>{`
        .af-module-card { transition: all .35s cubic-bezier(.22,1,.36,1); }
        .af-module-card:hover {
          border-color: ${HW.blueBd} !important;
          background:   ${HW.blueDim} !important;
          transform:    translateY(-2px);
        }
        .af-module-card:hover .af-module-accent { transform: scaleX(1) !important; }
        .af-table-row:hover td { background: ${T.bgCardHover} !important; }
        .af-modal-overlay {
          animation: afFadeIn .25s ease;
        }
        .af-modal-content {
          animation: afSlideUp .3s ease;
        }
        @keyframes afFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes afSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .af-sparkline {
          display: flex; align-items: flex-end; gap: 2px;
          height: 24px; padding: 2px 0;
        }
        .af-sparkline-bar {
          width: 4px; border-radius: 1px;
          transition: height .3s ease;
        }
      `}</style>

      <div style={{ padding: '36px 44px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ══ HERO HEADER ════════════════════════════════════════════ */}
        <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 24,
          marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7,
                background: sevDim(apiOnline ? ALARM.normal : ALARM.critical, '0E'),
                border: `1px solid ${sevBd(apiOnline ? ALARM.normal : ALARM.critical)}`,
                padding: '5px 13px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%',
                  background: apiOnline ? ALARM.normal : ALARM.critical,
                  display: 'inline-block',
                  animation: apiOnline ? 'noc-pulse 2s ease-in-out infinite' : 'none' }}/>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
                  textTransform: 'uppercase',
                  color: apiOnline ? ALARM.normal : ALARM.critical }}>
                  {apiOnline ? t('anomaly.liveBadge') : t('anomaly.offlineBadge')}
                </span>
              </div>
              <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '1.5px' }}>
                {t('anomaly.subtitle2')}
              </span>
            </div>

            {/* ── Auto-refresh controls ────────────────────────────── */}
         
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{ fontFamily: FONT.display,
                fontSize: 'clamp(26px, 3.5vw, 52px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: T.text,
                marginBottom: 8 }}>
                {t('anomaly.title').split(' ').slice(0, -1).join(' ')}{' '}
                <span style={{ color: HW.red, fontStyle: 'italic' }}>
                  {t('anomaly.title').split(' ').slice(-1)[0]}
                </span>
              </h1>
              <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 300 }}>
                {t('anomaly.subtitle')} · {topRegions.length} {t('anomaly.affected')}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? t('anomaly.onlineLabel') : t('anomaly.offlineLabel'),
                  color: apiOnline ? ALARM.normal : ALARM.critical,
                  bd: sevBd(apiOnline ? ALARM.normal : ALARM.critical),
                  bg: sevDim(apiOnline ? ALARM.normal : ALARM.critical, '0A') },
                { label: t('anomaly.ifBadge'), color: T.textMuted, bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: t('anomaly.statBadge'), color: T.textMuted, bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: t('anomaly.consensusBadge'), color: T.textMuted,
                  bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
              ].map((b, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 800,
                  letterSpacing: '1.5px', textTransform: 'uppercase',
                  padding: '5px 13px', border: `1px solid ${b.bd}`,
                  background: b.bg, color: b.color }}>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <AlertBanner severity="minor" icon={AlertTriangle}
            title={t('common.error') || 'ERROR'} message={error}/>
        )}

        {/* ══ KPI TILES avec Sparklines ═══════════════════════════════ */}
        <SectionLabel sub={t('anomaly.kpiSub')}>{t('anomaly.kpiSection')}</SectionLabel>
        <GapGrid columns="repeat(4,1fr)">
          {kpis.map((kpi, i) => (
            <StatBlock key={i} {...kpi}>
              {kpi.trend && (
                <div className="af-sparkline" style={{ marginTop: 6 }}>
                  {kpi.trend.slice(-8).map((val, idx) => {
                    const max = Math.max(...kpi.trend, 1)
                    const height = (val / max) * 18 + 4
                    const isHigh = val > (max * 0.7)
                    return (
                      <div
                        key={idx}
                        className="af-sparkline-bar"
                        style={{
                          height: `${height}px`,
                          background: isHigh ? kpi.color : `${kpi.color}60`
                        }}
                      />
                    )
                  })}
                </div>
              )}
            </StatBlock>
          ))}
        </GapGrid>

        {/* ══ TIMELINE + REGIONS ══════════════════════════════════════ */}
        <SectionLabel sub={t('anomaly.timelineSub')}>
          {t('anomaly.timelineSection')}
        </SectionLabel>

        <GapGrid columns="2fr 1fr">
          <ChartPanel sub={selRegion
            ? `${t('anomaly.regionLabel')}: ${selRegion}`
            : t('anomaly.regionLabel')}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center',
              marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
                textTransform: 'uppercase', fontWeight: 700 }}>
                {t('anomaly.regionLabel')}
              </span>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <select value={selRegion || ''}
                  onChange={e => handleRegionChange(e.target.value)}
                  aria-label={t('anomaly.regionLabel')}
                  style={{
                    appearance: 'none', background: T.bgCardHover, color: T.text,
                    border: `1px solid ${T.border}`, padding: '7px 34px 7px 12px',
                    fontSize: 11, fontWeight: 600, fontFamily: FONT.body,
                    letterSpacing: '.5px', cursor: 'pointer', outline: 'none',
                  }}>
                  {regions.map(r => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} color={T.textDim} style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)', pointerEvents: 'none' }}/>
              </div>
              <Badge variant="purple">{selRegion?.replace(/_/g, ' ')}</Badge>
              <Badge variant="critical">
                {anomalyPoints.length} {t('anomaly.anomalyCount')}
              </Badge>
            </div>

            {timelineChart ? (
              <ReactApexChart options={timelineChart.options}
                series={timelineChart.series} type="line" height={300}/>
            ) : (
              <EmptyState icon={Activity}
                title={t('anomaly.noTimeline')} desc={t('anomaly.noTimelineDesc')}/>
            )}
          </ChartPanel>

          <ChartPanel title={t('anomaly.topRegions')} sub={t('anomaly.subGov')}>
            {regionsChart ? (
              <ReactApexChart options={regionsChart.options}
                series={regionsChart.series} type="bar" height={300}/>
            ) : (
              <EmptyState icon={Globe} title={t('anomaly.noRegionData')}/>
            )}
          </ChartPanel>
        </GapGrid>

        {/* ══ DRIVERS + SEVERITY ══════════════════════════════════════ */}
        <SectionLabel sub={t('anomaly.driversSub')}>
          {t('anomaly.driversSection')}
        </SectionLabel>

        <GapGrid columns="1fr 1fr">
          <ChartPanel title={t('anomaly.topDriversTitle')}
            sub={t('anomaly.topDriversSub')}>
            {driversChart ? (
              <ReactApexChart options={driversChart.options}
                series={driversChart.series} type="bar" height={280}/>
            ) : (
              <EmptyState icon={Search} title={t('anomaly.noData')}/>
            )}
          </ChartPanel>

          <ChartPanel title={t('anomaly.sevTitle')} sub={t('anomaly.sevSub')}>
            <ReactApexChart
              options={severityDonutOptions}
              series={[sevCounts.Critical, sevCounts.High,
                sevCounts.Medium, sevCounts.Low]}
              type="donut" height={280}/>
          </ChartPanel>
        </GapGrid>

        {/* ══ EVENTS TABLE avec Filtres ════════════════════════════════ */}
        <SectionLabel
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge variant="critical">
                {events.length} {t('anomaly.eventsCount')}
              </Badge>
              <button
                onClick={exportCSV}
                style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '1px',
                  padding: '4px 10px',
                  background: T.bgCard, border: `1px solid ${T.border}`,
                  borderRadius: 4, color: T.text, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4
                }}>
                <Download size={10}/> CSV
              </button>
            </div>
          }
          sub={t('anomaly.eventsSub')}>
          {t('anomaly.eventsSection')}
        </SectionLabel>

        {/* ── Filtres ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, background: T.bgCard, padding: 4, borderRadius: 6 }}>
 
          </div>

          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={13} style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', color: T.textMuted
            }}/>
            <input
              type="text"
              placeholder="Search by region or driver..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '7px 12px 7px 32px',
                background: T.bgCard, border: `1px solid ${T.border}`,
                borderRadius: 4, color: T.text, fontSize: 11,
                outline: 'none', fontFamily: FONT.body
              }}
            />
          </div>

          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            style={{
              padding: '7px 12px', background: T.bgCard,
              border: `1px solid ${T.border}`, borderRadius: 4,
              color: T.text, fontSize: 11, outline: 'none',
              fontFamily: FONT.body
            }}>
            <option value="all">All</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {(filterSeverity !== 'all' || searchQuery || viewMode !== 'all') && (
            <button
              onClick={() => { setFilterSeverity('all'); setSearchQuery(''); setViewMode('all') }}
              style={{
                fontSize: 10, fontWeight: 600, padding: '7px 12px',
                background: T.bgCard, border: `1px solid ${T.border}`,
                borderRadius: 4, color: T.textMuted, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4
              }}>
              <X size={12}/> Drop Filters
            </button>
          )}
        </div>

        {/* ── Tableau ────────────────────────────────────────────────── */}
        <div style={{ border: `1px solid ${T.border}`, overflow: 'hidden',
          position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0,
            height: 1.5,
            background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: T.mode === 'dark'
                  ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.04)',
                borderBottom: `1px solid ${T.border}` }}>
                {[
                  { label: t('anomaly.topRegions'), Icon: Globe         },
                  { label: t('anomaly.thDate'),     Icon: null          },
                  { label: t('anomaly.thScore'),    Icon: ArrowUpDown   },
                  { label: t('anomaly.severity'),   Icon: AlertTriangle },
                  { label: t('anomaly.driver'),     Icon: Search        },
                  { label: 'Détails',               Icon: Eye           },
                ].map(({ label, Icon }) => (
                  <th key={label} style={{
                    padding: '11px 14px', textAlign: 'left', fontSize: 10,
                    fontWeight: 800, letterSpacing: '1.5px',
                    textTransform: 'uppercase', color: T.textDim,
                    whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {Icon && <Icon size={11} color={T.textDim}/>}
                      {label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: 'center',
                    color: T.textMuted }}>
                    <Radio size={26} color={T.textDim}/>
                    <div style={{ marginTop: 12, fontSize: 13 }}>
                      {searchQuery || filterSeverity !== 'all'
                        ? 'Aucun résultat pour ces filtres'
                        : t('anomaly.noEvents')}
                    </div>
                  </td>
                </tr>
              ) : filteredEvents.map((e, i) => (
                <tr key={i} className="af-table-row"
                  onClick={() => setSelectedEvent(e)}
                  style={{
                    borderBottom: `1px solid ${T.mode === 'dark'
                      ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)'}`,
                    transition: 'all .15s', cursor: 'pointer'
                  }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700,
                    color: T.text, fontSize: 12 }}>
                    {(e.region || '').replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '10px 14px', color: T.textMuted,
                    fontFamily: FONT.display, fontSize: 13,
                    letterSpacing: '.3px' }}>
                    {formatDate(e.date)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontFamily: FONT.display, fontSize: 16, fontWeight: 900,
                      letterSpacing: '-.3px',
                      color: SEV[e.if_severity] || T.textMuted,
                    }}>
                      {(e.combined_score || 0).toFixed(3)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge variant={SEV_BADGE[e.if_severity] || 'gray'}>
                      {e.if_severity || 'N/A'}
                    </Badge>
                  </td>
                  <td style={{ padding: '10px 14px', color: T.textMuted,
                    fontSize: 10, letterSpacing: '.5px' }}>
                    {(e.top_anomaly_driver || 'Unknown')
                      .replace(/_/g, ' ').replace('mean', '').trim()}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Eye size={14} color={T.textDim} style={{ cursor: 'pointer' }}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ══ MODAL DÉTAILS ════════════════════════════════════════════ */}
        {selectedEvent && (
          <div className="af-modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 2000, backdropFilter: 'blur(4px)'
          }} onClick={() => setSelectedEvent(null)}>
            <div className="af-modal-content" onClick={e => e.stopPropagation()} style={{
              background: T.bgCard, borderRadius: 12,
              padding: '32px 36px', maxWidth: 560, width: '90%',
              maxHeight: '80vh', overflow: 'auto',
              border: `1px solid ${T.border}`,
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Badge variant={SEV_BADGE[selectedEvent.if_severity] || 'gray'}>
                    {selectedEvent.if_severity || 'N/A'}
                  </Badge>
                  <span style={{ fontSize: 12, color: T.textMuted }}>
                    {formatDate(selectedEvent.date)}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: T.textMuted, cursor: 'pointer',
                    padding: 4
                  }}>
                  <X size={18}/>
                </button>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '10px 14px', background: T.bg, borderRadius: 6,
                  border: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 11, color: T.textMuted }}>Région</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                    {(selectedEvent.region || 'Unknown').replace(/_/g, ' ')}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '10px 14px', background: T.bg, borderRadius: 6,
                  border: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 11, color: T.textMuted }}>Score combiné</span>
                  <span style={{
                    fontSize: 18, fontWeight: 900,
                    fontFamily: FONT.display,
                    color: SEV[selectedEvent.if_severity] || T.text
                  }}>
                    {(selectedEvent.combined_score || 0).toFixed(4)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '10px 14px', background: T.bg, borderRadius: 6,
                  border: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 11, color: T.textMuted }}>Driver</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                    {(selectedEvent.top_anomaly_driver || 'Unknown')
                      .replace(/_/g, ' ').replace('mean', '').trim()}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '10px 14px', background: T.bg, borderRadius: 6,
                  border: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 11, color: T.textMuted }}>Méthodes</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Badge variant={selectedEvent.if_anomaly ? 'critical' : 'gray'}>
                      IF {selectedEvent.if_anomaly ? '✓' : '—'}
                    </Badge>
                    <Badge variant={selectedEvent.stat_anomaly ? 'major' : 'gray'}>
                      Stat {selectedEvent.stat_anomaly ? '✓' : '—'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setSelectedEvent(null)}
                  style={{
                    padding: '8px 20px', fontSize: 11, fontWeight: 700,
                    background: T.bgCard, border: `1px solid ${T.border}`,
                    borderRadius: 6, color: T.text, cursor: 'pointer'
                  }}>
                  Close
                </button>
                <button
                  onClick={() => {
                    // Action: Marquer comme résolu (à implémenter avec l'API)
                    setSelectedEvent(null)
                  }}
                  style={{
                    padding: '8px 20px', fontSize: 11, fontWeight: 700,
                    background: HW.blue, border: 'none',
                    borderRadius: 6, color: 'white', cursor: 'pointer'
                  }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ METHODOLOGY CARDS ════════════════════════════════════════ */}
        <SectionLabel sub={t('anomaly.methodSub')}>
          {t('anomaly.methodSection')}
        </SectionLabel>

        <GapGrid columns="repeat(3,1fr)">
          {methodCards.map((m, i) => (
            <div key={i} className="af-module-card" style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              padding: '28px 24px', position: 'relative', overflow: 'hidden',
              cursor: 'default' }}>
              <div className="af-module-accent" style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
                background: `linear-gradient(90deg, transparent, ${m.accent}, transparent)`,
                transform: 'scaleX(0)', transformOrigin: 'center',
                transition: 'transform .4s ease' }}/>

              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', marginBottom: 18 }}>
                <div style={{ width: 44, height: 44,
                  background: `${m.accent}0E`,
                  border: `1px solid ${m.accent}28`,
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', borderRadius: 4 }}>
                  <m.Icon size={20} color={m.accent}/>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800,
                  letterSpacing: '2px', padding: '3px 9px',
                  border: `1px solid ${m.accent}30`, color: m.accent,
                  textTransform: 'uppercase', background: `${m.accent}06` }}>
                  {m.tag}
                </span>
              </div>

              <h3 style={{ fontFamily: FONT.display, fontSize: 19,
                fontWeight: 800, color: T.text, letterSpacing: '-.3px',
                marginBottom: 8, lineHeight: 1.1 }}>
                {m.title}
              </h3>
              <p style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.8,
                fontWeight: 300, marginBottom: 16 }}>
                {m.desc}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {m.metrics.map((met, j) => (
                  <span key={j} style={{ fontSize: 10, fontWeight: 800,
                    letterSpacing: '1.5px', padding: '3px 9px',
                    border: `1px solid ${m.accent}30`, color: m.accent,
                    textTransform: 'uppercase', background: `${m.accent}06` }}>
                    {met}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </GapGrid>

      </div>
    </div>
  )
}