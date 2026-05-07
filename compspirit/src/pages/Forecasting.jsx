// src/pages/Forecasting.jsx
// FIX FC1: pivotScores() handles both long-format and wide-format API responses.
// FIX FC2: initial useEffect fetches history once; handleRegionChange only from UI.
// FIX FC3: when scores are empty (prediction_scores.parquet not yet generated),
//          fall back to selecting the first available region from the forecasts
//          endpoint so the forecast chart and history still render.

import { useState, useEffect, useMemo, useCallback } from 'react'
import ReactApexChart from 'react-apexcharts'
import {
  PageHeader, SectionHeader, KpiCard, Card, ChartCard,
  Badge, Spinner, EmptyState, THEME, baseChartOptions,
} from '../components/UI'
import { analyticsApi } from '../api/client'

const C = THEME
const MODEL_COLORS = { arima: '#3498DB', prophet: '#2ECC71', xgboost: '#E74C3C' }

// ── Pivot long → wide ─────────────────────────────────────────────────
// API may return long format: [{region, model, mae, rmse, mape, is_best}]
// or wide format: [{region, arima_mae, prophet_mae, xgboost_mae, winner}]
function pivotScores(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  // Already wide
  if ('arima_mae' in rows[0] || 'xgboost_mae' in rows[0]) return rows

  const byRegion = {}
  for (const row of rows) {
    const r = row.region || 'Unknown'
    if (!byRegion[r]) byRegion[r] = { region: r }
    const m = row.model || ''
    if (m) {
      byRegion[r][`${m}_mae`]  = row.mae  ?? null
      byRegion[r][`${m}_rmse`] = row.rmse ?? null
      byRegion[r][`${m}_mape`] = row.mape ?? null
      if (row.is_best) byRegion[r].winner = m
    }
  }

  return Object.values(byRegion).map(row => {
    if (!row.winner) {
      const candidates = ['arima', 'prophet', 'xgboost'].filter(m => row[`${m}_mae`] != null)
      if (candidates.length > 0)
        row.winner = candidates.reduce((a, b) => row[`${a}_mae`] <= row[`${b}_mae`] ? a : b)
    }
    return row
  })
}

