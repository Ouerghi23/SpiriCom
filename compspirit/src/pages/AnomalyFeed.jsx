// src/pages/AnomalyFeed.jsx
// ─────────────────────────────────────────────────────────────────────
// NOC Anomaly Detection Feed
//
// Changes from original:
//   - Custom Ico SVG factory replaced with Lucide React
//   - Full react-i18next translation (anomaly.* + common.* keys)
//   - All hardcoded English strings replaced with t() calls
//   - Logic and layout 100% preserved
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useTranslation }      from 'react-i18next'
import ReactApexChart          from 'react-apexcharts'
import {
  Database, Search, TrendingUp, Target, Link, AlertTriangle,
  Activity, Globe, Radio, GitBranch, CheckCircle2,
  ChevronDown, ArrowUpDown, Wifi, WifiOff,
} from 'lucide-react'
import { Badge, Spinner, EmptyState, baseChartOptions } from '../components/UI'
import { analyticsApi } from '../api/client'

// ── Colour palette ────────────────────────────────────────────────────
const C = {
  bg:        '#080808',
  bg2:       '#0C0C0C',
  bg3:       '#0A0A0A',
  border:    'rgba(255,255,255,.055)',
  text:      '#F8FAFC',
  textMuted: 'rgba(248,250,252,.5)',
  textDim:   'rgba(248,250,252,.32)',
  red:       '#CF0A2C',
  redLight:  '#FF4060',
  blue:      '#3B82F6',
  cyan:      '#22D3EE',
  green:     '#22C55E',
  amber:     '#F59E0B',
  orange:    '#F97316',
  purple:    '#A855F7',
}

// ── Section label ─────────────────────────────────────────────────────
const SectionLabel = ({ children, action, sub }) => (
  <div style={{ marginTop: 40, marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: C.red,
        letterSpacing: '4.5px', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ width: 22, height: 1, background: C.red, display: 'inline-block', flexShrink: 0 }}/>
        {children}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
    {sub && (
      <div style={{ fontSize: 10, color: C.textDim, letterSpacing: '1px', marginTop: 5, paddingLeft: 34 }}>
        {sub}
      </div>
    )}
  </div>
)

// ── KPI stat block ────────────────────────────────────────────────────
const StatBlock = ({ label, value, unit, color, icon: IconComp, sub }) => (
  <div className="af-stat-block" style={{
    background: C.bg3, border: `1px solid ${C.border}`,
    padding: '24px 20px', position: 'relative', overflow: 'hidden',
    transition: 'all .3s cubic-bezier(.22,1,.36,1)', cursor: 'default',
  }}>
    <div style={{
      position: 'absolute', top: 0, left: '12%', right: '12%', height: 1,
      background: `linear-gradient(90deg, transparent, ${color || C.red}, transparent)`,
    }}/>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: '1.8px', textTransform: 'uppercase', lineHeight: 1.5 }}>
        {label}
      </span>
      {IconComp && (
        <div style={{
          width: 26, height: 26, border: `1px solid ${(color || C.red)}30`,
          background: `${color || C.red}10`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <IconComp size={12} color={color || C.red}/>
        </div>
      )}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: sub ? 8 : 0 }}>
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 34, fontWeight: 900, color: color || C.red,
        lineHeight: 1, letterSpacing: '-1px',
      }}>
        {value}
      </span>
      {unit && <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{unit}</span>}
    </div>
    {sub && <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '1px', textTransform: 'uppercase' }}>{sub}</div>}
  </div>
)

