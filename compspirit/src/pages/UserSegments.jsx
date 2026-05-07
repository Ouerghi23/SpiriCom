// src/pages/UserSegments.jsx
// FIX US-HOOKS: profileCols, kmData, distClusters, distRegions useMemo hooks
//   were called AFTER `if (loading) return <Spinner />` — Rules of Hooks violation.
//   All four moved ABOVE the early return so hook count is always identical.

import { useState, useEffect, useMemo } from 'react'
import ReactApexChart from 'react-apexcharts'
import {
  PageHeader, SectionHeader, KpiCard, Card, ChartCard,
  Badge, Spinner, EmptyState, THEME, baseChartOptions,
} from '../components/UI'
import { analyticsApi } from '../api/client'

const C = THEME
const CLUSTER_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C']

const clusterLabel   = (p) => p?.cluster_label || `Cluster ${p?.cluster_id ?? '?'}`
const clusterVariant = (i) => ['red', 'blue', 'green', 'amber', 'purple', 'cyan'][i % 6]

export default function UserSegments() {
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
        setProfiles(profRes.data?.profiles    || [])
        setScatterData(profRes.data?.scatter  || [])
        setKpiCols(profRes.data?.kpi_columns  || [])
        setDistribution(distRes.data?.distribution || [])
        setClResults({
          optimalK:      profRes.data?.n_clusters         ?? null,
          totalUsers:    (profRes.data?.profiles || []).reduce((a, p) => a + (p.n_users || 0), 0),
          silhouette:    profRes.data?.silhouette_score   ?? null,
          daviesBouldin: profRes.data?.davies_bouldin      ?? null,
          pcaVariance:   profRes.data?.pca_variance_pct   ?? null,
          dbscanClusters:profRes.data?.dbscan_clusters    ?? null,
          dbscanNoise:   profRes.data?.dbscan_noise        ?? null,
        })
        setApiOnline(true)
      } catch (err) {
        console.error('Segments fetch error:', err)
        setApiOnline(false)
        setError('FastAPI offline — showing saved model results')
        setClResults({ optimalK: null, totalUsers: null, silhouette: null,
                       daviesBouldin: null, pcaVariance: null })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // ── FIX US-HOOKS: ALL useMemo hooks declared here, BEFORE any early return ──

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

  // ── Early return AFTER all hooks ────────────────────────────────────
  if (loading) return <div style={{ padding: 24 }}><Spinner size={48} /></div>

  // ── Chart configs ───────────────────────────────────────────────────

  const pcaChart = kmData.length > 0 ? {
    series: [...new Set(kmData.map(d => d.kmeans_cluster))].sort().map(k => ({
      name: clusterLabel(profiles.find(p => p.cluster_id === k) || { cluster_id: k }),
      data: kmData.filter(d => d.kmeans_cluster === k).map(d => [d.pca_x || 0, d.pca_y || 0]),
    })),
    options: {
      ...baseChartOptions,
      chart:   { ...baseChartOptions.chart, type: 'scatter', zoom: { enabled: true } },
      colors:  CLUSTER_COLORS,
      markers: { size: 4, opacity: 0.5 },
      xaxis:   { title: { text: 'PC1', style: { fontSize: '10px', color: C.textMuted } } },
      yaxis:   { title: { text: 'PC2', style: { fontSize: '10px', color: C.textMuted } } },
      legend:  { position: 'bottom' },
    },
  } : null

  const profileChart = profiles.length > 0 && profileCols.length > 0 ? {
    series: profiles.map(p => ({
      name: clusterLabel(p),
      data: profileCols.map(c => p[c] || 0),
    })),
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions.chart, type: 'bar' },
      colors:      CLUSTER_COLORS.slice(0, profiles.length),
      plotOptions: { bar: { columnWidth: '50%', borderRadius: 2 } },
      xaxis:       { categories: profileCols.map(c => c.replace(/_mean/g, '').replace(/_/g, ' ').substring(0, 15)), labels: { rotate: -35, style: { fontSize: '9px', colors: C.textMuted } } },
      dataLabels:  { enabled: false },
      legend:      { position: 'top' },
    },
  } : null

  const distChart = distribution.length > 0 && distClusters.length > 0 ? {
    series: distClusters.map(ck => ({
      name: ck.replace('cluster_', 'Cluster '),
      data: distribution.map(d => d[ck] || 0),
    })),
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions.chart, type: 'bar', stacked: true },
      colors:      CLUSTER_COLORS.slice(0, distClusters.length),
      plotOptions: { bar: { columnWidth: '70%' } },
      xaxis:       { categories: distRegions, labels: { rotate: -45, style: { fontSize: '9px', colors: C.textMuted } } },
      yaxis:       { title: { text: '% of Users', style: { fontSize: '10px', color: C.textMuted } } },
      dataLabels:  { enabled: false },
      legend:      { position: 'top' },
    },
  } : null

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
      chart:   { ...baseChartOptions.chart, type: 'radar' },
      colors:  CLUSTER_COLORS.slice(0, profiles.length),
      markers: { size: 4 },
      xaxis:   { categories: profileCols.map(c => c.replace(/_mean/g, '').replace(/_/g, ' ').substring(0, 12)) },
      yaxis:   { show: false, min: 0, max: 1 },
      legend:  { position: 'bottom' },
    },
  } : null

  const fmt = (v, d = 3) => v != null ? Number(v).toFixed(d) : 'N/A'

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <div style={{ padding: '24px 24px 48px' }}>

        <PageHeader
          title="Customer Experience Segmentation"
          subtitle="K-Means Clustering · DBSCAN · PCA Visualisation · KPI Radar Profiles"
          badges={['Unsupervised ML', `${clResults?.optimalK ?? '?'} Clusters`, `${clResults?.totalUsers?.toLocaleString() ?? '?'} Users`, apiOnline ? 'Live' : 'Saved Results']}
        />

        {error && (
          <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: '#FCD34D' }}>
            {error}
          </div>
        )}

        {/* ── KPI cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Optimal K"        value={clResults?.optimalK      ?? '—'}                                              color={C.red}    icon="🎯" />
          <KpiCard label="Silhouette Score" value={clResults?.silhouette     != null ? fmt(clResults.silhouette)    : '—'}        color={C.green}  icon="📊" />
          <KpiCard label="Davies-Bouldin"   value={clResults?.daviesBouldin  != null ? fmt(clResults.daviesBouldin) : '—'}        color={C.amber}  icon="📉" />
          <KpiCard label="Total Users"      value={clResults?.totalUsers     != null ? clResults.totalUsers.toLocaleString() : '—'} color={C.blue}   icon="👥" />
          <KpiCard label="PCA Variance"     value={clResults?.pcaVariance    != null ? `${clResults.pcaVariance}%` : '—'}        color={C.purple} icon="🔬" />
          <KpiCard label="DBSCAN Clusters"  value={clResults?.dbscanClusters ?? '—'}                                              color={C.cyan}   icon="🔗" />
          <KpiCard label="DBSCAN Noise"     value={clResults?.dbscanNoise    ?? '—'}                                              color={C.orange} icon="🔊" />
          <KpiCard label="K-Means Clusters" value={clResults?.optimalK       ?? '—'}                                              color='#14B8A6'  icon="🧩" />
        </div>

        {/* ── Cluster summaries ── */}
        {profiles.length > 0 && (
          <>
            <SectionHeader>Cluster Summaries</SectionHeader>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(profiles.length, 3)}, 1fr)`, gap: 16, marginBottom: 24 }}>
              {profiles.map((p, i) => (
                <Card key={i} style={{ borderTop: `3px solid ${CLUSTER_COLORS[i % CLUSTER_COLORS.length]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, color: CLUSTER_COLORS[i % CLUSTER_COLORS.length], letterSpacing: 2, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
                        Cluster {p.cluster_id}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{clusterLabel(p)}</div>
                    </div>
                    <Badge variant={clusterVariant(i)}>{p.pct || 0}%</Badge>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[['Users', (p.n_users || 0).toLocaleString()], ['Share', `${p.pct || 0}%`]].map(([label, val]) => (
                      <div key={label} style={{ background: 'rgba(255,255,255,.03)', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* ── PCA + Radar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <SectionHeader>PCA Scatter — K-Means</SectionHeader>
            <ChartCard subtitle={clResults?.pcaVariance ? `${clResults.pcaVariance}% variance explained` : 'PCA 2D projection'}>
              {pcaChart
                ? <ReactApexChart options={pcaChart.options} series={pcaChart.series} type="scatter" height={380} />
                : <EmptyState icon="🔬" title="No PCA scatter data" desc="API offline or kmeans_users.parquet not found" />
              }
            </ChartCard>
          </div>
          <div>
            <SectionHeader>KPI Radar — Cluster Comparison</SectionHeader>
            <ChartCard subtitle="Normalised KPI values per cluster (0–1 scale)">
              {radarChart
                ? <ReactApexChart options={radarChart.options} series={radarChart.series} type="radar" height={380} />
                : <EmptyState icon="🕸️" title="Not enough KPI columns for radar" />
              }
            </ChartCard>
          </div>
        </div>

        {/* ── Profiles bar + distribution ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <SectionHeader>KPI Profiles by Cluster</SectionHeader>
            <ChartCard subtitle="Average KPI values per customer segment">
              {profileChart
                ? <ReactApexChart options={profileChart.options} series={profileChart.series} type="bar" height={380} />
                : <EmptyState icon="📊" title="No profile data" />
              }
            </ChartCard>
          </div>
          <div>
            <SectionHeader>Cluster × Region Distribution</SectionHeader>
            <ChartCard subtitle="% of users per cluster in each region (stacked)">
              {distChart
                ? <ReactApexChart options={distChart.options} series={distChart.series} type="bar" height={380} />
                : <EmptyState icon="🗺️" title="No distribution data" />
              }
            </ChartCard>
          </div>
        </div>

        {/* ── Profiles table ── */}
        {profiles.length > 0 && (
          <>
            <SectionHeader>
              Cluster Profiles Detail
              <span style={{ marginLeft: 12 }}><Badge variant="red">{profiles.length} clusters</Badge></span>
            </SectionHeader>
            <Card style={{ overflow: 'hidden', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,.03)', borderBottom: `1px solid ${C.border}` }}>
                    {['ID', 'Label', 'Users', '%', ...profileCols.slice(0, 6).map(c => c.replace(/_mean/g, '').replace(/_/g, ' ').substring(0, 14))].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: C.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 12px', color: CLUSTER_COLORS[i % CLUSTER_COLORS.length], fontWeight: 700, fontFamily: 'monospace' }}>{p.cluster_id}</td>
                      <td style={{ padding: '10px 12px', color: C.text, fontWeight: 600 }}>{clusterLabel(p)}</td>
                      <td style={{ padding: '10px 12px', color: C.text, fontFamily: 'monospace' }}>{(p.n_users || 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', color: C.textMuted }}>{p.pct || 0}%</td>
                      {profileCols.slice(0, 6).map(col => (
                        <td key={col} style={{ padding: '10px 12px', color: C.textMuted, fontFamily: 'monospace', fontSize: 10 }}>
                          {p[col]?.toFixed(2) || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

      </div>
    </div>
  )
}