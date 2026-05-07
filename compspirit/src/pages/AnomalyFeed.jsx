// src/pages/AnomalyFeed.jsx
// FIX AF1: C.teal replaced with C.cyan everywhere (THEME has no 'teal' key).
// FIX AF2: anomalyPoints now filters on anomaly_flag === 1 ONLY.
//          Previously `|| d.if_severity` was always truthy (even "Low")
//          which made every point a scatter marker.

import { useState, useEffect } from 'react'
import ReactApexChart from 'react-apexcharts'
import {
  PageHeader, SectionHeader, KpiCard, Card, ChartCard,
  Badge, Spinner, EmptyState, THEME, baseChartOptions,
} from '../components/UI'
import { analyticsApi } from '../api/client'

const C = THEME

export default function AnomalyFeed() {
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
        const s = sumRes.data?.summary || {}
        setSummary(s)
        setEvents(s.consensus_events || [])
        const regs = regRes.data?.regions || []
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
        setError('FastAPI offline — start backend on port 8000')
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

  if (loading) return <div style={{ padding: 24 }}><Spinner size={48} /></div>

  // FIX AF2: filter on anomaly_flag === 1 only — if_severity is always truthy
  const anomalyPoints = timeline.filter(d => d.anomaly_flag === 1)

  // ── Timeline chart ────────────────────────────────────────────────
  const timelineChart = timeline.length > 0 ? {
    series: [
      { name: 'Anomaly Score', type: 'area',    data: timeline.map(d => ({ x: d.date, y: d.combined_score || 0 })) },
      { name: 'Anomalies',     type: 'scatter', data: anomalyPoints.map(d => ({ x: d.date, y: d.combined_score || 0 })) },
    ],
    options: {
      ...baseChartOptions,
      chart: { ...baseChartOptions.chart, type: 'line' },
      colors: ['#7C3AED', C.red],
      stroke: { curve: 'smooth', width: [2, 0] },
      markers: { size: [0, 7] },
      fill: { type: ['gradient', 'solid'], gradient: { opacityFrom: 0.3, opacityTo: 0 } },
      xaxis: { type: 'datetime', labels: { format: 'dd MMM', style: { fontSize: '10px', colors: C.textMuted } } },
      yaxis: { title: { text: 'Score', style: { color: C.textMuted, fontSize: '10px' } } },
      annotations: { yaxis: [{ y: 0.7, borderColor: C.amber, borderWidth: 1, strokeDashArray: 5, label: { text: 'Threshold', style: { color: C.textMuted, fontSize: '9px' } } }] },
    },
  } : null

  // ── Top regions bar chart ─────────────────────────────────────────
  const topRegions = summary?.top_regions || []
  const regionsChart = topRegions.length > 0 ? {
    series: [{ name: 'Anomalies', data: topRegions.map(r => r.count) }],
    options: {
      ...baseChartOptions,
      chart: { ...baseChartOptions.chart, type: 'bar' },
      plotOptions: { bar: { horizontal: true, borderRadius: 3, distributed: true } },
      colors: [C.red, '#E5314D', '#EC5468', '#F26C7E', '#F58A99'],
      xaxis: { categories: topRegions.map(r => r.region?.replace(' Gouvernorat', '') || '') },
      dataLabels: { enabled: true, style: { fontSize: '10px', colors: ['#fff'] } },
      legend: { show: false },
    },
  } : null

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <div style={{ padding: '24px 24px 48px' }}>

        <PageHeader
          title="Anomaly Detection Feed"
          subtitle="Isolation Forest + Statistical Control Charts · Real-time network anomaly monitoring"
          badges={['Isolation Forest', 'Z-Score', 'Consensus Alerts', apiOnline ? '🟢 Live' : '🔴 Offline']}
        />

        {error && (
          <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: '#FCD34D' }}>
            {error}
          </div>
        )}

        {/* ── KPI Cards ── */}
        {/* FIX AF1: C.teal → C.cyan throughout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Total Records"          value={(summary?.total     || 0).toLocaleString()}                 color={C.blue}   icon="📊" />
          <KpiCard label="IF Anomalies"           value={summary?.if_count   || 0}                                   color={C.purple} icon="🔍" />
          <KpiCard label="Statistical Anomalies"  value={summary?.stat_count || 0}                                   color={C.amber}  icon="📈" />
          <KpiCard label="Consensus (Both)"       value={summary?.consensus  || 0}                                   color={C.red}    icon="🎯" />
          <KpiCard label="Union Anomalies"        value={summary?.total      || 0}                                   color={C.orange} icon="🔗" />
          <KpiCard label="High Severity"          value={events.filter(e => e.if_severity === 'High').length}        color={C.red}    icon="🚨" />
          <KpiCard label="Anomaly Rate"           value={`${summary?.rate_pct || 0}%`}                               color={C.cyan}   icon="📉" />  {/* FIX AF1 */}
          <KpiCard label="Regions Affected"       value={topRegions.length}                                          color={C.cyan}   icon="🌍" />  {/* FIX AF1 */}
        </div>

        {/* ── Charts Row 1 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <SectionHeader>Anomaly Score Timeline</SectionHeader>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Region</span>
              <select value={selRegion || ''} onChange={e => handleRegionChange(e.target.value)}
                style={{ background: '#0C0C0C', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', outline: 'none' }}>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <Badge variant="purple">{selRegion}</Badge>
              {/* FIX AF2: count is now accurate — only true anomaly_flag===1 points */}
              <Badge variant="red">{anomalyPoints.length} anomalies detected</Badge>
            </div>
            <ChartCard>
              {timelineChart
                ? <ReactApexChart options={timelineChart.options} series={timelineChart.series} type="line" height={320} />
                : <EmptyState icon="📈" title="No timeline data" desc="Select a region with anomaly data" />
              }
            </ChartCard>
          </div>

          <div>
            <SectionHeader>Top Anomaly Regions</SectionHeader>
            <ChartCard subtitle="Regions with most anomaly days">
              {regionsChart
                ? <ReactApexChart options={regionsChart.options} series={regionsChart.series} type="bar" height={320} />
                : <EmptyState icon="🗺️" title="No regional data" />
              }
            </ChartCard>
          </div>
        </div>

        {/* ── Charts Row 2 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* KPI Drivers */}
          <div>
            <SectionHeader>Top Anomaly Drivers</SectionHeader>
            <ChartCard subtitle="KPIs most frequently flagged as root cause">
              {events.length > 0 ? (() => {
                const drivers = {}
                events.forEach(e => { const d = e.top_anomaly_driver || 'Unknown'; drivers[d] = (drivers[d] || 0) + 1 })
                const list = Object.entries(drivers).sort((a, b) => b[1] - a[1]).slice(0, 8)
                return (
                  <ReactApexChart
                    options={{
                      ...baseChartOptions,
                      chart: { ...baseChartOptions.chart, type: 'bar' },
                      plotOptions: { bar: { horizontal: true, borderRadius: 3, distributed: true } },
                      // FIX AF1: C.teal → C.cyan in colors array
                      colors: [C.red, C.amber, C.purple, C.blue, C.cyan, C.orange, C.green, '#F97316'],
                      xaxis: { categories: list.map(d => d[0].replace(/_/g, ' ').replace('mean', '').trim()) },
                      dataLabels: { enabled: true, style: { fontSize: '10px', colors: ['#fff'] } },
                      legend: { show: false },
                    }}
                    series={[{ name: 'Count', data: list.map(d => d[1]) }]}
                    type="bar" height={280}
                  />
                )
              })() : <EmptyState icon="🔍" title="No driver data" />}
            </ChartCard>
          </div>

          {/* Severity Distribution */}
          <div>
            <SectionHeader>Severity Distribution</SectionHeader>
            <ChartCard subtitle="High · Medium · Low classification">
              {(() => {
                const sevCounts = { High: 0, Medium: 0, Low: 0 }
                events.forEach(e => { if (e.if_severity && sevCounts[e.if_severity] !== undefined) sevCounts[e.if_severity]++ })
                return (
                  <ReactApexChart
                    options={{
                      ...baseChartOptions,
                      labels: ['High', 'Medium', 'Low'],
                      colors: [C.red, C.amber, C.green],
                      chart: { ...baseChartOptions.chart, type: 'donut' },
                      stroke: { width: 0 },
                      plotOptions: { pie: { donut: { size: '65%', labels: { show: true, name: { fontSize: '10px', color: C.textMuted }, value: { fontSize: '22px', fontWeight: 700, color: C.text }, total: { show: true, label: 'Total', fontSize: '10px', color: C.textMuted } } } } },
                      legend: { position: 'bottom' },
                    }}
                    series={[sevCounts.High, sevCounts.Medium, sevCounts.Low]}
                    type="donut" height={280}
                  />
                )
              })()}
            </ChartCard>
          </div>
        </div>

        {/* ── Consensus Events Table ── */}
        <SectionHeader>
          Consensus Anomaly Events
          <span style={{ marginLeft: 12 }}><Badge variant="red">{events.length} events</Badge></span>
        </SectionHeader>
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.03)', borderBottom: `1px solid ${C.border}` }}>
                {['Region', 'Date', 'Score', 'Severity', 'Top Driver'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: C.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>No consensus events detected</td></tr>
              ) : (
                [...events].sort((a, b) => (b.combined_score || 0) - (a.combined_score || 0)).slice(0, 14).map((e, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px', color: C.text, fontWeight: 600 }}>{e.region}</td>
                    <td style={{ padding: '10px 14px', color: C.textMuted, fontFamily: 'monospace', fontSize: 10 }}>{e.date}</td>
                    <td style={{ padding: '10px 14px', color: C.red, fontWeight: 700, fontFamily: 'monospace' }}>{(e.combined_score || 0).toFixed(3)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Badge variant={e.if_severity === 'High' ? 'red' : e.if_severity === 'Medium' ? 'amber' : 'green'}>{e.if_severity || 'N/A'}</Badge>
                    </td>
                    <td style={{ padding: '10px 14px', color: C.textMuted, fontSize: 10 }}>
                      {(e.top_anomaly_driver || 'Unknown').replace(/_/g, ' ').replace('mean', '').trim()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        {/* ── Methodology ── */}
        <SectionHeader>Detection Methodology</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { title: 'Isolation Forest', desc: 'Unsupervised tree-based algorithm. Points requiring fewer splits to isolate are flagged as anomalies.', color: C.purple, variant: 'purple', metrics: [`${summary?.if_count || 0} anomalies`] },
            { title: 'Statistical Z-Score', desc: 'Points beyond 3σ from the rolling mean + CUSUM for cumulative shift detection.', color: C.amber, variant: 'amber', metrics: [`${summary?.stat_count || 0} anomalies`] },
            { title: 'Consensus (Both)', desc: 'Flags only when BOTH models agree — highest confidence, lowest false-positive rate.', color: C.red, variant: 'red', metrics: [`${summary?.consensus || 0} consensus`, 'High confidence'] },
          ].map((m, i) => (
            <Card key={i} style={{ borderTop: `2px solid ${m.color}` }}>
              <h4 style={{ color: m.color, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{m.title}</h4>
              <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>{m.desc}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {m.metrics.map((met, j) => <Badge key={j} variant={m.variant}>{met}</Badge>)}
              </div>
            </Card>
          ))}
        </div>

      </div>
    </div>
  )
}