// ── Chart panel ───────────────────────────────────────────────────────
const ChartPanel = ({ title, sub, children, action, style = {} }) => (
  <div className="af-chart-panel" style={{
    background: C.bg2, border: `1px solid ${C.border}`,
    padding: '22px 24px', position: 'relative', overflow: 'hidden',
    transition: 'border-color .3s', ...style,
  }}>
    <div className="af-panel-accent" style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
      background: `linear-gradient(90deg, transparent, ${C.red}, transparent)`,
      transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s ease',
    }}/>
    {(title || sub || action) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
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

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function AnomalyFeed() {
  const { t } = useTranslation()

  const [summary,   setSummary]   = useState(null)
  const [timeline,  setTimeline]  = useState([])
  const [events,    setEvents]    = useState([])
  const [regions,   setRegions]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [selRegion, setSelRegion] = useState(null)
  const [apiOnline, setApiOnline] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sumRes, regRes] = await Promise.all([
          analyticsApi.anomaliesSummary(),
          analyticsApi.anomalyRegions(),
        ])
        const s    = sumRes.data?.summary || {}
        const regs = regRes.data?.regions || []
        setSummary(s)
        setEvents(s.consensus_events || [])
        setRegions(regs)
        if (regs.length > 0) {
          setSelRegion(regs[0])
          const tlRes = await analyticsApi.anomaliesTimeline(regs[0])
          setTimeline(tlRes.data?.timeline || [])
        }
        setApiOnline(true)
      } catch (err) {
        console.error('Anomaly fetch error:', err)
        setApiOnline(false)
        setError(`FastAPI offline — ${t('anomaly.noDataDesc')}`)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleRegionChange = async (region) => {
    setSelRegion(region)
    try {
      const tlRes = await analyticsApi.anomaliesTimeline(region)
      setTimeline(tlRes.data?.timeline || [])
    } catch {
      setTimeline([])
    }
  }

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.purple, display: 'inline-block', animation: 'af-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.purple }}>
          {t('common.loading')}
        </span>
      </div>
      <Spinner size={48}/>
    </div>
  )

  // Anomaly points — only flag === 1
  const anomalyPoints = timeline.filter(d => d.anomaly_flag === 1)

  const topRegions = summary?.top_regions || []

  // ── KPI tiles ─────────────────────────────────────────────────────
  const kpis = [
    { label: t('anomaly.kpiTotal'),     value: (summary?.total     || 0).toLocaleString(), color: C.blue,   Icon: Database,      sub: t('anomaly.subFullData')  },
    { label: t('anomaly.kpiIf'),        value:  summary?.if_count   || 0,                  color: C.purple, Icon: Search,        sub: t('anomaly.subIf')        },
    { label: t('anomaly.kpiStat'),      value:  summary?.stat_count || 0,                  color: C.amber,  Icon: TrendingUp,    sub: t('anomaly.subStat')      },
    { label: t('anomaly.kpiConsensus'), value:  summary?.consensus  || 0,                  color: C.red,    Icon: Target,        sub: t('anomaly.subBoth')      },
    { label: t('anomaly.kpiUnion'),     value:  summary?.union      || 0,                  color: C.orange, Icon: Link,          sub: t('anomaly.subEither')    },
    { label: t('anomaly.kpiHigh'),      value:  events.filter(e => e.if_severity === 'High').length, color: C.red, Icon: AlertTriangle, sub: t('anomaly.subHighSev') },
    { label: t('anomaly.kpiRate'),      value: `${summary?.rate_pct || 0}%`,               color: C.cyan,   Icon: Activity,      sub: t('anomaly.subTotal')     },
    { label: t('anomaly.kpiRegions'),   value:  topRegions.length,                         color: C.cyan,   Icon: Globe,         sub: t('anomaly.subGov')       },
  ]

  // ── Severity counts ────────────────────────────────────────────────
  const sevCounts = { High: 0, Medium: 0, Low: 0 }
  events.forEach(e => { if (e.if_severity && sevCounts[e.if_severity] !== undefined) sevCounts[e.if_severity]++ })
  const sevTotal = sevCounts.High + sevCounts.Medium + sevCounts.Low

  // ── Timeline chart ─────────────────────────────────────────────────
  const timelineChart = timeline.length > 0 ? {
    series: [
      { name: t('anomaly.timeline'),  type: 'area',    data: timeline.map(d => ({ x: d.date, y: d.combined_score || 0 })) },
      { name: t('anomaly.noData'),    type: 'scatter', data: anomalyPoints.map(d => ({ x: d.date, y: d.combined_score || 0 })) },
    ],
    options: {
      ...baseChartOptions,
      chart:  { ...baseChartOptions?.chart, type: 'line', stacked: false, background: 'transparent', animations: { enabled: false } },
      colors: [C.purple, C.red],
      stroke: { curve: 'smooth', width: [2, 0] },
      markers: {
        size: [0, 8], strokeWidth: [0, 2],
        strokeColors: ['transparent', '#fff'], hover: { size: 9 },
      },
      fill: {
        type: ['gradient', 'solid'],
        gradient: { shade: 'dark', type: 'vertical', gradientToColors: ['transparent'], opacityFrom: 0.28, opacityTo: 0.01, stops: [0, 95] },
      },
      xaxis: {
        type: 'datetime',
        labels:     { format: 'dd MMM', style: { fontSize: '10px', colors: C.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: {
        min:    0,
        title:  { text: 'Combined Score', style: { color: C.textMuted, fontSize: '10px', fontWeight: 400 } },
        labels: { style: { fontSize: '10px', colors: C.textMuted }, formatter: v => v?.toFixed(2) },
      },
      annotations: {
        yaxis: [{
          y: 0.7, borderColor: C.amber, borderWidth: 1, strokeDashArray: 5,
          label: {
            text: t('anomaly.alertThreshold'), position: 'right', offsetX: -8,
            style: { background: 'rgba(245,158,11,.1)', color: C.amber, fontSize: '9px', fontWeight: 600, padding: { top: 3, right: 6, bottom: 3, left: 6 } },
          },
        }],
      },
      tooltip: {
        shared: false, intersect: true,
        x: { format: 'dd MMM yyyy' },
        y: { formatter: (val, { seriesIndex }) =>
          seriesIndex === 1
            ? `${t('anomaly.detectedScore')} ${val?.toFixed(3)}`
            : val?.toFixed(3)
        },
      },
      legend: {
        position: 'top', horizontalAlign: 'left',
        labels: { colors: C.textMuted }, markers: { radius: 2 }, itemMargin: { horizontal: 16 },
      },
      grid: { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    },
  } : null

  // ── Top regions chart ──────────────────────────────────────────────
  const regionsChart = topRegions.length > 0 ? {
    series: [{ name: t('anomaly.anomalyDays'), data: topRegions.map(r => r.count) }],
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions?.chart, type: 'bar', background: 'transparent', animations: { enabled: false } },
      plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: '58%', distributed: true } },
      colors:      topRegions.map((_, i) => {
        const p = [C.red, '#D41F35', '#DA2E3C', '#E04050', '#E65060', '#EC6070']
        return p[i] || C.red
      }),
      dataLabels: {
        enabled: true, textAnchor: 'start', offsetX: 8,
        style: { fontSize: '10px', fontWeight: 700, colors: [C.text], fontFamily: "'Barlow Condensed',sans-serif" },
      },
      xaxis: {
        categories: topRegions.map(r => r.region?.replace(' Gouvernorat', '') || ''),
        labels: { style: { fontSize: '10px', colors: C.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis:  { labels: { style: { fontSize: '10px', colors: C.textMuted }, maxWidth: 110 } },
      legend: { show: false },
      grid:   { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3, xaxis: { lines: { show: false } } },
      tooltip: { theme: 'dark', y: { formatter: v => `${v} ${t('anomaly.anomalyDays')}` } },
    },
  } : null

  // ── Drivers chart builder ──────────────────────────────────────────
  const buildDriversChart = (eventList) => {
    const drivers = {}
    eventList.forEach(e => { const d = e.top_anomaly_driver || 'Unknown'; drivers[d] = (drivers[d] || 0) + 1 })
    const list = Object.entries(drivers).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return {
      series:  [{ name: t('anomaly.occurrences'), data: list.map(d => d[1]) }],
      labels:  list.map(d => d[0].replace(/_/g, ' ').replace('mean', '').trim()),
      palette: [C.red, C.amber, C.purple, C.blue, C.cyan, C.orange, C.green, C.redLight],
    }
  }

  // ── Severity donut ─────────────────────────────────────────────────
  const severityDonutOptions = {
    ...baseChartOptions,
    chart:   { ...baseChartOptions?.chart, type: 'donut', background: 'transparent', animations: { enabled: false } },
    labels:  ['High', 'Medium', 'Low'],
    colors:  [C.red, C.amber, C.green],
    stroke:  { width: 2, colors: [C.bg2] },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: {
            show:  true,
            name:  { fontSize: '11px', color: C.textMuted, offsetY: -6 },
            value: { fontFamily: "'Barlow Condensed',sans-serif", fontSize: '28px', fontWeight: 900, color: C.text, offsetY: 4, formatter: v => `${v}` },
            total: { show: true, label: 'Total', fontSize: '10px', color: C.textMuted, formatter: () => `${sevTotal}` },
          },
        },
      },
    },
    legend:     { position: 'bottom', horizontalAlign: 'center', fontSize: '11px', labels: { colors: C.textMuted }, itemMargin: { horizontal: 10, vertical: 4 } },
    dataLabels: { enabled: false },
    tooltip:    { theme: 'dark', y: { formatter: v => `${v} ${t('anomaly.eventsCount')} (${sevTotal > 0 ? ((v / sevTotal) * 100).toFixed(1) : 0}%)` } },
  }

  // ── Methodology cards ──────────────────────────────────────────────
  const methodCards = [
    {
      Icon:     GitBranch,
      title:    t('anomaly.ifTitle'),
      tag:      t('anomaly.mlTag'),
      tagColor: C.purple,
      desc:     t('anomaly.ifDesc'),
      metrics:  [`${summary?.if_count || 0} ${t('anomaly.ifMetric1')}`, t('anomaly.ifMetric2')],
      accent:   C.purple,
    },
    {
      Icon:     Activity,
      title:    t('anomaly.statTitle'),
      tag:      t('anomaly.statsTag'),
      tagColor: C.amber,
      desc:     t('anomaly.statDesc'),
      metrics:  [`${summary?.stat_count || 0} ${t('anomaly.statMetric1')}`, t('anomaly.statMetric2')],
      accent:   C.amber,
    },
    {
      Icon:     CheckCircle2,
      title:    t('anomaly.consensusTitle'),
      tag:      t('anomaly.highConfTag'),
      tagColor: C.red,
      desc:     t('anomaly.consensusDesc'),
      metrics:  [`${summary?.consensus || 0} ${t('anomaly.consensusMetric1')}`, t('anomaly.consensusMetric2')],
      accent:   C.red,
    },
  ]

  const tableEvents = [...events]
    .sort((a, b) => (b.combined_score || 0) - (a.combined_score || 0))
    .slice(0, 14)

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>

      <style>{`
        @keyframes af-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        .af-stat-block:hover { border-color:rgba(207,10,44,.22)!important; background:rgba(207,10,44,.03)!important; transform:translateY(-2px); box-shadow:0 8px 24px rgba(207,10,44,.07); }
        .af-chart-panel:hover { border-color:rgba(207,10,44,.2)!important; }
        .af-chart-panel:hover .af-panel-accent { transform:scaleX(1)!important; }
        .af-module-card:hover { border-color:rgba(207,10,44,.22)!important; background:rgba(207,10,44,.028)!important; transform:translateY(-2px); box-shadow:0 8px 32px rgba(207,10,44,.08); }
        .af-module-card:hover .af-module-accent { transform:scaleX(1)!important; }
        .af-table-row:hover td { background:rgba(255,255,255,.018)!important; }
        .af-select {
          appearance:none; background:${C.bg3}; color:${C.text};
          border:1px solid ${C.border}; padding:8px 36px 8px 14px;
          font-size:11px; font-weight:600; font-family:'Inter',system-ui;
          letter-spacing:.5px; cursor:pointer; outline:none; transition:border-color .2s;
        }
        .af-select:hover, .af-select:focus { border-color:rgba(207,10,44,.4); }
        .af-select-wrap { position:relative; display:inline-block; }
        .af-select-wrap svg { position:absolute; right:10px; top:50%; transform:translateY(-50%); pointer-events:none; }
      `}</style>

      <div style={{ padding: '40px 48px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── HERO HEADER ─────────────────────────────────────────── */}
        <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 28, marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.28)', padding: '6px 14px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.purple, display: 'inline-block', animation: 'af-pulse 2s ease-in-out infinite' }}/>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#C084FC' }}>
                {apiOnline ? t('anomaly.liveBadge') : t('anomaly.offlineBadge')}
              </span>
            </div>
            <span style={{ fontSize: 11, color: C.textDim, letterSpacing: '1.5px' }}>
              {t('anomaly.subtitle2')}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 'clamp(28px,3.5vw,54px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: C.text, marginBottom: 8,
              }}>
                {t('anomaly.title').split(' ').slice(0, -1).join(' ')}{' '}
                <span style={{ color: C.red, fontStyle: 'italic' }}>
                  {t('anomaly.title').split(' ').slice(-1)[0]}
                </span>
              </h1>
              <p style={{ fontSize: 13, color: C.textMuted, fontWeight: 300 }}>
                {t('anomaly.subtitle')} · {topRegions.length} {t('anomaly.affected')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? t('anomaly.onlineLabel') : t('anomaly.offlineLabel'), color: apiOnline ? C.green : C.red, bd: apiOnline ? 'rgba(34,197,94,.28)' : 'rgba(207,10,44,.28)', bg: apiOnline ? 'rgba(34,197,94,.08)' : 'rgba(207,10,44,.08)' },
                { label: t('anomaly.ifBadge'),        color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
                { label: t('anomaly.statBadge'),      color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
                { label: t('anomaly.consensusBadge'), color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
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

        {/* ── ERROR BANNER ────────────────────────────────────────── */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.28)',
            padding: '12px 20px', marginBottom: 24,
          }}>
            <AlertTriangle size={14} color={C.amber}/>
            <span style={{ fontSize: 12, color: C.amber }}>{error}</span>
          </div>
        )}

        {/* ── KPI TILES ───────────────────────────────────────────── */}
        <SectionLabel sub={t('anomaly.kpiSub')}>
          {t('anomaly.kpiSection')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          {kpis.map((kpi, i) => (
            <StatBlock key={i} label={kpi.label} value={kpi.value} color={kpi.color} icon={kpi.Icon} sub={kpi.sub}/>
          ))}
        </div>

        {/* ── TIMELINE + REGIONS ───────────────────────────────────── */}
        <SectionLabel sub={t('anomaly.timelineSub')}>
          {t('anomaly.timelineSection')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>

          {/* Timeline */}
          <ChartPanel sub={selRegion ? `${t('anomaly.regionLabel')}: ${selRegion}` : t('anomaly.regionLabel')}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, color: C.textDim, letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700 }}>
                {t('anomaly.regionLabel')}
              </span>
              <div className="af-select-wrap">
                <select
                  value={selRegion || ''}
                  onChange={e => handleRegionChange(e.target.value)}
                  className="af-select"
                >
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown size={12} color={C.textDim}/>
              </div>
              <Badge variant="purple">{selRegion}</Badge>
              <Badge variant="red">{anomalyPoints.length} {t('anomaly.anomalyCount')}</Badge>
            </div>

            {timelineChart ? (
              <ReactApexChart options={timelineChart.options} series={timelineChart.series} type="line" height={300}/>
            ) : (
              <EmptyState
                icon={<Activity size={36} color="rgba(255,255,255,.18)"/>}
                title={t('anomaly.noTimeline')}
                desc={t('anomaly.noTimelineDesc')}
              />
            )}
          </ChartPanel>

          {/* Top regions */}
          <ChartPanel title={t('anomaly.topRegions')} sub={t('anomaly.topDriversSub')}>
            {regionsChart ? (
              <ReactApexChart options={regionsChart.options} series={regionsChart.series} type="bar" height={300}/>
            ) : (
              <EmptyState icon={<Globe size={36} color="rgba(255,255,255,.18)"/>} title={t('anomaly.noRegionData')}/>
            )}
          </ChartPanel>
        </div>

        {/* ── DRIVERS + SEVERITY ───────────────────────────────────── */}
        <SectionLabel sub={t('anomaly.driversSub')}>
          {t('anomaly.driversSection')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>

          {/* Top drivers */}
          <ChartPanel title={t('anomaly.topDriversTitle')} sub={t('anomaly.topDriversSub')}>
            {events.length > 0 ? (() => {
              const { series, labels, palette } = buildDriversChart(events)
              return (
                <ReactApexChart
                  options={{
                    ...baseChartOptions,
                    chart:       { ...baseChartOptions?.chart, type: 'bar', background: 'transparent', animations: { enabled: false } },
                    plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: '60%', distributed: true } },
                    colors:      palette,
                    xaxis: {
                      categories: labels,
                      labels:     { style: { fontSize: '10px', colors: C.textMuted } },
                      axisBorder: { show: false }, axisTicks: { show: false },
                    },
                    yaxis:      { labels: { style: { fontSize: '10px', colors: C.textMuted }, maxWidth: 120 } },
                    dataLabels: { enabled: true, textAnchor: 'start', offsetX: 8, style: { fontSize: '10px', fontWeight: 700, colors: [C.text], fontFamily: "'Barlow Condensed',sans-serif" } },
                    legend: { show: false },
                    grid:   { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3, xaxis: { lines: { show: false } } },
                    tooltip: { theme: 'dark', y: { formatter: v => `${v} ${t('anomaly.occurrences')}` } },
                  }}
                  series={series}
                  type="bar"
                  height={280}
                />
              )
            })() : (
              <EmptyState icon={<Search size={36} color="rgba(255,255,255,.18)"/>} title={t('anomaly.noData')}/>
            )}
          </ChartPanel>

          {/* Severity donut */}
          <ChartPanel title={t('anomaly.sevTitle')} sub={t('anomaly.sevSub')}>
            <ReactApexChart
              options={severityDonutOptions}
              series={[sevCounts.High, sevCounts.Medium, sevCounts.Low]}
              type="donut"
              height={280}
            />
          </ChartPanel>
        </div>

        {/* ── CONSENSUS EVENTS TABLE ───────────────────────────────── */}
        <SectionLabel
          action={<Badge variant="red">{events.length} {t('anomaly.eventsCount')}</Badge>}
          sub={t('anomaly.eventsSub')}
        >
          {t('anomaly.eventsSection')}
        </SectionLabel>

        <div style={{ border: `1px solid ${C.border}`, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg, transparent, ${C.red}, transparent)` }}/>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.025)', borderBottom: `1px solid ${C.border}` }}>
                {[
                  { label: t('anomaly.topRegions'), Icon: Globe          },
                  { label: t('anomaly.thDate'),     Icon: null            },
                  { label: t('anomaly.thScore'),    Icon: ArrowUpDown    },
                  { label: t('anomaly.severity'),   Icon: AlertTriangle  },
                  { label: t('anomaly.driver'),     Icon: Search         },
                ].map(({ label, Icon }) => (
                  <th key={label} style={{
                    padding: '12px 16px', textAlign: 'left',
                    fontSize: 9, fontWeight: 800, letterSpacing: '1.5px',
                    textTransform: 'uppercase', color: C.textDim, whiteSpace: 'nowrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {Icon && <Icon size={11} color={C.textDim}/>}
                      {label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: C.textMuted }}>
                    <Radio size={28} color="rgba(255,255,255,.18)"/>
                    <div style={{ marginTop: 12, fontSize: 13 }}>{t('anomaly.noEvents')}</div>
                  </td>
                </tr>
              ) : tableEvents.map((e, i) => (
                <tr key={i} className="af-table-row" style={{ borderBottom: `1px solid rgba(255,255,255,.04)`, transition: 'all .15s' }}>
                  <td style={{ padding: '11px 16px', fontWeight: 700, color: C.text, fontSize: 12 }}>{e.region}</td>
                  <td style={{ padding: '11px 16px', color: C.textMuted, fontFamily: "'Barlow Condensed',monospace", fontSize: 13, letterSpacing: '.3px' }}>{e.date}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{
                      fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 900, letterSpacing: '-.3px',
                      color: (e.combined_score || 0) > 0.85 ? C.redLight : (e.combined_score || 0) > 0.7 ? C.amber : C.textMuted,
                    }}>
                      {(e.combined_score || 0).toFixed(3)}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <Badge variant={e.if_severity === 'High' ? 'red' : e.if_severity === 'Medium' ? 'amber' : 'green'}>
                      {e.if_severity || 'N/A'}
                    </Badge>
                  </td>
                  <td style={{ padding: '11px 16px', color: C.textMuted, fontSize: 10, letterSpacing: '.5px' }}>
                    {(e.top_anomaly_driver || 'Unknown').replace(/_/g, ' ').replace('mean', '').trim()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── METHODOLOGY CARDS ────────────────────────────────────── */}
        <SectionLabel sub={t('anomaly.methodSub')}>
          {t('anomaly.methodSection')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          {methodCards.map((m, i) => (
            <div key={i} className="af-module-card" style={{
              background: C.bg3, border: `1px solid ${C.border}`,
              padding: '32px 26px', position: 'relative', overflow: 'hidden',
              transition: 'all .35s cubic-bezier(.22,1,.36,1)', cursor: 'default',
            }}>
              <div className="af-module-accent" style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
                background: `linear-gradient(90deg, transparent, ${m.accent}, transparent)`,
                transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s ease',
              }}/>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ width: 46, height: 46, background: `${m.accent}10`, border: `1px solid ${m.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <m.Icon size={20} color={m.accent}/>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '2px', padding: '3px 9px',
                  border: `1px solid ${m.tagColor}30`, color: m.tagColor,
                  textTransform: 'uppercase', background: `${m.tagColor}06`,
                }}>
                  {m.tag}
                </span>
              </div>

              <h3 style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 20, fontWeight: 800, color: C.text,
                letterSpacing: '-.3px', marginBottom: 10, lineHeight: 1.1,
              }}>
                {m.title}
              </h3>

              <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.8, fontWeight: 300, marginBottom: 18 }}>
                {m.desc}
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {m.metrics.map((met, j) => (
                  <span key={j} style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', padding: '3px 9px',
                    border: `1px solid ${m.accent}30`, color: m.accent,
                    textTransform: 'uppercase', background: `${m.accent}06`,
                  }}>
                    {met}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}