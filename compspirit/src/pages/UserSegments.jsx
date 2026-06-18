// src/pages/UserSegments.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC — User Segmentation (v3, aligned to NB03a + NB03c)
//
// FIXES vs v2:
//  US-F1  distClusters used startsWith('cluster_') — matched nothing
//         on label keys from NB03a-FIX-1 / NB03c → province chart was
//         always empty. Now filters by k !== 'region'.
//  US-F2  profileCols included string fields ('top_province',
//         'top_generation') → .toFixed(2) TypeError in the table.
//         Now restricted to numeric-only avg_* / rate columns.
//  US-F3  totalComplaints read pd.total_complaints (absent) instead
//         of pd.total_records (present). Fixed field name.
//  US-F4  optimalK for D1 read pd.n_clusters (KMeans key, absent in
//         complaint_segments.json) instead of pd.n_segments. Fixed.
//  US-F5  distribution state read dd.distribution (absent) instead of
//         dd.province_distribution. Fixed, with legacy fallback.
//  US-F6  PCA scatter / DBSCAN / PCA-variance tiles removed — neither
//         NB03a nor NB03c produces that data; always showed EmptyState
//         or '—'. Dead code dropped, tiles trimmed to 4 per tab.
//  US-F7  profileChart mixed unrelated scales for D1 (month ~6.2 and
//         unresolved_rate ~50% on the same bar). Replaced with a
//         dedicated unresolved-rate bar for D1, QoS-means bar for D2.
//  US-F8  All i18n keys replaced with plain English strings — ensures
//         the page is always readable without a translation file.
//  US-F9  Small-N warning badges added to cluster cards when n<30
//         (uses NB03a-FIX-3 small_n_segments list).
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from 'react'
import ReactApexChart from 'react-apexcharts'
import {
  Target, BarChart3, TrendingDown, Users, Activity,
  AlertTriangle, ArrowUpDown, MapPin, Zap,
} from 'lucide-react'
import {
  HW, ALARM, FONT, gapColor, gridLine,
  SectionLabel, StatBlock, ChartPanel, GapGrid,
  AlertBanner, Badge, Spinner, EmptyState, baseChartOptions,
  sevDim, sevBd,
} from '../components/UI'
import { useTheme }     from '../context/ThemeContext'
import { analyticsApi } from '../api/client'

// ── Categorical cluster palette — never alarm-ladder colours ─────────
const CLUSTER_COLORS = [HW.blue, '#8B5CF6', '#14B8A6', '#F97316',
                        '#EC4899', '#84CC16']
const clusterColor = i => CLUSTER_COLORS[i % CLUSTER_COLORS.length]
const clusterLabel = p  => p?.cluster_label || `Cluster ${p?.cluster_id ?? '?'}`

// ── Non-display profile fields (excluded from chart/table) ───────────
const NON_METRIC = new Set([
  'cluster_id', 'cluster_label', 'n_users', 'pct',
  'n_labelled', 'top_province', 'top_province_pct', 'top_generation',
  'month', 'day_of_week', 'quarter', 'week_num',
])

// ── Safe numeric formatter ───────────────────────────────────────────
const fmtNum = (v, d = 2) =>
  v != null && typeof v === 'number' ? v.toFixed(d) : '—'

