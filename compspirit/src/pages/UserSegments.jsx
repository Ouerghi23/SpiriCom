// src/pages/UserSegments.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC Dashboard — User Segmentation Page (v2, UI.jsx aligned)
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation }   from 'react-i18next'
import ReactApexChart        from 'react-apexcharts'
import {
  Target, BarChart3, TrendingDown, Users, Cpu,
  Link, Activity, LayoutGrid, AlertTriangle,
  ArrowUpDown, Search,
} from 'lucide-react'
import {
  HW, ALARM, FONT, gapColor, gridLine,
  SectionLabel, StatBlock, ChartPanel, GapGrid,
  AlertBanner, Badge, Spinner, EmptyState, baseChartOptions,
  sevDim, sevBd,
} from '../components/UI'
import { useTheme }     from '../context/ThemeContext'
import { analyticsApi } from '../api/client'

// ── US-2: categorical cluster identity — no alarm-ladder collisions ──
const CLUSTER_COLORS   = [HW.blue, '#8B5CF6', '#14B8A6', '#F97316', '#EC4899', '#84CC16']
const CLUSTER_VARIANTS = ['blue', 'purple', 'cyan', 'gray', 'blue', 'purple']
const clusterColor   = i => CLUSTER_COLORS[i % CLUSTER_COLORS.length]
const clusterVariant = i => CLUSTER_VARIANTS[i % CLUSTER_VARIANTS.length]
const clusterLabel   = p => p?.cluster_label || `Cluster ${p?.cluster_id ?? '?'}`

