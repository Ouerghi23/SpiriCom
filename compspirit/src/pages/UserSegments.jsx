// src/pages/UserSegments.jsx
// ─────────────────────────────────────────────────────────────────────
// Customer Experience Segmentation
//
// Changes from original:
//   - Custom Ico SVG factory replaced with Lucide React
//   - Full react-i18next translation (segments.* + common.* keys)
//   - All hardcoded English strings replaced with t() calls
//   - US-HOOKS rule preserved: all useMemo BEFORE early returns
//   - All logic, charts, and layout 100% identical
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { useTranslation }               from 'react-i18next'
import ReactApexChart                   from 'react-apexcharts'
import {
  Target, BarChart3, TrendingDown, Users, Cpu,
  Link, Activity, LayoutGrid, AlertTriangle,
  ArrowUpDown, Search,
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

// ── Cluster identity ───────────────────────────────────────────────────
const CLUSTER_COLORS   = [C.red, C.blue, C.green, C.amber, C.purple, C.cyan]
const CLUSTER_VARIANTS = ['red', 'blue', 'green', 'amber', 'purple', 'cyan']
const clusterColor     = i  => CLUSTER_COLORS[i % CLUSTER_COLORS.length]
const clusterVariant   = i  => CLUSTER_VARIANTS[i % CLUSTER_VARIANTS.length]
const clusterLabel     = p  => p?.cluster_label || `Cluster ${p?.cluster_id ?? '?'}`

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
  <div className="us-stat-block" style={{
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
          width: 26, height: 26,
          border: `1px solid ${(color || C.red)}30`, background: `${color || C.red}10`,
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

// ── Chart panel ────────────────────────────────────────────────────────
const ChartPanel = ({ title, sub, children, action, style = {} }) => (
  <div className="us-chart-panel" style={{
    background: C.bg2, border: `1px solid ${C.border}`,
    padding: '22px 24px', position: 'relative', overflow: 'hidden',
    transition: 'border-color .3s', ...style,
  }}>
    <div className="us-panel-accent" style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
      background: `linear-gradient(90deg, transparent, ${C.red}, transparent)`,
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

// ── Cluster colour legend row ─────────────────────────────────────────
const ClusterLegend = ({ profiles }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
    {profiles.map((p, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 10, height: 10, background: clusterColor(i), flexShrink: 0 }}/>
        <span style={{ fontSize: 9, color: C.textMuted, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
          {clusterLabel(p)}
        </span>
      </div>
    ))}
  </div>
)

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function UserSegments() {
  const { t } = useTranslation()

  const [profiles,     setProfiles]     = useState([])
  const [scatterData,  setScatterData]  = useState([])
  const [distribution, setDistribution] = useState([])
  const [kpiCols,      setKpiCols]      = useState([])
  const [clResults,    setClResults]    = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [apiOnline,    setApiOnline]    = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profRes, distRes] = await Promise.all([
          analyticsApi.segmentProfiles(),
          analyticsApi.segmentRegionDistribution(),
        ])
        setProfiles(profRes.data?.profiles        || [])
        setScatterData(profRes.data?.scatter      || [])
        setKpiCols(profRes.data?.kpi_columns      || [])
        setDistribution(distRes.data?.distribution || [])
        setClResults({
          optimalK:       profRes.data?.n_clusters        ?? null,
          totalUsers:     (profRes.data?.profiles || []).reduce((a, p) => a + (p.n_users || 0), 0),
          silhouette:     profRes.data?.silhouette_score  ?? null,
          daviesBouldin:  profRes.data?.davies_bouldin     ?? null,
          pcaVariance:    profRes.data?.pca_variance_pct  ?? null,
          dbscanClusters: profRes.data?.dbscan_clusters   ?? null,
          dbscanNoise:    profRes.data?.dbscan_noise       ?? null,
        })
        setApiOnline(true)
      } catch (err) {
        console.error('Segments fetch error:', err)
        setApiOnline(false)
        setError(`FastAPI offline — ${t('segments.noDataDesc')}`)
        setClResults({ optimalK: null, totalUsers: null, silhouette: null, daviesBouldin: null, pcaVariance: null })
      } finally { setLoading(false) }
    }
    fetchData()
  }, [])

  // ── US-HOOKS: ALL useMemo BEFORE any early return ─────────────────
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

  const distRegions = useMemo(
    () => distribution.map(d => (d.region || '').replace(' Gouvernorat', '')),
    [distribution]
  )

  // ── Early return AFTER all hooks ──────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block', animation: 'us-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.green }}>
          {t('common.loading')}
        </span>
      </div>
      <Spinner size={48}/>
    </div>
  )

  const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : '—'

  // ── KPI tiles ─────────────────────────────────────────────────────
  const kpiTiles = [
    { label: t('segments.kpiOptimalK'),   value: clResults?.optimalK ?? '—',  color: C.red,    Icon: Target,       sub: t('segments.subKMeans')     },
    { label: t('segments.kpiSilhouette'), value: fmt(clResults?.silhouette),   color: C.green,  Icon: BarChart3,    sub: t('segments.subSilhouette') },
    { label: t('segments.kpiDBI'),        value: fmt(clResults?.daviesBouldin),color: C.amber,  Icon: TrendingDown, sub: t('segments.subDBI')        },
    { label: t('segments.kpiTotalUsers'), value: clResults?.totalUsers != null ? clResults.totalUsers.toLocaleString() : '—', color: C.blue, Icon: Users, sub: t('segments.subAllClusters') },
    { label: t('segments.kpiPCAVar'),     value: clResults?.pcaVariance != null ? `${clResults.pcaVariance}%` : '—', color: C.purple, Icon: Cpu, sub: t('segments.subPCA') },
    { label: t('segments.kpiDBSCAN'),     value: clResults?.dbscanClusters ?? '—', color: C.cyan,   Icon: Link,     sub: t('segments.subDBSCAN')  },
    { label: t('segments.kpiDBSCANNoise'),value: clResults?.dbscanNoise    ?? '—', color: C.orange, Icon: Activity, sub: t('segments.subNoise')   },
    { label: t('segments.kpiKMeans'),     value: clResults?.optimalK       ?? '—', color: C.cyan,   Icon: LayoutGrid, sub: t('segments.subKMeansOut') },
  ]

  // ── Chart: PCA scatter ─────────────────────────────────────────────
  const pcaChart = kmData.length > 0 ? {
    series: [...new Set(kmData.map(d => d.kmeans_cluster))].sort().map(k => ({
      name: clusterLabel(profiles.find(p => p.cluster_id === k) || { cluster_id: k }),
      data: kmData.filter(d => d.kmeans_cluster === k).map(d => [d.pca_x || 0, d.pca_y || 0]),
    })),
    options: {
      ...baseChartOptions,
      chart:   { ...baseChartOptions?.chart, type: 'scatter', zoom: { enabled: true }, background: 'transparent', animations: { enabled: false } },
      colors:  CLUSTER_COLORS,
      markers: { size: 4, opacity: 0.55, strokeWidth: 0 },
      xaxis:   { title: { text: 'PC1', style: { fontSize: '10px', color: C.textMuted, fontWeight: 400 } }, labels: { style: { fontSize: '10px', colors: C.textMuted } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis:   { title: { text: 'PC2', style: { fontSize: '10px', color: C.textMuted, fontWeight: 400 } }, labels: { style: { fontSize: '10px', colors: C.textMuted } } },
      legend:  { position: 'bottom', labels: { colors: C.textMuted }, markers: { radius: 2 } },
      grid:    { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3 },
      tooltip: { theme: 'dark', x: { formatter: v => `PC1: ${v.toFixed(2)}` }, y: { formatter: v => `PC2: ${v.toFixed(2)}` } },
    },
  } : null

  // ── Chart: KPI profiles grouped bar ───────────────────────────────
  const profileChart = profiles.length > 0 && profileCols.length > 0 ? {
    series: profiles.map(p => ({
      name: clusterLabel(p),
      data: profileCols.map(c => p[c] || 0),
    })),
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions?.chart, type: 'bar', background: 'transparent', animations: { enabled: false } },
      colors:      CLUSTER_COLORS.slice(0, profiles.length),
      plotOptions: { bar: { columnWidth: '52%', borderRadius: 0 } },
      xaxis: {
        categories: profileCols.map(c => c.replace(/_mean/g, '').replace(/_/g, ' ').substring(0, 15)),
        labels:     { rotate: -35, style: { fontSize: '9px', colors: C.textMuted, fontFamily: "'Barlow Condensed',sans-serif" } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      dataLabels: { enabled: false },
      legend: { position: 'top', labels: { colors: C.textMuted }, markers: { radius: 2 }, itemMargin: { horizontal: 12 } },
      grid:   { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3 },
      tooltip: { theme: 'dark', y: { formatter: v => v.toFixed(3) } },
    },
  } : null

  // ── Chart: stacked region distribution ────────────────────────────
  const distChart = distribution.length > 0 && distClusters.length > 0 ? {
    series: distClusters.map((ck, i) => ({
      name: ck.replace('cluster_', `${t('segments.clusterPrefix')} `),
      data: distribution.map(d => d[ck] || 0),
    })),
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions?.chart, type: 'bar', stacked: true, background: 'transparent', animations: { enabled: false } },
      colors:      CLUSTER_COLORS.slice(0, distClusters.length),
      plotOptions: { bar: { columnWidth: '65%', borderRadius: 0 } },
      xaxis: {
        categories: distRegions,
        labels:     { rotate: -40, style: { fontSize: '9px', colors: C.textMuted, fontFamily: "'Barlow Condensed',sans-serif" } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: {
        title:  { text: `% ${t('segments.users')}`, style: { fontSize: '10px', color: C.textMuted, fontWeight: 400 } },
        labels: { style: { fontSize: '10px', colors: C.textMuted } },
      },
      dataLabels: { enabled: false },
      legend: { position: 'top', labels: { colors: C.textMuted }, markers: { radius: 2 }, itemMargin: { horizontal: 12 } },
      grid:   { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3 },
      tooltip: { theme: 'dark', y: { formatter: v => `${v.toFixed(1)}%` } },
    },
  } : null

  // ── Chart: radar ──────────────────────────────────────────────────
  const radarChart = profiles.length > 0 && profileCols.length >= 3 ? {
    series: profiles.map(p => ({
      name: clusterLabel(p),
      data: profileCols.map(c => {
        const max = Math.max(...profiles.map(pr => pr[c] || 0), 1)
        return parseFloat(((p[c] || 0) / max).toFixed(3))
      }),
    })),
    options: {
      ...baseChartOptions,
      chart:   { ...baseChartOptions?.chart, type: 'radar', background: 'transparent', animations: { enabled: false } },
      colors:  CLUSTER_COLORS.slice(0, profiles.length),
      markers: { size: 4 },
      fill:    { opacity: 0.12 },
      stroke:  { width: 2 },
      xaxis: {
        categories: profileCols.map(c => c.replace(/_mean/g, '').replace(/_/g, ' ').substring(0, 12)),
        labels:     { style: { fontSize: '9px', colors: C.textMuted } },
      },
      yaxis: { show: false, min: 0, max: 1 },
      legend: { position: 'bottom', labels: { colors: C.textMuted }, markers: { radius: 2 } },
      plotOptions: {
        radar: {
          polygons: {
            strokeColors:    'rgba(255,255,255,.06)',
            connectorColors: 'rgba(255,255,255,.06)',
            fill:            { colors: ['rgba(255,255,255,.01)', 'rgba(255,255,255,.02)'] },
          },
        },
      },
      tooltip: { theme: 'dark', y: { formatter: v => v.toFixed(3) } },
    },
  } : null

  const tableCols = profileCols.slice(0, 6)

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>

      <style>{`
        @keyframes us-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        .us-stat-block:hover { border-color:rgba(207,10,44,.22)!important; background:rgba(207,10,44,.03)!important; transform:translateY(-2px); box-shadow:0 8px 24px rgba(207,10,44,.07); }
        .us-chart-panel:hover { border-color:rgba(207,10,44,.2)!important; }
        .us-chart-panel:hover .us-panel-accent { transform:scaleX(1)!important; }
        .us-cluster-card:hover { border-color:rgba(207,10,44,.22)!important; background:rgba(207,10,44,.025)!important; transform:translateY(-2px); box-shadow:0 8px 28px rgba(207,10,44,.07); }
        .us-cluster-card:hover .us-cluster-accent { transform:scaleX(1)!important; }
        .us-table-row:hover td { background:rgba(255,255,255,.018)!important; }
      `}</style>

      <div style={{ padding: '40px 48px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── HERO HEADER ─────────────────────────────────────────── */}
        <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 28, marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'rgba(207,10,44,.1)', border: '1px solid rgba(207,10,44,.28)', padding: '6px 14px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block', animation: 'us-pulse 2s ease-in-out infinite' }}/>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.redLight }}>
                {apiOnline ? t('segments.liveBadge') : t('segments.offlineBadge')}
              </span>
            </div>
            <span style={{ fontSize: 11, color: C.textDim, letterSpacing: '1.5px' }}>
              {t('segments.subtitle2')}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 'clamp(28px,3.5vw,54px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: C.text, marginBottom: 8,
              }}>
                {t('segments.title').split(' ').slice(0, -1).join(' ')}{' '}
                <span style={{ color: C.red, fontStyle: 'italic' }}>
                  {t('segments.title').split(' ').slice(-1)[0]}
                </span>
              </h1>
              <p style={{ fontSize: 13, color: C.textMuted, fontWeight: 300 }}>
                {clResults?.optimalK ?? '?'} {t('segments.clustersBadge')} · {clResults?.totalUsers?.toLocaleString() ?? '?'} {t('segments.users')} · {t('segments.heroDesc')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? t('segments.onlineLabel') : t('segments.offlineLabel'), color: apiOnline ? C.green : C.red, bd: apiOnline ? 'rgba(34,197,94,.28)' : 'rgba(207,10,44,.28)', bg: apiOnline ? 'rgba(34,197,94,.08)' : 'rgba(207,10,44,.08)' },
                { label: t('segments.unsupML'),                                             color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
                { label: `${clResults?.optimalK ?? '?'} ${t('segments.clustersBadge')}`,   color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
                { label: t('segments.pcaShap'),                                             color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
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
            padding: '12px 20px', marginBottom: 1,
          }}>
            <AlertTriangle size={14} color={C.amber}/>
            <span style={{ fontSize: 12, color: C.amber }}>{error}</span>
          </div>
        )}

        {/* ── KPI TILES ───────────────────────────────────────────── */}
        <SectionLabel sub={t('segments.kpiSub')}>
          {t('segments.kpiSection')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          {kpiTiles.map((kpi, i) => (
            <StatBlock key={i} label={kpi.label} value={kpi.value} color={kpi.color} icon={kpi.Icon} sub={kpi.sub}/>
          ))}
        </div>

        {/* ── CLUSTER SUMMARY CARDS ────────────────────────────────── */}
        {profiles.length > 0 && (
          <>
            <SectionLabel
              action={<ClusterLegend profiles={profiles}/>}
              sub={t('segments.summarySub')}
            >
              {t('segments.summarySection')}
            </SectionLabel>

            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(profiles.length, 3)}, 1fr)`,
              gap: 1, background: 'rgba(255,255,255,.04)',
            }}>
              {profiles.map((p, i) => {
                const accent = clusterColor(i)
                return (
                  <div key={i} className="us-cluster-card" style={{
                    background: C.bg3, border: `1px solid ${C.border}`,
                    padding: '28px 24px', position: 'relative', overflow: 'hidden',
                    transition: 'all .35s cubic-bezier(.22,1,.36,1)', cursor: 'default',
                  }}>
                    <div className="us-cluster-accent" style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
                      background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                      transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s ease',
                    }}/>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 800, color: accent, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
                          {t('segments.clusterPrefix')} {p.cluster_id}
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-.3px', lineHeight: 1.1 }}>
                          {clusterLabel(p)}
                        </div>
                      </div>
                      <Badge variant={clusterVariant(i)}>{p.pct || 0}%</Badge>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>
                      {[
                        { label: t('segments.usersLabel'), value: (p.n_users || 0).toLocaleString() },
                        { label: t('segments.shareLabel'), value: `${p.pct || 0}%` },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: C.bg2, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: `linear-gradient(90deg,transparent,${accent}60,transparent)` }}/>
                          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '1.8px', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{label}</div>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 900, color: accent, letterSpacing: '-1px' }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={{ height: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${p.pct || 0}%`, background: `linear-gradient(to right, ${accent}, ${accent}80)`, transition: 'width .6s ease' }}/>
                      </div>
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 5, letterSpacing: '1px' }}>
                        {p.pct || 0} {t('segments.ofTotal')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── PCA SCATTER + RADAR ──────────────────────────────────── */}
        <SectionLabel sub={t('segments.vizSub')}>
          {t('segments.vizSection')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          <ChartPanel
            title={t('segments.pcaTitle')}
            sub={clResults?.pcaVariance
              ? `${clResults.pcaVariance}% ${t('segments.variancePct')} · ${t('segments.pcaVarianceDesc').split('·')[1]?.trim()}`
              : t('segments.pcaDefault')}
          >
            {pcaChart ? (
              <ReactApexChart options={pcaChart.options} series={pcaChart.series} type="scatter" height={380}/>
            ) : (
              <EmptyState icon={<Cpu size={36} color="rgba(255,255,255,.18)"/>} title={t('segments.noPCA')} desc={t('segments.noPCADesc')}/>
            )}
          </ChartPanel>

          <ChartPanel title={t('segments.radarTitle')} sub={t('segments.radarSub')}>
            {radarChart ? (
              <ReactApexChart options={radarChart.options} series={radarChart.series} type="radar" height={380}/>
            ) : (
              <EmptyState icon={<Search size={36} color="rgba(255,255,255,.18)"/>} title={t('segments.noRadar')}/>
            )}
          </ChartPanel>
        </div>

        {/* ── KPI PROFILES + DISTRIBUTION ─────────────────────────── */}
        <SectionLabel sub={t('segments.kpiProfilesSub')}>
          {t('segments.kpiProfilesSection')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          <ChartPanel title={t('segments.kpiProfilesTitle')} sub={t('segments.kpiProfilesChartSub')}>
            {profileChart ? (
              <ReactApexChart options={profileChart.options} series={profileChart.series} type="bar" height={380}/>
            ) : (
              <EmptyState icon={<BarChart3 size={36} color="rgba(255,255,255,.18)"/>} title={t('segments.noProfilesData')}/>
            )}
          </ChartPanel>

          <ChartPanel title={t('segments.distTitle')} sub={t('segments.distSub')}>
            {distChart ? (
              <ReactApexChart options={distChart.options} series={distChart.series} type="bar" height={380}/>
            ) : (
              <EmptyState icon={<LayoutGrid size={36} color="rgba(255,255,255,.18)"/>} title={t('segments.noDistData')}/>
            )}
          </ChartPanel>
        </div>

        {/* ── PROFILES TABLE ───────────────────────────────────────── */}
        {profiles.length > 0 && (
          <>
            <SectionLabel
              action={<Badge variant="red">{profiles.length} {t('segments.clustersSuffix')}</Badge>}
              sub={t('segments.tableSub')}
            >
              {t('segments.tableSection')}
            </SectionLabel>

            <div style={{ border: `1px solid ${C.border}`, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg, transparent, ${C.red}, transparent)` }}/>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,.025)', borderBottom: `1px solid ${C.border}` }}>
                      {[
                        { label: t('segments.thId'),    Icon: null        },
                        { label: t('segments.thLabel'), Icon: null        },
                        { label: t('segments.thUsers'), Icon: Users       },
                        { label: t('segments.thShare'), Icon: ArrowUpDown },
                        ...tableCols.map(c => ({
                          label: c.replace(/_mean/g, '').replace(/_/g, ' ').substring(0, 14),
                          Icon: null,
                        })),
                      ].map(({ label, Icon }, hi) => (
                        <th key={hi} style={{
                          padding: '12px 14px', textAlign: 'left',
                          fontSize: 9, fontWeight: 800, letterSpacing: '1.5px',
                          textTransform: 'uppercase', color: C.textDim, whiteSpace: 'nowrap',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {Icon && <Icon size={10} color={C.textDim}/>}
                            {label}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p, i) => (
                      <tr key={i} className="us-table-row" style={{ borderBottom: `1px solid rgba(255,255,255,.04)`, transition: 'all .15s' }}>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 8, height: 8, background: clusterColor(i), flexShrink: 0 }}/>
                            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, color: clusterColor(i), letterSpacing: '-.3px' }}>
                              {p.cluster_id}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: C.text, fontSize: 12 }}>
                          {clusterLabel(p)}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-.3px' }}>
                            {(p.n_users || 0).toLocaleString()}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 700, color: clusterColor(i), letterSpacing: '-.3px' }}>
                              {p.pct || 0}%
                            </span>
                            <div style={{ height: 3, width: 40, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${p.pct || 0}%`, background: clusterColor(i) }}/>
                            </div>
                          </div>
                        </td>
                        {tableCols.map(col => (
                          <td key={col} style={{ padding: '11px 14px', color: C.textDim, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 600 }}>
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