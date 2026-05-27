// src/pages/Forecasting.jsx
// ─────────────────────────────────────────────────────────────────────
// Spike Prediction & Forecasting
//
// Changes from original:
//   - Custom Ico SVG factory replaced with Lucide React
//   - Full react-i18next translation (forecast.* + common.* keys)
//   - All hardcoded English strings replaced with t() calls
//   - pivotScores, maeColor, MODEL, all logic 100% preserved
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import ReactApexChart     from 'react-apexcharts'
import {
  Globe, Target, BarChart3, Star, Activity, TrendingUp,
  AlertTriangle, Info, ArrowUpDown, ChevronDown,
  Calendar, Cpu,
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

// ── Model identity colours ─────────────────────────────────────────────
const MODEL = {
  xgboost: { color: C.red,   label: 'XGBoost', badge: 'red'   },
  arima:   { color: C.blue,  label: 'ARIMA',   badge: 'blue'  },
  prophet: { color: C.green, label: 'Prophet', badge: 'green' },
}

// ── FC1: Pivot long → wide format ──────────────────────────────────────
function pivotScores(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []
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

// ── MAE colour coding — lower is better ───────────────────────────────
const maeColor = (val, allVals) => {
  if (val == null || isNaN(val)) return C.textDim
  const sorted = [...allVals].filter(v => v != null && !isNaN(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return C.textMuted
  const rank = sorted.indexOf(val) / sorted.length
  if (rank < 0.33) return C.green
  if (rank < 0.66) return C.amber
  return C.redLight
}

// ── Section label ──────────────────────────────────────────────────────
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

// ── KPI stat block ──────────────────────────────────────────────────────
const StatBlock = ({ label, value, unit, color, icon: IconComp, sub }) => (
  <div className="fc-stat-block" style={{
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
  <div className="fc-chart-panel" style={{
    background: C.bg2, border: `1px solid ${C.border}`,
    padding: '22px 24px', position: 'relative', overflow: 'hidden',
    transition: 'border-color .3s', ...style,
  }}>
    <div className="fc-panel-accent" style={{
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

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function Forecasting() {
  const { t } = useTranslation()

  const [scores,     setScores]     = useState([])
  const [forecasts,  setForecasts]  = useState([])
  const [regions,    setRegions]    = useState([])
  const [history,    setHistory]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [apiOnline,  setApiOnline]  = useState(true)
  const [selRegion,  setSelRegion]  = useState(null)
  const [bestRegion, setBestRegion] = useState(null)

  // FC2: loadHistory separated — called only from UI interactions after init
  const loadHistory = useCallback(async (region) => {
    try {
      const res = await analyticsApi.forecastHistory(region)
      setHistory(res.data?.history || [])
    } catch { setHistory([]) }
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
        setScores(sc); setForecasts(fc); setRegions(regs)

        const valid = sc.filter(s => s.xgboost_mae != null && !isNaN(s.xgboost_mae))
        if (valid.length > 0) {
          const best = valid.reduce((a, b) => a.xgboost_mae < b.xgboost_mae ? a : b)
          setBestRegion(best.region); setSelRegion(best.region)
          const histRes = await analyticsApi.forecastHistory(best.region)
          setHistory(histRes.data?.history || [])
        } else if (regs.length > 0) {
          // FC3: scores empty but forecasts exist
          setSelRegion(regs[0])
          const histRes = await analyticsApi.forecastHistory(regs[0])
          setHistory(histRes.data?.history || [])
        }
        setApiOnline(true)
      } catch (err) {
        console.error('Forecast fetch error:', err)
        setApiOnline(false)
        setError(`FastAPI offline — ${t('forecast.noDataDesc')}`)
      } finally { setLoading(false) }
    }
    fetchData()
  }, [])

  const handleRegionChange = async (region) => {
    setSelRegion(region)
    await loadHistory(region)
  }

  // ── Derived values ─────────────────────────────────────────────────
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

  const bestScore = useMemo(() => {
    const valid = scores.filter(s => s.xgboost_mae != null)
    return valid.length > 0 ? valid.reduce((a, b) => a.xgboost_mae < b.xgboost_mae ? a : b) : null
  }, [scores])

  const fcRegion   = useMemo(() => forecasts.filter(f => f.region === selRegion), [forecasts, selRegion])
  const histRegion = useMemo(() =>
    history.filter(h => !h.region || h.region === selRegion).slice(-90),
    [history, selRegion]
  )

  const allXgbMAE     = useMemo(() => scores.map(s => s.xgboost_mae).filter(Boolean),  [scores])
  const allArimaMAE   = useMemo(() => scores.map(s => s.arima_mae).filter(Boolean),    [scores])
  const allProphetMAE = useMemo(() => scores.map(s => s.prophet_mae).filter(Boolean),  [scores])

  // ── Loading ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block', animation: 'fc-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.redLight }}>
          {t('common.loading')}
        </span>
      </div>
      <Spinner size={48}/>
    </div>
  )

  // ── KPI tiles ──────────────────────────────────────────────────────
  const kpiTiles = [
    { label: t('forecast.kpiRegions'),    value: scores.length || regions.length,  color: C.blue,              icon: Globe,      sub: t('forecast.subActive')      },
    { label: t('forecast.kpiXgbWins'),    value: scores.length ? `${winnerCounts.xgboost}/${scores.length}` : 'N/A', color: MODEL.xgboost.color, icon: Target, sub: t('forecast.subBestMae') },
    { label: t('forecast.kpiXgbMae'),     value: avgMAE.xgboost,                  color: C.green,             icon: BarChart3,  sub: t('forecast.subComplDay')    },
    { label: t('forecast.kpiBestRegion'), value: bestScore?.region ? bestScore.region.replace(' Gouvernorat', '') : (selRegion || 'N/A'), color: C.red, icon: Star, sub: bestScore ? `MAE ${bestScore.xgboost_mae?.toFixed(2)}` : t('forecast.subFirstRegion') },
    { label: t('forecast.kpiArimaWins'),  value: scores.length ? `${winnerCounts.arima}/${scores.length}` : 'N/A',   color: MODEL.arima.color,   icon: Activity,   sub: t('forecast.subStatBase') },
    { label: t('forecast.kpiProphetWins'),value: scores.length ? `${winnerCounts.prophet}/${scores.length}` : 'N/A', color: MODEL.prophet.color, icon: TrendingUp, sub: t('forecast.subTrendSea') },
    { label: t('forecast.kpiArimaMae'),   value: avgMAE.arima,                    color: MODEL.arima.color,   icon: BarChart3,  sub: t('forecast.subComplDay')    },
    { label: t('forecast.kpiProphetMae'), value: avgMAE.prophet,                  color: MODEL.prophet.color, icon: BarChart3,  sub: t('forecast.subComplDay')    },
  ]

  // ── Chart: grouped bar MAE ─────────────────────────────────────────
  const modelCompChart = scores.length > 0 ? {
    series: [
      { name: 'ARIMA',   data: scores.map(s => s.arima_mae   ?? null) },
      { name: 'Prophet', data: scores.map(s => s.prophet_mae ?? null) },
      { name: 'XGBoost', data: scores.map(s => s.xgboost_mae ?? null) },
    ],
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions?.chart, type: 'bar', background: 'transparent', animations: { enabled: false } },
      colors:      [MODEL.arima.color, MODEL.prophet.color, MODEL.xgboost.color],
      plotOptions: { bar: { columnWidth: '62%', borderRadius: 0 } },
      xaxis: {
        categories: scores.map(s => (s.region || '').replace(' Gouvernorat', '').substring(0, 12)),
        labels:     { rotate: -40, style: { fontSize: '9px', colors: C.textMuted, fontFamily: "'Barlow Condensed',sans-serif" } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: {
        title:  { text: `MAE (${t('forecast.maeUnit')})`, style: { fontSize: '10px', color: C.textMuted, fontWeight: 400 } },
        labels: { style: { fontSize: '10px', colors: C.textMuted } },
      },
      dataLabels: { enabled: false },
      legend:     { position: 'top', horizontalAlign: 'left', labels: { colors: C.textMuted }, markers: { radius: 2 }, itemMargin: { horizontal: 14 } },
      grid:       { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3 },
      tooltip:    { theme: 'dark', y: { formatter: v => v != null ? `${v.toFixed(2)} ${t('forecast.maeUnit')}` : 'N/A' } },
    },
  } : null

  // ── Chart: winner donut ────────────────────────────────────────────
  const winnerChart = {
    series: [winnerCounts.xgboost, winnerCounts.arima, winnerCounts.prophet],
    options: {
      ...baseChartOptions,
      chart:   { ...baseChartOptions?.chart, type: 'donut', background: 'transparent', animations: { enabled: false } },
      labels:  ['XGBoost', 'ARIMA', 'Prophet'],
      colors:  [MODEL.xgboost.color, MODEL.arima.color, MODEL.prophet.color],
      stroke:  { width: 2, colors: [C.bg2] },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show:  true,
              name:  { fontSize: '11px', color: C.textMuted, offsetY: -6 },
              value: { fontFamily: "'Barlow Condensed',sans-serif", fontSize: '28px', fontWeight: 900, color: C.text, offsetY: 4, formatter: v => `${v}` },
              total: { show: true, label: t('forecast.regionsLabel'), fontSize: '10px', color: C.textMuted, formatter: () => String(scores.length) },
            },
          },
        },
      },
      legend:     { position: 'bottom', horizontalAlign: 'center', fontSize: '11px', labels: { colors: C.textMuted }, itemMargin: { horizontal: 10, vertical: 4 } },
      dataLabels: { enabled: false },
      tooltip:    { theme: 'dark', y: { formatter: v => `${v} ${t('forecast.regionsLabel')}` } },
    },
  }

  // ── Chart: historical + forecast ──────────────────────────────────
  const forecastChart = (histRegion.length > 0 || fcRegion.length > 0) ? {
    series: [
      { name: t('forecast.historicalSeries'), type: 'area', data: histRegion.map(d => ({ x: d.date, y: d.total_complaints })) },
      { name: t('forecast.forecastSeries'),   type: 'line', data: fcRegion.map(d => ({ x: d.date, y: d.forecast })) },
    ],
    options: {
      ...baseChartOptions,
      chart:  { ...baseChartOptions?.chart, type: 'line', stacked: false, background: 'transparent', animations: { enabled: false } },
      colors: [C.blue, C.red],
      stroke: { curve: ['smooth', 'smooth'], width: [2, 2.5], dashArray: [0, 6] },
      markers: { size: [0, 6], strokeWidth: [0, 2], strokeColors: ['transparent', '#fff'], hover: { size: 8 } },
      fill: {
        type: ['gradient', 'solid'],
        gradient: { shade: 'dark', type: 'vertical', gradientToColors: ['transparent'], opacityFrom: 0.22, opacityTo: 0.01, stops: [0, 90] },
      },
      xaxis: {
        type:       'datetime',
        labels:     { format: 'dd MMM', style: { fontSize: '10px', colors: C.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: {
        min:    0,
        title:  { text: t('forecast.complDay'), style: { fontSize: '10px', color: C.textMuted, fontWeight: 400 } },
        labels: { style: { fontSize: '10px', colors: C.textMuted }, formatter: v => v?.toFixed(0) },
      },
      legend: { position: 'top', horizontalAlign: 'left', labels: { colors: C.textMuted }, markers: { radius: 2 }, itemMargin: { horizontal: 16 } },
      grid:   { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
      tooltip: {
        shared: false, intersect: false,
        x: { format: 'dd MMM yyyy' },
        y: {
          formatter: (val, { seriesIndex }) =>
            seriesIndex === 1
              ? `${t('forecast.forecastPrefix')} ${val?.toFixed(0)} ${t('forecast.complaints')}`
              : `${val?.toFixed(0)} ${t('forecast.complaints')}`,
        },
      },
    },
  } : null

  const tableRows = [...scores]
    .filter(s => s.xgboost_mae != null)
    .sort((a, b) => (a.xgboost_mae || 99) - (b.xgboost_mae || 99))

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>

      <style>{`
        @keyframes fc-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        .fc-stat-block:hover { border-color:rgba(207,10,44,.22)!important; background:rgba(207,10,44,.03)!important; transform:translateY(-2px); box-shadow:0 8px 24px rgba(207,10,44,.07); }
        .fc-chart-panel:hover { border-color:rgba(207,10,44,.2)!important; }
        .fc-chart-panel:hover .fc-panel-accent { transform:scaleX(1)!important; }
        .fc-table-row:hover td { background:rgba(255,255,255,.018)!important; }
        .fc-select {
          appearance:none; background:${C.bg3}; color:${C.text};
          border:1px solid ${C.border}; padding:8px 36px 8px 14px;
          font-size:11px; font-weight:600; font-family:'Inter',system-ui;
          letter-spacing:.5px; cursor:pointer; outline:none; transition:border-color .2s; min-width:200px;
        }
        .fc-select:hover, .fc-select:focus { border-color:rgba(207,10,44,.4); }
        .fc-select-wrap { position:relative; display:inline-block; }
        .fc-select-wrap svg { position:absolute; right:10px; top:50%; transform:translateY(-50%); pointer-events:none; }
      `}</style>

      <div style={{ padding: '40px 48px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── HERO HEADER ─────────────────────────────────────────── */}
        <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 28, marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'rgba(207,10,44,.1)', border: '1px solid rgba(207,10,44,.28)', padding: '6px 14px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block', animation: 'fc-pulse 2s ease-in-out infinite' }}/>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.redLight }}>
                {apiOnline ? t('forecast.liveBadge') : t('forecast.offlineBadge')}
              </span>
            </div>
            <span style={{ fontSize: 11, color: C.textDim, letterSpacing: '1.5px' }}>
              {t('forecast.subtitle2')}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 'clamp(28px,3.5vw,54px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: C.text, marginBottom: 8,
              }}>
                {t('forecast.title').split(' ').slice(0, -1).join(' ')}{' '}
                <span style={{ color: C.red, fontStyle: 'italic' }}>
                  {t('forecast.title').split(' ').slice(-1)[0]}
                </span>
              </h1>
              <p style={{ fontSize: 13, color: C.textMuted, fontWeight: 300 }}>
                {t('forecast.subtitle')} · {scores.length || regions.length} {t('forecast.regionsModeled')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? t('forecast.onlineLabel') : t('forecast.offlineLabel'), color: apiOnline ? C.green : C.red, bd: apiOnline ? 'rgba(34,197,94,.28)' : 'rgba(207,10,44,.28)', bg: apiOnline ? 'rgba(34,197,94,.08)' : 'rgba(207,10,44,.08)' },
                { label: t('forecast.threeModels'), color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
                { label: t('forecast.sevenDay'),    color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
                { label: t('forecast.xgbBest'),     color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
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

        {/* ── INFO BANNER — scores parquet missing ─────────────────── */}
        {scores.length === 0 && regions.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            background: 'rgba(59,130,246,.07)', border: '1px solid rgba(59,130,246,.25)',
            padding: '14px 20px', marginBottom: 1,
          }}>
            <Info size={14} color={C.blue}/>
            <div>
              <div style={{ fontSize: 12, color: '#93C5FD', fontWeight: 700, marginBottom: 4 }}>
                {t('forecast.scoresUnavail')}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted }}>
                {t('forecast.scoresUnavailDesc').split('models/prediction/prediction_scores.parquet')[0]}
                <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 7px', fontSize: 10, color: C.cyan }}>
                  models/prediction/prediction_scores.parquet
                </code>
                {t('forecast.scoresUnavailDesc').split('models/prediction/prediction_scores.parquet')[1]}
              </div>
            </div>
          </div>
        )}

        {/* ── KPI TILES ───────────────────────────────────────────── */}
        <SectionLabel sub={t('forecast.kpiSub')}>
          {t('forecast.kpiSection')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          {kpiTiles.map((kpi, i) => (
            <StatBlock key={i} label={kpi.label} value={kpi.value} unit={kpi.unit} color={kpi.color} icon={kpi.icon} sub={kpi.sub}/>
          ))}
        </div>

        {/* ── MODEL COMPARISON + WINNER ────────────────────────────── */}
        <SectionLabel sub={t('forecast.modelSub')}>
          {t('forecast.modelSection')}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          <ChartPanel sub={t('forecast.modelChartSub')}>
            {modelCompChart ? (
              <ReactApexChart options={modelCompChart.options} series={modelCompChart.series} type="bar" height={340}/>
            ) : (
              <EmptyState
                icon={<BarChart3 size={36} color="rgba(255,255,255,.18)"/>}
                title={t('forecast.noData')}
                desc={t('forecast.noDataDesc')}
              />
            )}
          </ChartPanel>

          <ChartPanel title={t('forecast.winnerTitle')} sub={t('forecast.winnerSub')}>
            <ReactApexChart options={winnerChart.options} series={winnerChart.series} type="donut" height={340}/>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              {Object.values(MODEL).map(m => (
                <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, background: m.color }}/>
                  <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>{m.label}</span>
                </div>
              ))}
            </div>
          </ChartPanel>
        </div>

        {/* ── FORECAST CHART ───────────────────────────────────────── */}
        <SectionLabel sub={t('forecast.forecastSub')}>
          {t('forecast.forecastSection')}
        </SectionLabel>

        <ChartPanel>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, color: C.textDim, letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700 }}>
              {t('forecast.regionLabel')}
            </span>
            <div className="fc-select-wrap">
              <select
                value={selRegion || ''}
                onChange={e => handleRegionChange(e.target.value)}
                className="fc-select"
              >
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown size={12} color={C.textDim}/>
            </div>
            {bestScore && selRegion === bestScore.region && (
              <Badge variant="red">{t('forecast.bestRegionBadge')}</Badge>
            )}
            <Badge variant="blue">{t('forecast.histForecastBadge')}</Badge>
          </div>

          {forecastChart ? (
            <ReactApexChart options={forecastChart.options} series={forecastChart.series} type="line" height={380}/>
          ) : (
            <EmptyState
              icon={<Calendar size={36} color="rgba(255,255,255,.18)"/>}
              title={t('forecast.noForecastRegion')}
              desc={t('forecast.noDataDesc')}
            />
          )}
        </ChartPanel>

        {/* ── SCORES TABLE ─────────────────────────────────────────── */}
        <SectionLabel
          action={<Badge variant="red">{tableRows.length} {t('forecast.activeRegions')}</Badge>}
          sub={t('forecast.scoresSub')}
        >
          {t('forecast.scoresSection')}
        </SectionLabel>

        <div style={{ border: `1px solid ${C.border}`, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg, transparent, ${C.red}, transparent)` }}/>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 860 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,.025)', borderBottom: `1px solid ${C.border}` }}>
                  {[
                    { label: t('forecast.thRegion'),      Icon: Globe        },
                    { label: t('forecast.thArimaMae'),    Icon: ArrowUpDown  },
                    { label: t('forecast.thProphetMae'),  Icon: ArrowUpDown  },
                    { label: t('forecast.thXgbMae'),      Icon: ArrowUpDown  },
                    { label: t('forecast.thArimaMape'),   Icon: null         },
                    { label: t('forecast.thProphetMape'), Icon: null         },
                    { label: t('forecast.thXgbMape'),     Icon: null         },
                    { label: t('forecast.thWinner'),      Icon: Target       },
                  ].map(({ label, Icon }) => (
                    <th key={label} style={{
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
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: C.textMuted }}>
                      <div style={{ marginBottom: 10 }}><Cpu size={28} color="rgba(255,255,255,.18)"/></div>
                      {t('forecast.noScores')}
                    </td>
                  </tr>
                ) : tableRows.map((s, i) => (
                  <tr key={s.region || i} className="fc-table-row" style={{ borderBottom: `1px solid rgba(255,255,255,.04)`, transition: 'all .15s' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: C.text, fontSize: 12 }}>
                      {(s.region || '').replace(' Gouvernorat', '')}
                      {s.region === bestRegion && (
                        <span style={{ marginLeft: 8, fontSize: 9, color: C.red, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                          {t('forecast.bestLabel')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 700, color: maeColor(s.arima_mae, allArimaMAE), letterSpacing: '-.3px' }}>
                        {s.arima_mae?.toFixed(2) || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 700, color: maeColor(s.prophet_mae, allProphetMAE), letterSpacing: '-.3px' }}>
                        {s.prophet_mae?.toFixed(2) || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 800, color: maeColor(s.xgboost_mae, allXgbMAE), letterSpacing: '-.3px' }}>
                        {s.xgboost_mae?.toFixed(2) || '—'}
                      </span>
                    </td>
                    {['arima_mape', 'prophet_mape', 'xgboost_mape'].map(key => (
                      <td key={key} style={{ padding: '11px 14px', color: C.textDim, fontSize: 10, letterSpacing: '.5px' }}>
                        {s[key]?.toFixed(1) || '—'}%
                      </td>
                    ))}
                    <td style={{ padding: '11px 14px' }}>
                      <Badge variant={MODEL[s.winner]?.badge || 'gray'}>
                        {s.winner?.toUpperCase() || 'N/A'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}