// ── Cluster legend (page-local, themed via hook) ──────────────────────
const ClusterLegend = ({ profiles }) => {
  const { theme: T } = useTheme()
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {profiles.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, background: clusterColor(i),
            flexShrink: 0 }}/>
          <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700,
            letterSpacing: '.5px', textTransform: 'uppercase' }}>
            {clusterLabel(p)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function UserSegments() {
  const { t }        = useTranslation()
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)
  const base         = useMemo(() => baseChartOptions(T), [T])

  // Dataset tab: 'd1' = complaints, 'd2' = subscribers
  const [activeTab, setActiveTab] = useState('d1')

  const [profiles,     setProfiles]     = useState([])
  const [scatterData,  setScatterData]  = useState([])
  const [distribution, setDistribution] = useState([])
  const [kpiCols,      setKpiCols]      = useState([])
  const [clResults,    setClResults]    = useState(null)
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
      const dd = distRes.data || distRes

      setProfiles(pd.profiles         || [])
      setScatterData(pd.scatter       || [])
      setKpiCols(pd.kpi_columns       || [])
      setDistribution(dd.distribution || [])
      setSegMeta({
        segmentColumn:   pd.segment_column   || '',
        clusterLabels:   dd.cluster_labels   || {},
        dataset:         pd.dataset          || '',
        totalComplaints: pd.total_complaints || null,
      })
      setClResults({
        optimalK:       pd.n_clusters       ?? null,
        totalUsers:     (pd.profiles || []).reduce((a, p) => a + (p.n_users || 0), 0),
        silhouette:     pd.silhouette_score ?? null,
        daviesBouldin:  pd.davies_bouldin   ?? null,
        pcaVariance:    pd.pca_variance_pct ?? null,
        dbscanClusters: pd.dbscan_clusters  ?? null,
        dbscanNoise:    pd.dbscan_noise     ?? null,
      })
      setApiOnline(true)
    } catch (err) {
      console.error('Segments fetch error:', err)
      setApiOnline(false)
      setError(`FastAPI offline — ${t('segments.noDataDesc')}`)
      setClResults({ optimalK: null, totalUsers: null, silhouette: null,
                     daviesBouldin: null, pcaVariance: null })
    } finally { setLoading(false) }
  }, [t])

  useEffect(() => { loadData(activeTab) }, [loadData, activeTab])

  // ── All hooks BEFORE early return ────────────────────────────────
  const profileCols = useMemo(() => {
    if (kpiCols.length > 0) return kpiCols
    if (profiles.length > 0)
      return Object.keys(profiles[0])
        .filter(k => !['cluster_id', 'cluster_label', 'n_users', 'pct'].includes(k))
        .slice(0, 8)
    return []
  }, [kpiCols, profiles])

  const kmData = useMemo(
    () => scatterData.filter(d => d.kmeans_cluster != null),
    [scatterData]
  )

  const distClusters = useMemo(() => {
    if (!distribution.length) return []
    return Object.keys(distribution[0]).filter(k => k.startsWith('cluster_'))
  }, [distribution])

  // US-5: strip both EN and FR suffixes
  const distRegions = useMemo(
    () => distribution.map(d => (d.region || '')
      .replace(' Governorate', '').replace(' Gouvernorat', '')),
    [distribution]
  )

  const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : '—'

  // US-4: KPI accents — categorical, plus severity only where it means it
  const kpiTiles = useMemo(() => {
    const isD1 = activeTab === 'd1'
    return [
      { label: isD1 ? 'Complaint Types' : t('segments.kpiOptimalK'),
        value: clResults?.optimalK ?? '—', color: HW.blue, icon: Target,
        sub: isD1 ? `Segments from ${segMeta.segmentColumn || 'sub_category'}`
                  : t('segments.subKMeans') },
      { label: isD1 ? 'Total Complaints' : t('segments.kpiTotalUsers'),
        value: isD1
          ? (segMeta.totalComplaints?.toLocaleString()
             ?? clResults?.totalUsers?.toLocaleString() ?? '—')
          : clResults?.totalUsers != null
            ? clResults.totalUsers.toLocaleString() : '—',
        color: HW.blueLight, icon: Users,
        sub: isD1 ? 'Dataset 1 records' : t('segments.subAllClusters') },
      { label: isD1 ? 'Unresolved Variance' : t('segments.kpiSilhouette'),
        value: fmt(clResults?.silhouette), color: ALARM.normal, icon: BarChart3,
        sub: isD1 ? 'Std dev of unresolved rate across segments'
                  : t('segments.subSilhouette') },
      { label: isD1 ? 'Provinces Covered' : t('segments.kpiDBI'),
        value: isD1 ? (distribution.length || '—') : fmt(clResults?.daviesBouldin),
        color: '#F97316', icon: TrendingDown,
        sub: isD1 ? 'Governorates in distribution' : t('segments.subDBI') },
      { label: t('segments.kpiPCAVar'),
        value: clResults?.pcaVariance != null ? `${clResults.pcaVariance}%` : '—',
        color: '#8B5CF6', icon: Cpu, sub: t('segments.subPCA') },
      { label: t('segments.kpiDBSCAN'),
        value: clResults?.dbscanClusters ?? '—',
        color: '#14B8A6', icon: Link, sub: t('segments.subDBSCAN') },
      { label: t('segments.kpiDBSCANNoise'),
        value: clResults?.dbscanNoise ?? '—',
        color: ALARM.unknown, icon: Activity, sub: t('segments.subNoise') },
      { label: t('segments.kpiKMeans'),
        value: clResults?.optimalK ?? '—',
        color: HW.blue, icon: LayoutGrid, sub: t('segments.subKMeansOut') },
    ]
  }, [clResults, segMeta, distribution, activeTab, t])

  const pcaChart = useMemo(() => kmData.length > 0 ? {
    series: [...new Set(kmData.map(d => d.kmeans_cluster))].sort().map(k => ({
      name: clusterLabel(profiles.find(p => p.cluster_id === k) || { cluster_id: k }),
      data: kmData.filter(d => d.kmeans_cluster === k)
        .map(d => [d.pca_x || 0, d.pca_y || 0]),
    })),
    options: {
      ...base,
      chart:   { ...base.chart, type: 'scatter', zoom: { enabled: true } },
      colors:  CLUSTER_COLORS,
      markers: { size: 4, opacity: 0.55, strokeWidth: 0 },
      xaxis: { title: { text: 'PC1', style: { fontSize: '10px',
          color: T.textMuted, fontWeight: 400 } },
        labels: { style: { fontSize: '10px', colors: T.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { title: { text: 'PC2', style: { fontSize: '10px',
          color: T.textMuted, fontWeight: 400 } },
        labels: { style: { fontSize: '10px', colors: T.textMuted } } },
      legend:  { position: 'bottom', labels: { colors: T.textMuted },
        markers: { radius: 2 } },
      grid:    { borderColor: gridLine(T), strokeDashArray: 3 },
      tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
        x: { formatter: v => `PC1: ${v.toFixed(2)}` },
        y: { formatter: v => `PC2: ${v.toFixed(2)}` } },
    },
  } : null, [kmData, profiles, base, T])

  const profileChart = useMemo(() =>
    profiles.length > 0 && profileCols.length > 0 ? {
      series: profiles.map(p => ({
        name: clusterLabel(p),
        data: profileCols.map(c => p[c] || 0),
      })),
      options: {
        ...base,
        chart:       { ...base.chart, type: 'bar' },
        colors:      CLUSTER_COLORS.slice(0, profiles.length),
        plotOptions: { bar: { columnWidth: '52%', borderRadius: 0 } },
        xaxis: {
          categories: profileCols.map(c =>
            c.replace(/_mean/g, '').replace(/_/g, ' ').substring(0, 15)),
          labels: { rotate: -35, style: { fontSize: '10px',
            colors: T.textMuted, fontFamily: FONT.display } },
          axisBorder: { show: false }, axisTicks: { show: false },
        },
        dataLabels: { enabled: false },
        legend: { position: 'top', labels: { colors: T.textMuted },
          markers: { radius: 2 }, itemMargin: { horizontal: 12 } },
        grid: { borderColor: gridLine(T), strokeDashArray: 3 },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => v.toFixed(3) } },
      },
    } : null, [profiles, profileCols, base, T])

  const distChart = useMemo(() =>
    distribution.length > 0 && distClusters.length > 0 ? {
      series: distClusters.map(ck => ({
        name: ck.replace('cluster_', `${t('segments.clusterPrefix')} `),
        data: distribution.map(d => d[ck] || 0),
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
          title: { text: `% ${t('segments.users')}`, style: { fontSize: '10px',
            color: T.textMuted, fontWeight: 400 } },
          labels: { style: { fontSize: '10px', colors: T.textMuted } },
        },
        dataLabels: { enabled: false },
        legend: { position: 'top', labels: { colors: T.textMuted },
          markers: { radius: 2 }, itemMargin: { horizontal: 12 } },
        grid: { borderColor: gridLine(T), strokeDashArray: 3 },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `${v.toFixed(1)}%` } },
      },
    } : null, [distribution, distClusters, distRegions, base, t, T])

  const radarChart = useMemo(() =>
    profiles.length > 0 && profileCols.length >= 3 ? {
      series: profiles.map(p => ({
        name: clusterLabel(p),
        data: profileCols.map(c => {
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
          categories: profileCols.map(c =>
            c.replace(/_mean/g, '').replace(/_/g, ' ').substring(0, 12)),
          labels: { style: { fontSize: '10px', colors: T.textMuted } },
        },
        yaxis: { show: false, min: 0, max: 1 },
        legend: { position: 'bottom', labels: { colors: T.textMuted },
          markers: { radius: 2 } },
        plotOptions: {
          radar: {
            polygons: {
              strokeColors: T.mode === 'dark'
                ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)',
              connectorColors: T.mode === 'dark'
                ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)',
              fill: { colors: T.mode === 'dark'
                ? ['rgba(255,255,255,.01)', 'rgba(255,255,255,.02)']
                : ['rgba(0,0,0,.01)', 'rgba(0,0,0,.02)'] },
            },
          },
        },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => v.toFixed(3) } },
      },
    } : null, [profiles, profileCols, base, T])

  const tableCols = useMemo(() => profileCols.slice(0, 6), [profileCols])

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: HW.blue,
          display: 'inline-block', animation: 'noc-pulse 1.8s infinite' }}/>
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
        .us-cluster-card { transition: all .35s cubic-bezier(.22,1,.36,1); }
        .us-cluster-card:hover {
          border-color: ${HW.blueBd} !important;
          background:   ${HW.blueDim} !important;
          transform:    translateY(-2px);
        }
        .us-cluster-card:hover .us-cluster-accent { transform: scaleX(1) !important; }
        .us-table-row:hover td { background: ${T.bgCardHover} !important; }
        .us-tab { transition: all .2s; }
        .us-tab:hover { background: ${T.bgCardHover} !important; }
      `}</style>

      <div style={{ padding: '36px 44px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ══ HERO HEADER ════════════════════════════════════════════ */}
        <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 24,
          marginBottom: 24 }}>
          {/* US-3: live/offline status pattern */}
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
                {apiOnline ? t('segments.liveBadge') : t('segments.offlineBadge')}
              </span>
            </div>
            <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '1.5px' }}>
              {t('segments.subtitle2')}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              {/* The ONE brand-red element on this page */}
              <h1 style={{ fontFamily: FONT.display,
                fontSize: 'clamp(26px,3.5vw,52px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: T.text,
                marginBottom: 8 }}>
                {t('segments.title').split(' ').slice(0, -1).join(' ')}{' '}
                <span style={{ color: HW.red, fontStyle: 'italic' }}>
                  {t('segments.title').split(' ').slice(-1)[0]}
                </span>
              </h1>
              <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 300 }}>
                {clResults?.optimalK ?? '?'} {t('segments.clustersBadge')} ·{' '}
                {clResults?.totalUsers?.toLocaleString() ?? '?'} {t('segments.users')} ·{' '}
                {t('segments.heroDesc')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? t('segments.onlineLabel')
                                   : t('segments.offlineLabel'),
                  color: apiOnline ? ALARM.normal : ALARM.critical,
                  bd: sevBd(apiOnline ? ALARM.normal : ALARM.critical),
                  bg: sevDim(apiOnline ? ALARM.normal : ALARM.critical, '0A') },
                { label: t('segments.unsupML'), color: T.textMuted, bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: `${clResults?.optimalK ?? '?'} ${t('segments.clustersBadge')}`,
                  color: T.textMuted, bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: t('segments.pcaShap'), color: T.textMuted, bd: T.border,
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

        {/* Error banner — US-7 */}
        {error && (
          <AlertBanner severity="minor" icon={AlertTriangle}
            title={t('common.error') || 'ERROR'} message={error}/>
        )}

        {/* ── DATASET TAB SWITCHER — US-3: selection = blue ─────────── */}
        <div style={{ display: 'flex', gap: 1, background: GAP,
          marginBottom: 24, marginTop: 8 }}>
          {[
            { key: 'd1', label: 'Dataset 1 — Complaint Segments',
              sub: `${segMeta.segmentColumn || 'sub_category'} segments${
                activeTab === 'd1' && segMeta.totalComplaints
                  ? ` · ${segMeta.totalComplaints.toLocaleString()} complaints` : ''
              } · province distribution` },
            { key: 'd2', label: 'Dataset 2 — Subscriber Clustering',
              sub: 'KMeans · PCA · DBSCAN · KPI features' },
          ].map(tab => {
            const active = activeTab === tab.key
            return (
              <button key={tab.key} className="us-tab"
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={active}
                style={{
                  flex: 1, padding: '16px 20px', cursor: 'pointer',
                  background: active ? HW.blueDim : T.bgCard,
                  border: 'none',
                  borderTop:    `2px solid ${active ? HW.blue : 'transparent'}`,
                  borderBottom: `1px solid ${T.border}`,
                  textAlign: 'left', fontFamily: 'inherit',
                }}>
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
        <SectionLabel sub={t('segments.kpiSub')}>{t('segments.kpiSection')}</SectionLabel>
        <GapGrid columns="repeat(4,1fr)">
          {kpiTiles.map((kpi, i) => <StatBlock key={i} {...kpi}/>)}
        </GapGrid>

        {/* ══ CLUSTER SUMMARY CARDS ════════════════════════════════════ */}
        {profiles.length > 0 && (
          <>
            <SectionLabel
              action={<ClusterLegend profiles={profiles}/>}
              sub={t('segments.summarySub')}>
              {t('segments.summarySection')}
            </SectionLabel>

            <GapGrid columns={`repeat(${Math.min(profiles.length, 3)},1fr)`}>
              {profiles.map((p, i) => {
                const accent = clusterColor(i)
                return (
                  <div key={i} className="us-cluster-card" style={{
                    background: T.bgCard, border: `1px solid ${T.border}`,
                    padding: '26px 22px', position: 'relative',
                    overflow: 'hidden', cursor: 'default' }}>
                    <div className="us-cluster-accent" style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
                      background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                      transform: 'scaleX(0)', transformOrigin: 'center',
                      transition: 'transform .4s ease' }}/>

                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: 18 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: accent,
                          letterSpacing: '2px', textTransform: 'uppercase',
                          marginBottom: 5 }}>
                          {t('segments.clusterPrefix')} {p.cluster_id}
                        </div>
                        <div style={{ fontFamily: FONT.display, fontSize: 19,
                          fontWeight: 800, color: T.text, letterSpacing: '-.3px',
                          lineHeight: 1.1 }}>
                          {clusterLabel(p)}
                        </div>
                      </div>
                      <Badge variant={clusterVariant(i)}>{p.pct || 0}%</Badge>
                    </div>

                    <GapGrid columns="1fr 1fr">
                      {[
                        { label: t('segments.usersLabel'),
                          value: (p.n_users || 0).toLocaleString() },
                        { label: t('segments.shareLabel'),
                          value: `${p.pct || 0}%` },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: T.bgCardHover,
                          padding: '12px 14px', position: 'relative',
                          overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: '10%',
                            right: '10%', height: 1,
                            background: `linear-gradient(90deg, transparent, ${accent}60, transparent)` }}/>
                          <div style={{ fontSize: 10, color: T.textDim,
                            letterSpacing: '1.8px', textTransform: 'uppercase',
                            fontWeight: 700, marginBottom: 5 }}>{label}</div>
                          <div style={{ fontFamily: FONT.display, fontSize: 22,
                            fontWeight: 900, color: accent,
                            letterSpacing: '-1px' }}>{value}</div>
                        </div>
                      ))}
                    </GapGrid>

                    <div style={{ marginTop: 12 }}>
                      <div style={{ height: 3, background: T.border,
                        overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${p.pct || 0}%`,
                          background: `linear-gradient(to right, ${accent}, ${accent}80)`,
                          transition: 'width .6s ease' }}/>
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 4,
                        letterSpacing: '1px' }}>
                        {p.pct || 0} {t('segments.ofTotal')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </GapGrid>
          </>
        )}

        {/* ══ PCA SCATTER + RADAR ══════════════════════════════════════ */}
        <SectionLabel sub={t('segments.vizSub')}>{t('segments.vizSection')}</SectionLabel>

        <GapGrid columns="1fr 1fr">
          <ChartPanel title={t('segments.pcaTitle')}
            sub={clResults?.pcaVariance
              ? `${clResults.pcaVariance}% ${t('segments.variancePct')}`
              : t('segments.pcaDefault')}>
            {pcaChart ? (
              <ReactApexChart options={pcaChart.options} series={pcaChart.series}
                type="scatter" height={380}/>
            ) : (
              <EmptyState icon={Cpu}
                title={t('segments.noPCA')} desc={t('segments.noPCADesc')}/>
            )}
          </ChartPanel>

          <ChartPanel title={t('segments.radarTitle')} sub={t('segments.radarSub')}>
            {radarChart ? (
              <ReactApexChart options={radarChart.options} series={radarChart.series}
                type="radar" height={380}/>
            ) : (
              <EmptyState icon={Search} title={t('segments.noRadar')}/>
            )}
          </ChartPanel>
        </GapGrid>

        {/* ══ KPI PROFILES + DISTRIBUTION ══════════════════════════════ */}
        <SectionLabel sub={t('segments.kpiProfilesSub')}>
          {t('segments.kpiProfilesSection')}
        </SectionLabel>

        <GapGrid columns="1fr 1fr">
          <ChartPanel title={t('segments.kpiProfilesTitle')}
            sub={t('segments.kpiProfilesChartSub')}>
            {profileChart ? (
              <ReactApexChart options={profileChart.options}
                series={profileChart.series} type="bar" height={380}/>
            ) : (
              <EmptyState icon={BarChart3} title={t('segments.noProfilesData')}/>
            )}
          </ChartPanel>

          <ChartPanel title={t('segments.distTitle')} sub={t('segments.distSub')}>
            {distChart ? (
              <ReactApexChart options={distChart.options} series={distChart.series}
                type="bar" height={380}/>
            ) : (
              <EmptyState icon={LayoutGrid} title={t('segments.noDistData')}/>
            )}
          </ChartPanel>
        </GapGrid>

        {/* ══ PROFILES TABLE ═══════════════════════════════════════════ */}
        {profiles.length > 0 && (
          <>
            <SectionLabel
              action={<Badge variant="blue">
                {profiles.length} {t('segments.clustersSuffix')}
              </Badge>}
              sub={t('segments.tableSub')}>
              {t('segments.tableSection')}
            </SectionLabel>

            <div style={{ border: `1px solid ${T.border}`, overflow: 'hidden',
              position: 'relative' }}>
              {/* US-3: table accent — chrome, not alarm */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0,
                height: 1.5,
                background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse',
                  fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: T.mode === 'dark'
                        ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.04)',
                      borderBottom: `1px solid ${T.border}` }}>
                      {[
                        { label: t('segments.thId'),    Icon: null        },
                        { label: t('segments.thLabel'), Icon: null        },
                        { label: t('segments.thUsers'), Icon: Users       },
                        { label: t('segments.thShare'), Icon: ArrowUpDown },
                        ...tableCols.map(c => ({
                          label: c.replace(/_mean/g, '').replace(/_/g, ' ')
                            .substring(0, 14),
                          Icon: null })),
                      ].map(({ label, Icon }, hi) => (
                        <th key={hi} style={{ padding: '11px 14px',
                          textAlign: 'left', fontSize: 10, fontWeight: 800,
                          letterSpacing: '1.5px', textTransform: 'uppercase',
                          color: T.textDim, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center',
                            gap: 5 }}>
                            {Icon && <Icon size={10} color={T.textDim}/>}
                            {label}
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
                          <div style={{ display: 'flex', alignItems: 'center',
                            gap: 8 }}>
                            <div style={{ width: 8, height: 8,
                              background: clusterColor(i), flexShrink: 0 }}/>
                            <span style={{ fontFamily: FONT.display, fontSize: 16,
                              fontWeight: 800, color: clusterColor(i),
                              letterSpacing: '-.3px' }}>
                              {p.cluster_id}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700,
                          color: T.text, fontSize: 12 }}>{clusterLabel(p)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontFamily: FONT.display, fontSize: 15,
                            fontWeight: 700, color: T.text,
                            letterSpacing: '-.3px' }}>
                            {(p.n_users || 0).toLocaleString()}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center',
                            gap: 8 }}>
                            <span style={{ fontFamily: FONT.display, fontSize: 15,
                              fontWeight: 700, color: clusterColor(i),
                              letterSpacing: '-.3px' }}>
                              {p.pct || 0}%
                            </span>
                            <div style={{ height: 3, width: 40,
                              background: T.border, overflow: 'hidden' }}>
                              <div style={{ height: '100%',
                                width: `${p.pct || 0}%`,
                                background: clusterColor(i) }}/>
                            </div>
                          </div>
                        </td>
                        {tableCols.map(col => (
                          <td key={col} style={{ padding: '10px 14px',
                            color: T.textDim, fontFamily: FONT.display,
                            fontSize: 14, fontWeight: 600 }}>
                            {p[col]?.toFixed(2) || '—'}
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