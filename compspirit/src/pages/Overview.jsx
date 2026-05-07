// src/pages/Overview.jsx
// ─────────────────────────────────────────────────────────────────────
// FIX OV-A: `const C` declared twice — second (old local) block deleted.
// FIX OV-B: `const baseChartOptions` imported from UI then re-declared —
//            local declaration deleted; the import is used throughout.
// FIX OV-C: BrandHeader, SectionHeader, KpiCard, ChartCard, Badge,
//            Spinner all re-declared after import — local definitions
//            deleted; only the UI.jsx exports are used.
// FIX OV-D: local BrandHeader used <IconRadio> (undefined) instead of
//            IcoRadio — moot after deletion, but noted.
// FIX OV-E: Brand name "CompSpirit" → "SpiriComp" in BrandHeader subtitle.
// FIX OV-F: local baseChartOptions had animations.enabled:true —
//            removed; UI.jsx exports animations:false.
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import ReactApexChart from 'react-apexcharts'
import { analyticsApi } from '../api/client'
import {
  BrandHeader, SectionHeader, KpiCard, ChartCard,
  Badge, Spinner, EmptyState, THEME, baseChartOptions,
} from '../components/UI'

// ── Colour alias — single declaration ────────────────────────────────
const C = THEME   // FIX OV-A: only one `const C`

const KPI_COLORS = [
  C.red, C.amber, C.cyan, C.green,
  C.blue, C.purple, C.orange, '#14B8A6',
]

const HEATMAP_RANGES = [
  { from: 0,  to: 45,  color: '#7F1D1D', name: 'Critical'  },
  { from: 45, to: 60,  color: '#991B1B', name: 'Very Poor' },
  { from: 60, to: 70,  color: '#DC2626', name: 'Poor'      },
  { from: 70, to: 80,  color: '#F59E0B', name: 'Fair'      },
  { from: 80, to: 90,  color: '#84CC16', name: 'Good'      },
  { from: 90, to: 100, color: '#22C55E', name: 'Excellent' },
]

const REGION_COLORS = [
  '#DC143C', '#E5314D', '#EC5468', '#F26C7E',
  '#F58A99', '#F8A4B0', '#FABDC6', '#FCD2D9', '#FDDFE5', '#FEEAEE',
]

// ── Local chart defaults (extends shared base — FIX OV-B/OV-F) ───────
// baseChartOptions imported from UI.jsx already has animations:false.
// No local redeclaration needed.
const ovChartOpts = {
  ...baseChartOptions,
  xaxis: {
    ...baseChartOptions.xaxis,
    labels: { style: { fontSize: '10px', colors: C.textMuted } },
    axisBorder: { show: false },
    axisTicks:  { show: false },
  },
  yaxis: {
    labels: { style: { fontSize: '10px', colors: C.textMuted } },
  },
}

// ── SVG icons (local — only used on this page) ────────────────────────
const IcoSignal = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V4M22 20v-4"/>
  </svg>
)
const IcoActivity = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const IcoUsers = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IcoGlobe = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
)
const IcoCalendar = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IcoDatabase = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
)
const IcoRadio = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2"/>
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
  </svg>
)
const IcoAlert = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

