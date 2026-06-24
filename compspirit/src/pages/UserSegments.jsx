// src/pages/UserSegments.jsx
// SpiriCom NOC — User Segmentation — Dataset 2 only (KPI subscribers)

import { useState, useEffect, useMemo, useCallback } from 'react'
import ReactApexChart from 'react-apexcharts'
import {
  Target, BarChart3, Users, Activity,
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

// ── Cluster palette ───────────────────────────────────────────────────
const CLUSTER_COLORS = [HW.blue, '#8B5CF6', '#14B8A6', '#F97316', '#EC4899', '#84CC16']
const clusterColor = i => CLUSTER_COLORS[i % CLUSTER_COLORS.length]
const clusterLabel = p  => p?.cluster_label || `Cluster ${p?.cluster_id ?? '?'}`

const NON_METRIC = new Set([
  'cluster_id', 'cluster_label', 'n_users', 'pct',
  'n_labelled', 'top_province', 'top_province_pct', 'top_generation',
  'month', 'day_of_week', 'quarter', 'week_num',
])

const KNOWN_QOS_FEATURES = [
  'e2e_delay_ms', 'client_rtt_ms', 'server_rtt_ms',
  'server_packet_loss_rate', 'session_active_rate',
  'number_of_regions', 'traffic_5g', 'dou_total', 'duration',
]

const fmtNum = (v, d = 2) =>
  v != null && typeof v === 'number' ? v.toFixed(d) : '—'

// ═════════════════════════════════════════════════════════════════════
export default function UserSegments() {
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)
  const base         = useMemo(() => baseChartOptions(T), [T])

  const [profiles,     setProfiles]     = useState([])
  const [distribution, setDistribution] = useState([])
  const [segMeta,      setSegMeta]      = useState({})
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [apiOnline,    setApiOnline]    = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [profRes, distRes] = await Promise.all([
        analyticsApi.segmentProfiles(),
        analyticsApi.segmentRegionDistribution(),
      ])
      const pd   = profRes.data || profRes
      const dd   = distRes.data || distRes
      const dist = dd.province_distribution || dd.distribution || []
      let profs  = pd.profiles || []

      const computedTotal    = profs.reduce((s, p) => s + (p.n_users || 0), 0)
      const computedReliable = profs.filter(p => (p.n_users || 0) >= 30).length

      if (computedTotal > 0) {
        profs = profs.map(p => ({
          ...p,
          pct: p.pct && p.pct > 0
            ? p.pct
            : +((p.n_users || 0) / computedTotal * 100).toFixed(1),
        }))
      }

      setProfiles(profs)
      setDistribution(dist)
      setSegMeta({
        dataset:         pd.dataset          || 'Dataset 2 — churn_labelled_v6.parquet',
        nSegments:       pd.n_clusters       ?? pd.n_segments    ?? profs.length,
        totalRecords:    pd.n_subscribers    ?? computedTotal,
        silhouette:      pd.silhouette_score ?? null,
        method:          pd.method           || 'KMeans',
        qosFeatures:    (pd.qos_features?.length ? pd.qos_features : KNOWN_QOS_FEATURES),
        clusterLabels:   pd.cluster_labels   || {},
        reliableSegments: computedReliable,
      })
      setApiOnline(true)
    } catch (err) {
      console.error('Segments fetch error:', err)
      setApiOnline(false)
      setError('API offline — segmentation data unavailable')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Derived data ──────────────────────────────────────────────────
  const distClusters = useMemo(() => {
    if (!distribution.length) return []
    return Object.keys(distribution[0]).filter(k => k !== 'region')
  }, [distribution])

  const distRegions = useMemo(
    () => distribution.map(d => d.region || ''),
    [distribution]
  )

  const profileCols = useMemo(() => {
    if (!profiles.length) return []
    return Object.keys(profiles[0])
      .filter(k => !NON_METRIC.has(k) && typeof profiles[0][k] === 'number')
      .slice(0, 8)
  }, [profiles])

  const avgCols = useMemo(
    () => profileCols.filter(k => k.startsWith('avg_')).slice(0, 6),
    [profileCols]
  )

  // ── KPI tiles ─────────────────────────────────────────────────────
  const kpiTiles = useMemo(() => [
    {
      label: 'Clusters (k)',
      value: segMeta.nSegments || '—',
      color: HW.blue, icon: Target,
      sub: segMeta.method || 'KMeans clustering',
    },
    {
      label: 'Subscribers Analysed',
      value: (segMeta.totalRecords || 0).toLocaleString(),
      color: HW.blueLight, icon: Users,
      sub: 'Dataset 2 — churn_labelled_v6.parquet',
    },
    {
      label: 'Silhouette Score',
      value: fmtNum(segMeta.silhouette, 4),
      color: ALARM.normal, icon: BarChart3,
      sub: 'Cluster quality · 1 = perfect separation',
    },
    {
      label: 'QoS Features Used',
      value: (segMeta.qosFeatures?.length ? segMeta.qosFeatures : KNOWN_QOS_FEATURES).length,
      color: '#8B5CF6', icon: Zap,
      sub: (segMeta.qosFeatures?.length ? segMeta.qosFeatures : KNOWN_QOS_FEATURES)
        .slice(0, 3).map(f => f.replace(/_/g, ' ')).join(' · ') + ' …',
    },
  ], [segMeta])

  // ── Province distribution chart ───────────────────────────────────
  const distChart = useMemo(() =>
    distribution.length > 0 && distClusters.length > 0 ? {
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
    } : null, [distribution, distClusters, distRegions, base, T])

  // ── QoS bar chart ─────────────────────────────────────────────────
  const qosChart = useMemo(() => {
    if (avgCols.length < 2) return null
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
  }, [profiles, avgCols, base, T])

  // ── Radar chart ───────────────────────────────────────────────────
  const radarChart = useMemo(() => {
    if (avgCols.length < 3) return null
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
  }, [profiles, avgCols, base, T])

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: HW.blue,
          display: 'inline-block', animation: 'noc-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
          textTransform: 'uppercase', color: HW.blue }}>LOADING SEGMENTS</span>
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
      `}</style>

      <div style={{ padding: '36px 44px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── HEADER ─────────────────────────────────────────────────── */}
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
                letterSpacing: '-1.5px', lineHeight: 1, color: T.text, marginBottom: 8 }}>
                USER{' '}
                <span style={{ color: HW.red, fontStyle: 'italic' }}>SEGMENTATION</span>
              </h1>
              <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 300 }}>
                Subscriber clustering · k={segMeta.nSegments || '?'} ·{' '}
                {(segMeta.totalRecords || 0).toLocaleString()} subscribers ·{' '}
                {segMeta.method || 'KMeans'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? 'API Online' : 'API Offline',
                  color: apiOnline ? ALARM.normal : ALARM.critical,
                  bd: sevBd(apiOnline ? ALARM.normal : ALARM.critical),
                  bg: sevDim(apiOnline ? ALARM.normal : ALARM.critical, '0A') },
                { label: 'KMeans Clustering',
                  color: T.textMuted, bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: `k = ${segMeta.nSegments || '?'}`,
                  color: HW.blue, bd: HW.blueBd, bg: HW.blueDim },
                { label: 'Dataset 2',
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

        {error && <AlertBanner severity="minor" icon={AlertTriangle}
          title="ERROR" message={error}/>}

        {/* ── KPI TILES ──────────────────────────────────────────────── */}
        <SectionLabel sub="KMeans clustering quality and dataset coverage">
          OVERVIEW
        </SectionLabel>
        <GapGrid columns="repeat(4,1fr)">
          {kpiTiles.map((kpi, i) => <StatBlock key={i} {...kpi}/>)}
        </GapGrid>

        {/* ── CLUSTER CARDS ──────────────────────────────────────────── */}
        {profiles.length > 0 && (
          <>
            <SectionLabel
              action={<Badge variant="blue">
                {profiles.length} cluster{profiles.length !== 1 ? 's' : ''}
              </Badge>}
              sub={`Method: ${segMeta.method || 'KMeans'} · Silhouette: ${fmtNum(segMeta.silhouette, 4)}`}>
              CLUSTER PROFILES
            </SectionLabel>

            <GapGrid columns={`repeat(${Math.min(profiles.length, 3)},1fr)`}>
              {profiles.map((p, i) => {
                const accent = clusterColor(i)
                return (
                  <div key={i} className="us-card" style={{
                    background: T.bgCard, border: `1px solid ${T.border}`,
                    padding: '26px 22px', position: 'relative',
                    overflow: 'hidden', cursor: 'default' }}>
                    <div className="us-accent" style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
                      background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                      transform: 'scaleX(0)', transformOrigin: 'center',
                      transition: 'transform .4s ease' }}/>

                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: accent,
                          letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
                          Cluster {p.cluster_id}
                        </div>
                        <div style={{ fontFamily: FONT.display, fontSize: 17,
                          fontWeight: 800, color: T.text, letterSpacing: '-.3px',
                          lineHeight: 1.15 }}>
                          {clusterLabel(p)}
                        </div>
                      </div>
                      <Badge variant="blue">{p.pct || 0}%</Badge>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
                      marginBottom: 12 }}>
                      {[
                        { label: 'Subscribers',  value: (p.n_users || 0).toLocaleString() },
                        { label: 'Disengaged',   value: p.disengagement_rate != null
                            ? `${p.disengagement_rate.toFixed(1)}%` : '—' },
                        { label: 'Top Region',   value: p.top_province || '—' },
                        { label: 'Top Generation', value: p.top_generation || '—' },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: T.bgCardHover,
                          padding: '10px 12px', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: '10%',
                            right: '10%', height: 1,
                            background: `linear-gradient(90deg,transparent,${accent}55,transparent)` }}/>
                          <div style={{ fontSize: 9, color: T.textDim,
                            letterSpacing: '1.5px', textTransform: 'uppercase',
                            fontWeight: 700, marginBottom: 3 }}>{label}</div>
                          <div style={{ fontFamily: FONT.display, fontSize: 17,
                            fontWeight: 900, color: accent,
                            letterSpacing: '-1px', lineHeight: 1 }}>{value}</div>
                        </div>
                      ))}
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

        {/* ── CHARTS ─────────────────────────────────────────────────── */}
        <SectionLabel sub="Mean QoS metrics per cluster · Province distribution across clusters">
          CLUSTER ANALYSIS
        </SectionLabel>

        <GapGrid columns="1fr 1fr">
          <ChartPanel title="QoS Profile by Cluster"
            sub="Mean QoS metrics per cluster">
            {qosChart ? (
              <ReactApexChart options={qosChart.options}
                series={qosChart.series} type="bar" height={360}/>
            ) : (
              <EmptyState icon={Activity} title="No QoS profile data"
                desc="Requires avg_* columns in kpi_segments.json"/>
            )}
          </ChartPanel>

          <ChartPanel title="Province Distribution"
            sub="Row-normalised % of subscribers per cluster by province">
            {distChart ? (
              <ReactApexChart options={distChart.options}
                series={distChart.series} type="bar" height={360}/>
            ) : (
              <EmptyState icon={MapPin} title="No province data"
                desc="Requires province_distribution in kpi_segments.json"/>
            )}
          </ChartPanel>
        </GapGrid>

        {/* Radar chart */}
        {radarChart && (
          <>
            <SectionLabel sub="Normalised QoS comparison across clusters">
              QoS RADAR
            </SectionLabel>
            <GapGrid columns="1fr">
              <ChartPanel title="QoS Radar — Normalised Comparison"
                sub="Each axis normalised to cluster max · 1 = highest value">
                <ReactApexChart options={radarChart.options}
                  series={radarChart.series} type="radar" height={400}/>
              </ChartPanel>
            </GapGrid>
          </>
        )}

        {/* ── TABLE ──────────────────────────────────────────────────── */}
        {profiles.length > 0 && (
          <>
            <SectionLabel
              action={<Badge variant="blue">
                {profiles.length} row{profiles.length !== 1 ? 's' : ''}
              </Badge>}
              sub="Cluster statistics · top province and generation · key QoS means">
              CLUSTER DETAIL TABLE
            </SectionLabel>

            <div style={{ border: `1px solid ${T.border}`, overflow: 'hidden',
              position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
                background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: T.mode === 'dark'
                        ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.04)',
                      borderBottom: `1px solid ${T.border}` }}>
                      {[
                        { label: '#' },
                        { label: 'Cluster' },
                        { label: 'N',       Icon: Users        },
                        { label: 'Share',   Icon: ArrowUpDown  },
                        { label: 'Disengaged' },
                        { label: 'Top Province', Icon: MapPin  },
                        { label: 'Top Gen.' },
                        ...avgCols.slice(0, 3).map(c => ({
                          label: c.replace('avg_','').replace(/_/g,' ').substring(0,12),
                        })),
                      ].map(({ label, Icon }, hi) => (
                        <th key={hi} style={{ padding: '11px 14px', textAlign: 'left',
                          fontSize: 10, fontWeight: 800, letterSpacing: '1.5px',
                          textTransform: 'uppercase', color: T.textDim, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {Icon && <Icon size={10} color={T.textDim}/>}{label}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p, i) => (
                      <tr key={i} className="us-table-row" style={{
                        borderBottom: `1px solid ${T.mode === 'dark'
                          ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)'}`,
                        transition: 'all .15s' }}>
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
                              <div style={{ height: '100%', width: `${p.pct || 0}%`,
                                background: clusterColor(i) }}/>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: FONT.display,
                          fontSize: 13, fontWeight: 600,
                          color: (p.disengagement_rate||0) > 40 ? ALARM.critical
                               : (p.disengagement_rate||0) > 30 ? ALARM.major
                               : T.textDim }}>
                          {fmtNum(p.disengagement_rate, 1)}%
                        </td>
                        <td style={{ padding: '10px 14px', color: T.textDim, fontSize: 11 }}>
                          {p.top_province || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: T.textDim, fontSize: 11 }}>
                          {p.top_generation || '—'}
                        </td>
                        {avgCols.slice(0, 3).map(col => (
                          <td key={col} style={{ padding: '10px 14px', color: T.textDim,
                            fontFamily: FONT.display, fontSize: 13, fontWeight: 600 }}>
                            {fmtNum(p[col], 2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}