// ─────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────
export default function UserSegments() {
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)
  const base         = useMemo(() => baseChartOptions(T), [T])

  // 'd1' = complaints, 'd2' = KPI subscribers
  const [activeTab,    setActiveTab]    = useState('d1')
  const [profiles,     setProfiles]     = useState([])
  const [distribution, setDistribution] = useState([])
  const [segMeta,      setSegMeta]      = useState({})
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [apiOnline,    setApiOnline]    = useState(true)

  const loadData = useCallback(async (tab) => {
    setLoading(true)
    setError(null)
    try {
      const isD1 = tab === 'd1'
      const [profRes, distRes] = await Promise.all([
        isD1 ? analyticsApi.complaintSegmentProfiles()
             : analyticsApi.segmentProfiles(),
        isD1 ? analyticsApi.complaintSegmentRegion()
             : analyticsApi.segmentRegionDistribution(),
      ])
      const pd = profRes.data || profRes
      const dd = distRes.data  || distRes

      setProfiles(pd.profiles || [])

      // US-F5: JSON key is province_distribution (not distribution)
      setDistribution(
        dd.province_distribution || dd.distribution ||
        pd.province_distribution || []
      )

      setSegMeta({
        dataset:          pd.dataset          || '',
        segmentColumn:    pd.segment_column   || 'sub_category',
        // US-F4: D1 has n_segments, D2 has n_clusters
        nSegments:        pd.n_clusters       ?? pd.n_segments ?? 0,
        // US-F3: field is total_records (not total_complaints)
        totalRecords:     pd.total_records    ?? pd.n_subscribers ?? 0,
        silhouette:       pd.silhouette_score ?? null,
        method:           pd.method           || (isD1 ? 'Natural segmentation' : 'KMeans'),
        qosFeatures:      pd.qos_features     || [],
        smallNSegments:   pd.small_n_segments || [],
        smallNNote:       pd.small_n_note     || '',
        reliableSegments: pd.n_reliable_segments ?? 0,
      })
      setApiOnline(true)
    } catch (err) {
      console.error('Segments fetch error:', err)
      setApiOnline(false)
      setError('API offline — segmentation data unavailable')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData(activeTab) }, [loadData, activeTab])

  const isD1 = activeTab === 'd1'

  // ── US-F1: segment keys = everything except 'region' ─────────────
  const distClusters = useMemo(() => {
    if (!distribution.length) return []
    return Object.keys(distribution[0]).filter(k => k !== 'region')
  }, [distribution])

  const distRegions = useMemo(
    () => distribution.map(d => d.region || ''),
    [distribution]
  )

  // ── US-F2: numeric-only avg_* and rate columns ────────────────────
  const profileCols = useMemo(() => {
    if (!profiles.length) return []
    return Object.keys(profiles[0]).filter(k =>
      !NON_METRIC.has(k) &&
      typeof profiles[0][k] === 'number'
    ).slice(0, 8)
  }, [profiles])

  // QoS avg_* columns only (for D2 profile chart)
  const avgCols = useMemo(
    () => profileCols.filter(k => k.startsWith('avg_')).slice(0, 6),
    [profileCols]
  )

  const tableCols = useMemo(() => {
    if (isD1) return ['unresolved_rate', 'top_province', 'top_province_pct']
    return ['disengagement_rate', 'top_province', 'top_generation',
            ...avgCols.slice(0, 3)]
  }, [isD1, avgCols])

  const smallNSet = useMemo(
    () => new Set(segMeta.smallNSegments || []),
    [segMeta.smallNSegments]
  )

  // ── KPI tiles — 4 per tab, always relevant ─────────────────────────
  const kpiTiles = useMemo(() => isD1 ? [
    { label: 'Segment Types',
      value: segMeta.nSegments || '—',
      color: HW.blue, icon: Target,
      sub: `Source column: ${segMeta.segmentColumn || 'sub_category'}` },
    { label: 'Total Complaints',
      value: (segMeta.totalRecords || 0).toLocaleString(),
      color: HW.blueLight, icon: Users,
      sub: 'Dataset 1 — complaints_clean.parquet' },
    { label: 'Reliable Segments',
      value: `${segMeta.reliableSegments ?? '—'} / ${segMeta.nSegments || '?'}`,
      color: ALARM.normal, icon: BarChart3,
      sub: 'Segments with n ≥ 30 records' },
    { label: 'Provinces Covered',
      value: distribution.length || '—',
      color: '#F97316', icon: MapPin,
      sub: 'Governorates in province distribution' },
  ] : [
    { label: 'Clusters (k)',
      value: segMeta.nSegments || '—',
      color: HW.blue, icon: Target,
      sub: segMeta.method || 'KMeans clustering' },
    { label: 'Subscribers Analysed',
      value: (segMeta.totalRecords || 0).toLocaleString(),
      color: HW.blueLight, icon: Users,
      sub: 'Dataset 2 — churn_labelled_v6.parquet' },
    { label: 'Silhouette Score',
      value: fmtNum(segMeta.silhouette, 4),
      color: ALARM.normal, icon: BarChart3,
      sub: 'Cluster quality · 1 = perfect separation' },
    { label: 'QoS Features Used',
      value: segMeta.qosFeatures?.length || '—',
      color: '#8B5CF6', icon: Zap,
      sub: 'Leak-free network quality features' },
  ], [isD1, segMeta, distribution.length])

  // ── Province × Segment stacked bar ──────────────────────────────────
  const distChart = useMemo(() =>
    distribution.length > 0 && distClusters.length > 0 ? {
      // US-F1/F6: distClusters now has label keys; series name = label directly
      series: distClusters.map((ck, i) => ({
        name: ck,
        data: distribution.map(d => +(d[ck] || 0).toFixed(1)),
      })),
      options: {
        ...base,
        chart:       { ...base.chart, type: 'bar', stacked: true },
        colors:      CLUSTER_COLORS.slice(0, distClusters.length),
        plotOptions: { bar: { columnWidth: '65%', borderRadius: 0 } },
        xaxis: {
          categories: distRegions,
          labels: { rotate: -40, style: { fontSize: '10px',
            colors: T.textMuted, fontFamily: FONT.display } },
          axisBorder: { show: false }, axisTicks: { show: false },
        },
        yaxis: {
          title: { text: '% of province',
            style: { fontSize: '10px', color: T.textMuted, fontWeight: 400 } },
          labels: { style: { fontSize: '10px', colors: T.textMuted } },
        },
        dataLabels: { enabled: false },
        legend: { position: 'top', labels: { colors: T.textMuted },
          markers: { radius: 2 }, itemMargin: { horizontal: 10 } },
        grid: { borderColor: gridLine(T), strokeDashArray: 3 },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `${v.toFixed(1)}%` } },
      },
    } : null,
    [distribution, distClusters, distRegions, base, T]
  )

  // ── D1: unresolved rate per segment (US-F7) ──────────────────────
  const unresolvedChart = useMemo(() => {
    if (!isD1 || !profiles.some(p => p.unresolved_rate != null)) return null
    const sorted = [...profiles]
      .filter(p => p.n_users >= 30)       // skip noise segments
      .sort((a, b) => (b.unresolved_rate || 0) - (a.unresolved_rate || 0))
    return {
      series: [{ name: 'Unresolved Rate', data: sorted.map(p => p.unresolved_rate || 0) }],
      options: {
        ...base,
        chart:       { ...base.chart, type: 'bar' },
        colors:      sorted.map(p =>
          (p.unresolved_rate || 0) > 60 ? ALARM.critical :
          (p.unresolved_rate || 0) > 40 ? ALARM.major   :
          (p.unresolved_rate || 0) > 20 ? ALARM.minor   : ALARM.normal
        ),
        plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: '60%',
          distributed: true } },
        xaxis: {
          categories: sorted.map(p => clusterLabel(p).substring(0, 35)),
          labels: { style: { fontSize: '10px', colors: T.textMuted } },
          axisBorder: { show: false }, axisTicks: { show: false },
          max: 100,
        },
        yaxis: { labels: { style: { fontSize: '10px', colors: T.textMuted },
          maxWidth: 200 } },
        dataLabels: { enabled: true, textAnchor: 'start', offsetX: 8,
          style: { fontSize: '10px', fontWeight: 700, colors: [T.text] },
          formatter: v => `${v.toFixed(1)}%` },
        legend: { show: false },
        grid: { borderColor: gridLine(T), strokeDashArray: 3,
          xaxis: { lines: { show: false } } },
        annotations: { xaxis: [{ x: 30, borderColor: ALARM.major,
          borderWidth: 1, strokeDashArray: 5,
          label: { text: '30% target', position: 'right', offsetX: -8,
            style: { background: sevDim(ALARM.major, '14'), color: ALARM.major,
              fontSize: '10px', fontWeight: 600,
              padding: { top: 3, right: 6, bottom: 3, left: 6 } } } }] },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `${v.toFixed(1)}% unresolved` } },
      },
    }
  }, [isD1, profiles, base, T])

  // ── D2: QoS means per cluster (US-F7) ────────────────────────────
  const qosChart = useMemo(() => {
    if (isD1 || avgCols.length < 2) return null
    return {
      series: profiles.map((p, i) => ({
        name: clusterLabel(p),
        data: avgCols.map(c => +(p[c] || 0).toFixed(2)),
      })),
      options: {
        ...base,
        chart:       { ...base.chart, type: 'bar' },
        colors:      CLUSTER_COLORS.slice(0, profiles.length),
        plotOptions: { bar: { columnWidth: '52%', borderRadius: 0 } },
        xaxis: {
          categories: avgCols.map(c =>
            c.replace('avg_', '').replace(/_/g, ' ').substring(0, 18)),
          labels: { rotate: -30, style: { fontSize: '10px',
            colors: T.textMuted, fontFamily: FONT.display } },
          axisBorder: { show: false }, axisTicks: { show: false },
        },
        dataLabels: { enabled: false },
        legend: { position: 'top', labels: { colors: T.textMuted },
          markers: { radius: 2 }, itemMargin: { horizontal: 12 } },
        grid: { borderColor: gridLine(T), strokeDashArray: 3 },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => v.toFixed(2) } },
      },
    }
  }, [isD1, profiles, avgCols, base, T])

  // ── D2: radar chart for QoS normalised comparison ────────────────
  const radarChart = useMemo(() => {
    if (isD1 || avgCols.length < 3) return null
    return {
      series: profiles.map(p => ({
        name: clusterLabel(p),
        data: avgCols.map(c => {
          const max = Math.max(...profiles.map(pr => pr[c] || 0), 1)
          return parseFloat(((p[c] || 0) / max).toFixed(3))
        }),
      })),
      options: {
        ...base,
        chart:   { ...base.chart, type: 'radar' },
        colors:  CLUSTER_COLORS.slice(0, profiles.length),
        markers: { size: 4 },
        fill:    { opacity: 0.12 },
        stroke:  { width: 2 },
        xaxis: {
          categories: avgCols.map(c =>
            c.replace('avg_', '').replace(/_/g, ' ').substring(0, 14)),
          labels: { style: { fontSize: '10px', colors: T.textMuted } },
        },
        yaxis: { show: false, min: 0, max: 1 },
        plotOptions: { radar: { polygons: {
          strokeColors: T.mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)',
          fill: { colors: T.mode === 'dark'
            ? ['rgba(255,255,255,.01)', 'rgba(255,255,255,.02)']
            : ['rgba(0,0,0,.01)', 'rgba(0,0,0,.02)'] },
        } } },
        legend: { position: 'bottom', labels: { colors: T.textMuted },
          markers: { radius: 2 } },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => v.toFixed(3) } },
      },
    }
  }, [isD1, profiles, avgCols, base, T])

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: HW.blue,
          display: 'inline-block', animation: 'noc-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
          textTransform: 'uppercase', color: HW.blue }}>
          LOADING SEGMENTS
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
        .us-card { transition: all .35s cubic-bezier(.22,1,.36,1); }
        .us-card:hover {
          border-color: ${HW.blueBd} !important;
          background:   ${HW.blueDim} !important;
          transform:    translateY(-2px);
        }
        .us-card:hover .us-accent { transform: scaleX(1) !important; }
        .us-table-row:hover td { background: ${T.bgCardHover} !important; }
        .us-tab { transition: all .2s; }
        .us-tab:hover { background: ${T.bgCardHover} !important; }
      `}</style>

      <div style={{ padding: '36px 44px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ══ HEADER ══════════════════════════════════════════════════ */}
        <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 24,
          marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10,
            marginBottom: 18 }}>
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
                {apiOnline ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '1.5px' }}>
              Huawei Technologies Tunisia · SpiriCom NOC
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{ fontFamily: FONT.display,
                fontSize: 'clamp(26px,3.5vw,52px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: T.text,
                marginBottom: 8 }}>
                USER{' '}
                <span style={{ color: HW.red, fontStyle: 'italic' }}>SEGMENTATION</span>
              </h1>
              <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 300 }}>
                {isD1
                  ? `Complaint type segmentation · ${segMeta.nSegments || '?'} segments · ${(segMeta.totalRecords || 0).toLocaleString()} complaints`
                  : `Subscriber clustering · k=${segMeta.nSegments || '?'} · ${(segMeta.totalRecords || 0).toLocaleString()} subscribers · ${segMeta.method || 'KMeans'}`
                }
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? 'API Online' : 'API Offline',
                  color: apiOnline ? ALARM.normal : ALARM.critical,
                  bd: sevBd(apiOnline ? ALARM.normal : ALARM.critical),
                  bg: sevDim(apiOnline ? ALARM.normal : ALARM.critical, '0A') },
                { label: isD1 ? 'Natural Segmentation' : 'KMeans Clustering',
                  color: T.textMuted, bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: isD1 ? `${segMeta.nSegments || '?'} Segments`
                              : `k = ${segMeta.nSegments || '?'}`,
                  color: T.textMuted, bd: T.border,
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

        {error && (
          <AlertBanner severity="minor" icon={AlertTriangle}
            title="ERROR" message={error}/>
        )}

        {/* ── DATASET TAB SWITCHER ─────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 1, background: GAP,
          marginBottom: 24, marginTop: 8 }}>
          {[
            { key: 'd1', label: 'Dataset 1 — Complaint Segments',
              sub: `${segMeta.segmentColumn || 'sub_category'} · province distribution · unresolved rates` },
            { key: 'd2', label: 'Dataset 2 — Subscriber Clustering',
              sub: 'KMeans · QoS features · disengagement profiling · province heatmap' },
          ].map(tab => {
            const active = activeTab === tab.key
            return (
              <button key={tab.key} className="us-tab"
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={active}
                style={{ flex: 1, padding: '16px 20px', cursor: 'pointer',
                  background: active ? HW.blueDim : T.bgCard,
                  border: 'none',
                  borderTop:    `2px solid ${active ? HW.blue : 'transparent'}`,
                  borderBottom: `1px solid ${T.border}`,
                  textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ fontSize: 11, fontWeight: 800,
                  color: active ? HW.blue : T.textMuted,
                  letterSpacing: '.5px', marginBottom: 4 }}>
                  {tab.label}
                </div>
                <div style={{ fontSize: 10, color: T.textDim,
                  letterSpacing: '1px' }}>{tab.sub}</div>
              </button>
            )
          })}
        </div>

        {/* ══ KPI TILES ═══════════════════════════════════════════════ */}
        <SectionLabel sub={isD1
          ? 'Complaint type counts and reliability indicators'
          : 'KMeans clustering quality and dataset coverage'}>
          OVERVIEW
        </SectionLabel>
        <GapGrid columns="repeat(4,1fr)">
          {kpiTiles.map((kpi, i) => <StatBlock key={i} {...kpi}/>)}
        </GapGrid>

        {/* ══ CLUSTER CARDS ═══════════════════════════════════════════ */}
        {profiles.length > 0 && (
          <>
            <SectionLabel
              action={<Badge variant="blue">
                {profiles.length} segment{profiles.length !== 1 ? 's' : ''}
              </Badge>}
              sub={isD1
                ? `Source: ${segMeta.segmentColumn || 'sub_category'} · ${segMeta.reliableSegments ?? '?'} reliable (n≥30), ${(segMeta.smallNSegments || []).length} small-N`
                : `Method: ${segMeta.method || 'KMeans'} · Silhouette: ${fmtNum(segMeta.silhouette, 4)}`}>
              SEGMENT PROFILES
            </SectionLabel>

            <GapGrid columns={`repeat(${Math.min(profiles.length, 3)},1fr)`}>
              {profiles.map((p, i) => {
                const accent  = clusterColor(i)
                const isSmall = smallNSet.has(p.cluster_label)
                return (
                  <div key={i} className="us-card" style={{
                    background: T.bgCard, border: `1px solid ${T.border}`,
                    padding: '26px 22px', position: 'relative',
                    overflow: 'hidden', cursor: 'default',
                    opacity: isSmall ? 0.7 : 1 }}>
                    <div className="us-accent" style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
                      background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                      transform: 'scaleX(0)', transformOrigin: 'center',
                      transition: 'transform .4s ease' }}/>

                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: accent,
                          letterSpacing: '2px', textTransform: 'uppercase',
                          marginBottom: 4 }}>
                          Cluster {p.cluster_id}
                        </div>
                        <div style={{ fontFamily: FONT.display, fontSize: 17,
                          fontWeight: 800, color: T.text, letterSpacing: '-.3px',
                          lineHeight: 1.15 }}>
                          {clusterLabel(p)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-end', gap: 4 }}>
                        <Badge variant="blue">{p.pct || 0}%</Badge>
                        {isSmall && (
                          <span style={{ fontSize: 9, fontWeight: 800,
                            letterSpacing: '1px', padding: '2px 6px',
                            background: sevDim(ALARM.minor, '12'),
                            border: `1px solid ${sevBd(ALARM.minor)}`,
                            color: ALARM.minor, textTransform: 'uppercase' }}>
                            n={p.n_users} · unreliable
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Core metrics — D1 and D2 differ */}
                    <div style={{ display: 'grid',
                      gridTemplateColumns: isD1 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 6,
                      marginBottom: 12 }}>
                      {[
                        { label: 'Subscribers', value: (p.n_users || 0).toLocaleString() },
                        ...(isD1
                          ? [{ label: 'Unresolved',
                               value: p.unresolved_rate != null
                                 ? `${p.unresolved_rate.toFixed(1)}%` : '—' }]
                          : [{ label: 'Disengaged',
                               value: p.disengagement_rate != null
                                 ? `${p.disengagement_rate.toFixed(1)}%` : '—' }]),
                        { label: isD1 ? 'Top Province' : 'Top Region',
                          value: p.top_province || '—' },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: T.bgCardHover,
                          padding: '10px 12px', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: '10%',
                            right: '10%', height: 1,
                            background: `linear-gradient(90deg,transparent,${accent}55,transparent)` }}/>
                          <div style={{ fontSize: 9, color: T.textDim,
                            letterSpacing: '1.5px', textTransform: 'uppercase',
                            fontWeight: 700, marginBottom: 3 }}>{label}</div>
                          <div style={{ fontFamily: FONT.display, fontSize: 18,
                            fontWeight: 900, color: accent,
                            letterSpacing: '-1px', lineHeight: 1 }}>{value}</div>
                        </div>
                      ))}
                      {!isD1 && p.top_generation && (
                        <div style={{ background: T.bgCardHover,
                          padding: '10px 12px', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ fontSize: 9, color: T.textDim,
                            letterSpacing: '1.5px', textTransform: 'uppercase',
                            fontWeight: 700, marginBottom: 3 }}>Top Generation</div>
                          <div style={{ fontFamily: FONT.display, fontSize: 13,
                            fontWeight: 800, color: T.text, lineHeight: 1.2 }}>
                            {p.top_generation}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ height: 3, background: T.border, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${p.pct || 0}%`,
                        background: `linear-gradient(to right, ${accent}, ${accent}80)`,
                        transition: 'width .6s ease' }}/>
                    </div>
                  </div>
                )
              })}
            </GapGrid>
          </>
        )}

        {/* ══ D1: UNRESOLVED RATE + PROVINCE DISTRIBUTION ════════════ */}
        {/* ══ D2: QoS PROFILES + PROVINCE DISTRIBUTION ══════════════ */}
        <SectionLabel sub={isD1
          ? 'Unresolved complaint rate per segment (reliable segments only, n≥30) · Province distribution'
          : 'Mean QoS metrics per cluster · Province distribution across clusters'}>
          {isD1 ? 'COMPLAINT ANALYSIS' : 'CLUSTER ANALYSIS'}
        </SectionLabel>

        <GapGrid columns="1fr 1fr">
          <ChartPanel
            title={isD1 ? 'Unresolved Rate by Segment' : 'QoS Profile by Cluster'}
            sub={isD1
              ? 'Severity-coloured · >60% critical, >40% major, >20% minor · 30% target line'
              : 'Mean QoS metrics per cluster · normalised scales'}>
            {isD1 ? (
              unresolvedChart ? (
                <ReactApexChart options={unresolvedChart.options}
                  series={unresolvedChart.series} type="bar" height={360}/>
              ) : (
                <EmptyState icon={BarChart3} title="No unresolved rate data"
                  desc="Requires is_unresolved column in complaints_clean.parquet"/>
              )
            ) : (
              qosChart ? (
                <ReactApexChart options={qosChart.options}
                  series={qosChart.series} type="bar" height={360}/>
              ) : (
                <EmptyState icon={Activity} title="No QoS profile data"
                  desc="Requires avg_* columns in kpi_segments.json"/>
              )
            )}
          </ChartPanel>

          <ChartPanel
            title="Province Distribution"
            sub={isD1
              ? 'Row-normalised % of complaints per segment by province'
              : 'Row-normalised % of subscribers per cluster by province'}>
            {distChart ? (
              <ReactApexChart options={distChart.options}
                series={distChart.series} type="bar" height={360}/>
            ) : (
              <EmptyState icon={MapPin} title="No province data"
                desc="Requires province_distribution in the segment JSON"/>
            )}
          </ChartPanel>
        </GapGrid>

        {/* ══ D2 ONLY: RADAR CHART ════════════════════════════════════ */}
        {!isD1 && (
          <>
            <SectionLabel sub="Normalised QoS means · higher value = further above cluster average">
              RADAR — QoS COMPARISON
            </SectionLabel>
            <ChartPanel
              title="Cluster QoS Radar"
              sub="Each axis normalised to [0, 1] relative to the maximum across clusters">
              {radarChart ? (
                <ReactApexChart options={radarChart.options}
                  series={radarChart.series} type="radar" height={420}/>
              ) : (
                <EmptyState icon={Activity} title="Radar requires ≥ 3 QoS features"/>
              )}
            </ChartPanel>
          </>
        )}

        {/* ══ PROFILES TABLE ══════════════════════════════════════════ */}
        {profiles.length > 0 && (
          <>
            <SectionLabel
              action={<Badge variant="blue">
                {profiles.length} row{profiles.length !== 1 ? 's' : ''}
              </Badge>}
              sub={isD1
                ? 'Segment statistics · unreliable rows (n<30) are flagged'
                : 'Cluster statistics · top province and generation · key QoS means'}>
              SEGMENT DETAIL TABLE
            </SectionLabel>

            <div style={{ border: `1px solid ${T.border}`, overflow: 'hidden',
              position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0,
                height: 1.5,
                background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: T.mode === 'dark'
                        ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.04)',
                      borderBottom: `1px solid ${T.border}` }}>
                      {[
                        { label: '#'       },
                        { label: 'Segment / Cluster' },
                        { label: 'N',   Icon: Users },
                        { label: 'Share', Icon: ArrowUpDown },
                        ...(isD1
                          ? [{ label: 'Unresolved' }, { label: 'Top Province' },
                             { label: 'Prov. %' }]
                          : [{ label: 'Disengaged' }, { label: 'Top Province' },
                             { label: 'Top Gen.' },
                             ...avgCols.slice(0, 3).map(c => ({
                               label: c.replace('avg_','').replace(/_/g,' ').substring(0,12),
                             }))]),
                      ].map(({ label, Icon }, hi) => (
                        <th key={hi} style={{ padding: '11px 14px',
                          textAlign: 'left', fontSize: 10, fontWeight: 800,
                          letterSpacing: '1.5px', textTransform: 'uppercase',
                          color: T.textDim, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {Icon && <Icon size={10} color={T.textDim}/>}
                            {label}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p, i) => {
                      const isSmall = smallNSet.has(p.cluster_label)
                      return (
                        <tr key={i} className="us-table-row" style={{
                          borderBottom: `1px solid ${T.mode === 'dark'
                            ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)'}`,
                          transition: 'all .15s',
                          opacity: isSmall ? 0.65 : 1 }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 8, height: 8,
                                background: clusterColor(i), flexShrink: 0 }}/>
                              <span style={{ fontFamily: FONT.display, fontSize: 15,
                                fontWeight: 800, color: clusterColor(i) }}>
                                {p.cluster_id}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700,
                            color: T.text, fontSize: 12 }}>
                            {clusterLabel(p)}
                            {isSmall && (
                              <span style={{ marginLeft: 6, fontSize: 9,
                                color: ALARM.minor, fontWeight: 800 }}>
                                · n&lt;30
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontFamily: FONT.display, fontSize: 14,
                              fontWeight: 700, color: T.text }}>
                              {(p.n_users || 0).toLocaleString()}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span style={{ fontFamily: FONT.display, fontSize: 14,
                                fontWeight: 700, color: clusterColor(i) }}>
                                {p.pct || 0}%
                              </span>
                              <div style={{ height: 3, width: 36,
                                background: T.border, overflow: 'hidden' }}>
                                <div style={{ height: '100%',
                                  width: `${p.pct || 0}%`,
                                  background: clusterColor(i) }}/>
                              </div>
                            </div>
                          </td>
                          {isD1 ? <>
                            <td style={{ padding: '10px 14px', fontFamily: FONT.display,
                              fontSize: 13, fontWeight: 600,
                              color: (p.unresolved_rate||0) > 60 ? ALARM.critical
                                   : (p.unresolved_rate||0) > 40 ? ALARM.major
                                   : T.textDim }}>
                              {fmtNum(p.unresolved_rate, 1)}%
                            </td>
                            <td style={{ padding: '10px 14px', color: T.textDim,
                              fontSize: 11 }}>
                              {p.top_province || '—'}
                            </td>
                            <td style={{ padding: '10px 14px', color: T.textDim,
                              fontFamily: FONT.display, fontSize: 13 }}>
                              {fmtNum(p.top_province_pct, 1)}%
                            </td>
                          </> : <>
                            <td style={{ padding: '10px 14px', fontFamily: FONT.display,
                              fontSize: 13, fontWeight: 600,
                              color: (p.disengagement_rate||0) > 40 ? ALARM.critical
                                   : (p.disengagement_rate||0) > 30 ? ALARM.major
                                   : T.textDim }}>
                              {fmtNum(p.disengagement_rate, 1)}%
                            </td>
                            <td style={{ padding: '10px 14px', color: T.textDim,
                              fontSize: 11 }}>
                              {p.top_province || '—'}
                            </td>
                            <td style={{ padding: '10px 14px', color: T.textDim,
                              fontSize: 11 }}>
                              {p.top_generation || '—'}
                            </td>
                            {avgCols.slice(0, 3).map(col => (
                              <td key={col} style={{ padding: '10px 14px',
                                color: T.textDim, fontFamily: FONT.display,
                                fontSize: 13, fontWeight: 600 }}>
                                {/* US-F2: only numeric avg_* columns reach here */}
                                {fmtNum(p[col], 2)}
                              </td>
                            ))}
                          </>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Small-N note banner */}
            {isD1 && (segMeta.smallNSegments || []).length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start',
                gap: 8, padding: '8px 12px',
                background: sevDim(ALARM.minor, '08'),
                border: `1px solid ${sevBd(ALARM.minor)}` }}>
                <AlertTriangle size={12} color={ALARM.minor} style={{ marginTop: 1, flexShrink: 0 }}/>
                <div style={{ fontSize: 10, color: ALARM.minor, lineHeight: 1.6 }}>
                  <strong>Small-sample segments (n&lt;30):</strong>{' '}
                  {segMeta.smallNNote || 'Statistics unreliable — treat as sampling noise.'}
                  {' Affected: '}
                  {(segMeta.smallNSegments || []).join(' · ')}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}