export default function Forecasting() {
  const [scores,     setScores]     = useState([])
  const [forecasts,  setForecasts]  = useState([])
  const [regions,    setRegions]    = useState([])
  const [history,    setHistory]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [apiOnline,  setApiOnline]  = useState(true)
  const [selRegion,  setSelRegion]  = useState(null)
  const [bestRegion, setBestRegion] = useState(null)

  const loadHistory = useCallback(async (region) => {
    try {
      const res = await analyticsApi.forecastHistory(region)
      setHistory(res.data?.history || [])
    } catch {
      setHistory([])
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [scoresRes, fcRes] = await Promise.all([
          analyticsApi.forecastScores(),
          analyticsApi.forecasts(),
        ])

        const sc   = pivotScores(scoresRes.data?.scores || [])
        const fc   = fcRes.data?.forecasts || []
        const regs = fcRes.data?.regions   || []

        setScores(sc)
        setForecasts(fc)
        setRegions(regs)

        // Best region by XGBoost MAE
        const valid = sc.filter(s => s.xgboost_mae != null && !isNaN(s.xgboost_mae))
        if (valid.length > 0) {
          const best = valid.reduce((a, b) => a.xgboost_mae < b.xgboost_mae ? a : b)
          setBestRegion(best.region)
          setSelRegion(best.region)
          const histRes = await analyticsApi.forecastHistory(best.region)
          setHistory(histRes.data?.history || [])
        } else if (regs.length > 0) {
          // FIX FC3: scores empty (prediction_scores.parquet not yet generated)
          // but forecasts.parquet exists — still show the chart for the first region
          setSelRegion(regs[0])
          const histRes = await analyticsApi.forecastHistory(regs[0])
          setHistory(histRes.data?.history || [])
        }

        setApiOnline(true)
      } catch (err) {
        console.error('Forecast fetch error:', err)
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
    await loadHistory(region)
  }

  // ── Computed ──────────────────────────────────────────────────────
  const winnerCounts = useMemo(() => {
    const counts = { arima: 0, prophet: 0, xgboost: 0 }
    scores.forEach(s => { if (s.winner && counts[s.winner] !== undefined) counts[s.winner]++ })
    return counts
  }, [scores])

  const avgMAE = useMemo(() => {
    const calc = (model) => {
      const vals = scores.map(s => s[`${model}_mae`]).filter(v => v != null && !isNaN(v))
      return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 'N/A'
    }
    return { arima: calc('arima'), prophet: calc('prophet'), xgboost: calc('xgboost') }
  }, [scores])

  const bestScore  = useMemo(() => {
    const valid = scores.filter(s => s.xgboost_mae != null)
    return valid.length > 0 ? valid.reduce((a, b) => a.xgboost_mae < b.xgboost_mae ? a : b) : null
  }, [scores])

  const fcRegion   = useMemo(() => forecasts.filter(f => f.region === selRegion), [forecasts, selRegion])
  const histRegion = useMemo(() => history.filter(h => !h.region || h.region === selRegion).slice(-90), [history, selRegion])

  if (loading) return <div style={{ padding: 24 }}><Spinner size={48} /></div>

  // ── Chart configs ─────────────────────────────────────────────────
  const modelCompChart = scores.length > 0 ? {
    series: [
      { name: 'ARIMA',   data: scores.map(s => s.arima_mae   ?? null) },
      { name: 'Prophet', data: scores.map(s => s.prophet_mae ?? null) },
      { name: 'XGBoost', data: scores.map(s => s.xgboost_mae ?? null) },
    ],
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions.chart, type: 'bar' },
      colors:      [MODEL_COLORS.arima, MODEL_COLORS.prophet, MODEL_COLORS.xgboost],
      plotOptions: { bar: { columnWidth: '60%', borderRadius: 2 } },
      xaxis:       { categories: scores.map(s => (s.region || '').replace(' Gouvernorat', '').substring(0, 12)), labels: { rotate: -45, style: { fontSize: '9px', colors: C.textMuted } } },
      yaxis:       { title: { text: 'MAE (complaints/day)', style: { fontSize: '10px', color: C.textMuted } } },
      dataLabels:  { enabled: false },
      legend:      { position: 'top' },
    },
  } : null

  const winnerChart = {
    series: [winnerCounts.xgboost, winnerCounts.arima, winnerCounts.prophet],
    options: {
      ...baseChartOptions,
      labels:  ['XGBoost', 'ARIMA', 'Prophet'],
      colors:  [MODEL_COLORS.xgboost, MODEL_COLORS.arima, MODEL_COLORS.prophet],
      chart:   { ...baseChartOptions.chart, type: 'donut' },
      stroke:  { width: 0 },
      plotOptions: { pie: { donut: { size: '65%', labels: { show: true,
        name:  { fontSize: '10px', color: C.textMuted },
        value: { fontSize: '18px', fontWeight: 700, color: C.text },
        total: { show: true, label: 'Regions', fontSize: '10px', color: C.textMuted, formatter: () => String(scores.length) },
      } } } },
      legend: { position: 'bottom' },
    },
  }

  const forecastChart = (histRegion.length > 0 || fcRegion.length > 0) ? {
    series: [
      { name: 'Historical (90 days)', type: 'area', data: histRegion.map(d => ({ x: d.date, y: d.total_complaints })) },
      { name: 'Forecast (7 days)',    type: 'line', data: fcRegion.map(d => ({ x: d.date, y: d.forecast })) },
    ],
    options: {
      ...baseChartOptions,
      chart:   { ...baseChartOptions.chart, type: 'line' },
      colors:  ['#2980B9', '#E74C3C'],
      stroke:  { curve: 'smooth', width: [2, 2.5], dashArray: [0, 5] },
      markers: { size: [0, 6] },
      fill:    { type: ['gradient', 'solid'], gradient: { shade: 'dark', opacityFrom: 0.2, opacityTo: 0 } },
      xaxis:   { type: 'datetime', labels: { format: 'dd MMM', style: { fontSize: '10px', colors: C.textMuted } } },
      yaxis:   { title: { text: 'Complaints/day', style: { fontSize: '10px', color: C.textMuted } } },
    },
  } : null

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <div style={{ padding: '24px 24px 48px' }}>

        <PageHeader
          title="Spike Prediction & Forecasting"
          subtitle="ARIMA · Prophet · XGBoost — 7-day complaint volume predictions per region"
          badges={['3 Models', '7-Day Forecast', `${scores.length || regions.length} Regions`, apiOnline ? 'Live' : 'Offline']}
        />

        {error && (
          <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: '#FCD34D' }}>
            {error}
          </div>
        )}

        {/* Note when scores parquet is missing */}
        {scores.length === 0 && regions.length > 0 && (
          <div style={{ background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)', borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: '#93C5FD' }}>
            ℹ Model performance scores not available yet — showing forecast chart only.
            To enable the model comparison table, re-run Notebook 05 (spike_predictor will write
            <code style={{ marginLeft: 6, background: 'rgba(255,255,255,.06)', padding: '2px 8px', borderRadius: 4 }}>
              models/prediction/prediction_scores.parquet
            </code>).
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Regions Modeled"  value={scores.length || regions.length}            color={C.blue}               icon="🌍" />
          <KpiCard label="XGBoost Wins"     value={scores.length ? `${winnerCounts.xgboost}/${scores.length}` : 'N/A'} color={MODEL_COLORS.xgboost} icon="🏆" />
          <KpiCard label="Mean MAE XGBoost" value={avgMAE.xgboost}  unit=" compl/day"          color={C.green}              icon="📊" />
          <KpiCard label="Best Region"      value={bestScore?.region || (selRegion || 'N/A')} sub={bestScore ? `MAE ${bestScore.xgboost_mae?.toFixed(2)}` : 'Showing first region'} color={C.red} icon="⭐" />
          <KpiCard label="ARIMA Wins"       value={scores.length ? `${winnerCounts.arima}/${scores.length}` : 'N/A'}   color={MODEL_COLORS.arima}   icon="🔵" />
          <KpiCard label="Prophet Wins"     value={scores.length ? `${winnerCounts.prophet}/${scores.length}` : 'N/A'} color={MODEL_COLORS.prophet} icon="🟢" />
          <KpiCard label="Mean MAE ARIMA"   value={avgMAE.arima}   unit=" compl/day"           color={MODEL_COLORS.arima}   icon="📈" />
          <KpiCard label="Mean MAE Prophet" value={avgMAE.prophet} unit=" compl/day"           color={MODEL_COLORS.prophet} icon="📉" />
        </div>

        {/* ── Model comparison + winner ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.5fr', gap: 16, marginBottom: 24 }}>
          <div>
            <SectionHeader>Model Performance by Region</SectionHeader>
            <ChartCard subtitle="MAE — ARIMA vs Prophet vs XGBoost">
              {modelCompChart
                ? <ReactApexChart options={modelCompChart.options} series={modelCompChart.series} type="bar" height={340} />
                : <EmptyState icon="📊" title="No score data yet" desc="Re-run Notebook 05 to generate prediction_scores.parquet" />
              }
            </ChartCard>
          </div>
          <div>
            <SectionHeader>Best Model Distribution</SectionHeader>
            <ChartCard subtitle="Winner per region (lowest MAE)">
              <ReactApexChart options={winnerChart.options} series={winnerChart.series} type="donut" height={340} />
            </ChartCard>
          </div>
        </div>

        {/* ── Forecast chart ── */}
        <div style={{ marginBottom: 24 }}>
          <SectionHeader>Historical + 7-Day Forecast</SectionHeader>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: C.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Region</span>
            <select
              value={selRegion || ''}
              onChange={e => handleRegionChange(e.target.value)}
              style={{ background: '#0C0C0C', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', outline: 'none' }}
            >
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {bestScore && selRegion === bestScore.region && <Badge variant="red">Best Region</Badge>}
            <Badge variant="blue">90-day history + 7-day forecast</Badge>
          </div>
          <ChartCard subtitle={`${selRegion || '—'} — dashed line = forecast`}>
            {forecastChart
              ? <ReactApexChart options={forecastChart.options} series={forecastChart.series} type="line" height={360} />
              : <EmptyState icon="📉" title="No forecast data for this region" desc="Run Notebook 05 to generate forecasts.parquet" />
            }
          </ChartCard>
        </div>

        {/* ── Scores table ── */}
        <SectionHeader>
          Model Performance Scores
          <span style={{ marginLeft: 12 }}><Badge variant="red">{scores.filter(s => s.xgboost_mae != null).length} active regions</Badge></span>
        </SectionHeader>
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.03)', borderBottom: `1px solid ${C.border}` }}>
                {['Region', 'ARIMA MAE', 'Prophet MAE', 'XGBoost MAE', 'ARIMA MAPE', 'Prophet MAPE', 'XGBoost MAPE', 'Winner'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: C.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>
                    No score data — re-run Notebook 05 (generates prediction_scores.parquet)
                  </td>
                </tr>
              ) : (
                [...scores]
                  .filter(s => s.xgboost_mae != null)
                  .sort((a, b) => (a.xgboost_mae || 99) - (b.xgboost_mae || 99))
                  .map((s, i) => (
                    <tr key={s.region || i} style={{ borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 12px', color: C.text, fontWeight: 600 }}>{(s.region || '').replace(' Gouvernorat', '')}</td>
                      <td style={{ padding: '10px 12px', color: MODEL_COLORS.arima,   fontFamily: 'monospace', fontSize: 10 }}>{s.arima_mae?.toFixed(2)   || '—'}</td>
                      <td style={{ padding: '10px 12px', color: MODEL_COLORS.prophet, fontFamily: 'monospace', fontSize: 10 }}>{s.prophet_mae?.toFixed(2) || '—'}</td>
                      <td style={{ padding: '10px 12px', color: MODEL_COLORS.xgboost, fontWeight: 700, fontFamily: 'monospace', fontSize: 10 }}>{s.xgboost_mae?.toFixed(2) || '—'}</td>
                      <td style={{ padding: '10px 12px', color: C.textMuted, fontSize: 10 }}>{s.arima_mape?.toFixed(1)   || '—'}%</td>
                      <td style={{ padding: '10px 12px', color: C.textMuted, fontSize: 10 }}>{s.prophet_mape?.toFixed(1) || '—'}%</td>
                      <td style={{ padding: '10px 12px', color: C.textMuted, fontSize: 10 }}>{s.xgboost_mape?.toFixed(1) || '—'}%</td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge variant={s.winner === 'xgboost' ? 'red' : s.winner === 'arima' ? 'blue' : 'green'}>
                          {s.winner?.toUpperCase() || 'N/A'}
                        </Badge>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </Card>

      </div>
    </div>
  )
}