const KPI_ICONS = [IcoSignal, IcoActivity, IcoAlert, IcoUsers, IcoRadio, IcoActivity, IcoGlobe, IcoAlert]

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function Overview() {
  const [overview, setOverview] = useState(null)
  const [kpis,     setKpis]     = useState([])
  const [trend,    setTrend]    = useState([])
  const [regions,  setRegions]  = useState([])
  const [heatmap,  setHeatmap]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [ov, kp, tr, rg, hm] = await Promise.all([
          analyticsApi.overview(),
          analyticsApi.kpiTiles(),
          analyticsApi.complaintsTrend(),
          analyticsApi.complaintsByRegion(),
          analyticsApi.kpiHeatmap(),
        ])
        setOverview(ov.data)
        setKpis(kp.data?.tiles     || [])
        setTrend(tr.data?.trend    || [])
        setRegions(rg.data?.regions|| [])
        setHeatmap(hm.data?.series || [])
      } catch (err) {
        console.error('Dashboard fetch error:', err)
        setError('Backend connection failed — start FastAPI on port 8000')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ padding: '28px 36px' }}>
      <BrandHeader title="NOC Intelligence Dashboard" subtitle="Initializing…" icon={IcoRadio} />
      <Spinner size={48} />
    </div>
  )

  if (error) return (
    <div style={{ padding: '28px 36px' }}>
      <BrandHeader title="NOC Intelligence Dashboard" subtitle="System Status" icon={IcoRadio} />
      <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 10, padding: 24, display: 'flex', alignItems: 'center', gap: 16, marginTop: 40 }}>
        <IcoAlert size={28} color={C.amber} />
        <div>
          <div style={{ color: C.amber, fontSize: 15, fontWeight: 700 }}>FastAPI Connection Required</div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>{error}</div>
        </div>
      </div>
    </div>
  )

  const spikeCount = trend.filter(d => d.is_spike).length
  const svcVals    = overview?.by_service || {}
  const svcTotal   = Object.values(svcVals).reduce((a, b) => a + b, 0)

  // ── Chart configs ──────────────────────────────────────────────────

  const trendChart = {
    series: [
      { name: 'Daily Complaints', type: 'area',    data: trend.map(d => ({ x: d.date, y: d.total_complaints })) },
      { name: 'Anomaly Spike',    type: 'scatter', data: trend.filter(d => d.is_spike).map(d => ({ x: d.date, y: d.total_complaints })) },
      { name: '7-Day Rolling Avg',type: 'line',    data: trend.map(d => ({ x: d.date, y: d.roll7 })) },
    ],
    options: {
      ...ovChartOpts,
      chart:   { ...ovChartOpts.chart, type: 'line', stacked: false },
      colors:  [C.red, C.orange, C.cyan],
      stroke:  { curve: 'smooth', width: [2.5, 0, 1.5], dashArray: [0, 0, 4] },
      markers: { size: [0, 8, 0], strokeWidth: [0, 2], strokeColors: ['#fff'] },
      fill:    { type: ['gradient','solid','solid'], gradient: { shade: 'dark', opacityFrom: 0.25, opacityTo: 0.02 } },
      xaxis:   { type: 'datetime', labels: { format: 'dd MMM', style: { fontSize: '10px', colors: C.textMuted } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis:   { title: { text: 'Complaints', style: { fontSize: '10px', color: C.textMuted } }, labels: { style: { fontSize: '10px', colors: C.textMuted } } },
    },
  }

  // FIX OV2: heatChart only built when series is non-empty
  const heatChart = heatmap.length > 0 ? {
    series: heatmap,
    options: {
      ...ovChartOpts,
      chart:       { ...ovChartOpts.chart, type: 'heatmap' },
      plotOptions: { heatmap: { radius: 3, enableShades: false, colorScale: { ranges: HEATMAP_RANGES } } },
      dataLabels:  { enabled: false },
      xaxis:       { labels: { rotate: -30, style: { fontSize: '9px', colors: C.textMuted } }, position: 'top', axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis:       { labels: { style: { fontSize: '10px', colors: C.textMuted } } },
    },
  } : null

  const svcChart = Object.keys(svcVals).length > 0 ? {
    series: Object.values(svcVals),
    options: {
      ...ovChartOpts,
      chart:       { ...ovChartOpts.chart, type: 'donut' },
      labels:      Object.keys(svcVals),
      colors:      [C.blue, C.red, C.purple, C.amber, C.cyan],
      stroke:      { width: 2, colors: [C.bgCard || '#0F172A'] },
      plotOptions: { pie: { donut: { size: '72%', labels: { show: true, name: { fontSize: '10px', color: C.textMuted }, value: { fontSize: '28px', fontWeight: 800, color: C.text }, total: { show: true, label: 'Total', fontSize: '10px', color: C.textMuted, formatter: () => `${(svcTotal / 1000).toFixed(1)}K` } } } } },
      legend:      { position: 'bottom', labels: { colors: C.textMuted } },
    },
  } : null

  const regionsChart = regions.length > 0 ? {
    series: [{ name: 'Complaints', data: regions.map(r => r.total_complaints) }],
    options: {
      ...ovChartOpts,
      chart:       { ...ovChartOpts.chart, type: 'bar' },
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%', distributed: true, dataLabels: { position: 'top' } } },
      colors:      REGION_COLORS,
      dataLabels:  { enabled: true, textAnchor: 'start', style: { fontSize: '10px', fontWeight: 600, colors: [C.text] }, offsetX: 8, formatter: v => v.toLocaleString() },
      xaxis:       { categories: regions.map(r => (r.region || '').replace(' Gouvernorat', '')), labels: { style: { fontSize: '11px', colors: C.textMuted } }, axisBorder: { show: false }, axisTicks: { show: false } },
      legend:      { show: false },
      tooltip:     { y: { formatter: v => `${v.toLocaleString()} complaints` } },
    },
  } : null

  const infoCards = [
    { label: 'Total Complaints',    value: overview?.total_complaints?.toLocaleString() || '—', color: C.red,    Icon: IcoDatabase },
    { label: 'Unique Subscribers',  value: overview?.unique_msisdns?.toLocaleString()   || '—', color: C.blue,   Icon: IcoUsers    },
    { label: 'Geographic Coverage', value: `${overview?.unique_cities || '—'} Cities`,          color: C.amber,  Icon: IcoGlobe    },
    { label: 'Analysis Period',      value: overview?.date_min ? `${overview.date_min} — ${overview.date_max}` : '—', color: C.purple, Icon: IcoCalendar },
  ]

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 36px 60px', maxWidth: 1500, margin: '0 auto' }}>

      {/* FIX OV-E: brand renamed to SpiriComp */}
      <BrandHeader
        title="NOC Intelligence Dashboard"
        subtitle="Real-time telecom complaint analytics — SpiriComp & Ooredoo Tunisia"
        icon={IcoRadio}
        badges={[
          'LIVE',
          `${(overview?.total_complaints || 0).toLocaleString()} Complaints`,
          `${overview?.unique_regions || 0} Governorates`,
          `${overview?.unique_cities  || 0} Cities`,
        ]}
      />

      {/* ── KPI tiles ── */}
      <SectionHeader
        subtitle="Real-time indicators vs previous 7-day period"
        action={<Badge variant="blue">{new Date().toLocaleTimeString()}</Badge>}
      >
        Network Performance KPIs
      </SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {kpis.map((kpi, i) => {
          const color = KPI_COLORS[i % KPI_COLORS.length]
          const IconComp = KPI_ICONS[i % KPI_ICONS.length]
          return (
            <KpiCard
              key={i}
              {...kpi}
              color={color}
              icon={<IconComp size={14} color={color} />}
            />
          )
        })}
      </div>

      {/* ── Trend chart ── */}
      <SectionHeader
        subtitle="90-day historical data with anomaly detection"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Badge variant="red">{spikeCount} Spikes</Badge>
            <Badge variant="green">Z-Score &gt; 2.5</Badge>
          </div>
        }
      >
        Complaint Volume Evolution
      </SectionHeader>
      <ChartCard subtitle="Daily complaints · rolling average · anomaly markers">
        <ReactApexChart options={trendChart.options} series={trendChart.series} type="line" height={340} />
      </ChartCard>

      {/* ── Heatmap + Service breakdown ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 18, marginTop: 8 }}>
        <div>
          <SectionHeader subtitle="Monthly QoE scores by region — colour intensity = quality">
            QoE Score Heatmap
          </SectionHeader>
          {heatChart ? (
            <ChartCard subtitle="Red = critical · Green = excellent">
              <ReactApexChart options={heatChart.options} series={heatChart.series} type="heatmap" height={380} />
            </ChartCard>
          ) : (
            <EmptyState
              icon="🌡️"
              title="No heatmap data"
              desc="Run Notebook 02 to generate kpi_daily_agg.parquet"
            />
          )}
        </div>
        <div>
          <SectionHeader subtitle="Distribution across service categories">
            Service Breakdown
          </SectionHeader>
          {svcChart ? (
            <ChartCard subtitle={`Total: ${svcTotal.toLocaleString()} complaints recorded`}>
              <ReactApexChart options={svcChart.options} series={svcChart.series} type="donut" height={380} />
            </ChartCard>
          ) : (
            <EmptyState icon="📊" title="No service data" />
          )}
        </div>
      </div>

      {/* ── Regional bar chart ── */}
      <SectionHeader
        subtitle="Descending order · all services aggregated"
        action={<Badge variant="cyan">Top {regions.length} Regions</Badge>}
      >
        Regional Complaint Distribution
      </SectionHeader>
      {regionsChart ? (
        <ChartCard subtitle="Hover for detailed breakdown">
          <ReactApexChart options={regionsChart.options} series={regionsChart.series} type="bar" height={480} />
        </ChartCard>
      ) : (
        <EmptyState icon="🗺️" title="No regional data" />
      )}

      {/* ── Summary info row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 24 }}>
        {infoCards.map((item, i) => (
          <div key={i}
            style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.3s', borderLeft: `3px solid ${item.color}` }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHover; e.currentTarget.style.background = C.bgCardHover }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border;      e.currentTarget.style.background = C.bgCard     }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: `${item.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <item.Icon size={20} color={item.color} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: item.color, wordBreak: 'break-all', lineHeight: 1.2 }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}