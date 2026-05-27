// src/pages/RootCauseAnalysis.jsx
// ─────────────────────────────────────────────────────────────────────
// Root Cause Classification — redesigned to match LandingPage
//
// DESIGN CHANGES vs original:
//   • Color palette: THEME/slate-900 → #080808 family
//   • MODEL_COLORS aligned: random_forest=blue, xgboost=red (theme)
//   • Barlow Condensed 900 for all stat values
//   • Sharp corners (borderRadius: 0) throughout
//   • Section labels match landing page .section-label exactly
//   • KPI tiles use stat-block pattern (gradient top accent line)
//   • Grid gaps: 1px rgba fill instead of gap: 12/16
//   • Hero header with live badge
//   • SVG icons replace emojis in KPI tiles
//   • "Not run yet" state — dark styled empty panel
//   • Confusion matrix — dark-friendly blue-scale color ranges
//   • Top 5 feature cards — module-card hover pattern
//   • Classification table — Barlow Condensed values, color-coded
//   • Removed PageHeader / SectionHeader / KpiCard / Card / ChartCard
//
// BUGS PRESERVED FROM ORIGINAL:
//   • RC-A: EmptyState used from Badge/Spinner/EmptyState import
//   • RC-B: No duplicate const top10 — single useMemo declaration
//   • RC-C: ALL useMemo hooks declared before any conditional return
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import ReactApexChart from 'react-apexcharts'
import { Badge, Spinner, EmptyState, baseChartOptions } from '../components/UI'
import { analyticsApi } from '../api/client'

// ── Color palette — mirrors LandingPage exactly ───────────────────────
const C = {
  bg:        '#080808',
  bg2:       '#0C0C0C',
  bg3:       '#0A0A0A',
  bg4:       '#0E0E0E',
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

// ── Model identity — aligned with theme palette ───────────────────────
const MODEL = {
  random_forest: { color: C.blue,  label: 'Random Forest', badge: 'blue' },
  xgboost:       { color: C.red,   label: 'XGBoost',       badge: 'red'  },
}

const REPORT_META_KEYS = new Set(['accuracy', 'macro avg', 'weighted avg'])

// ── Confusion matrix color scale — dark-friendly blue diagonal ────────
const CM_RANGES = [
  { from: 0,  to: 10,  color: '#070E1C', name: 'None'     },
  { from: 10, to: 30,  color: '#0F2540', name: 'Low'      },
  { from: 30, to: 60,  color: '#1A3F6A', name: 'Medium'   },
  { from: 60, to: 80,  color: '#1D5FA8', name: 'High'     },
  { from: 80, to: 100, color: '#3B82F6', name: 'Dominant' },
]

// ── SVG icon factory ──────────────────────────────────────────────────
const Ico = d => ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)

const IcoTarget   = Ico(<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>)
const IcoBarChart = Ico(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>)
const IcoActivity = Ico(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>)
const IcoRefresh  = Ico(<><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>)
const IcoCheck    = Ico(<polyline points="20 6 9 17 4 12"/>)
const IcoList     = Ico(<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>)
const IcoSearch   = Ico(<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>)
const IcoGrid     = Ico(<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>)
const IcoAlert    = Ico(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>)
const IcoSort     = Ico(<><path d="M3 6h18M7 12h10M11 18h2"/></>)
const IcoCpu      = Ico(<><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></>)
const IcoStar     = Ico(<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>)

// ── Section Label ─────────────────────────────────────────────────────
const SectionLabel = ({ children, action, sub }) => (
  <div style={{ marginTop: 40, marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: C.red,
        letterSpacing: '4.5px', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ width: 22, height: 1, background: C.red, display: 'inline-block', flexShrink: 0 }} />
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

// ── KPI Stat Block ────────────────────────────────────────────────────
const StatBlock = ({ label, value, unit, color, icon: IconComp, sub }) => (
  <div className="rc-stat-block" style={{
    background: C.bg3, border: `1px solid ${C.border}`,
    padding: '24px 20px', position: 'relative', overflow: 'hidden',
    transition: 'all .3s cubic-bezier(.22,1,.36,1)', cursor: 'default',
  }}>
    <div style={{
      position: 'absolute', top: 0, left: '12%', right: '12%', height: 1,
      background: `linear-gradient(90deg, transparent, ${color || C.red}, transparent)`,
    }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: C.textDim, letterSpacing: '1.8px', textTransform: 'uppercase', lineHeight: 1.5 }}>
        {label}
      </span>
      {IconComp && (
        <div style={{
          width: 26, height: 26,
          border: `1px solid ${(color || C.red)}30`,
          background: `${color || C.red}10`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <IconComp size={12} color={color || C.red} />
        </div>
      )}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: sub ? 8 : 0 }}>
      <span style={{
        fontFamily: "'Barlow Condensed',sans-serif",
        fontSize: typeof value === 'string' && value.length > 8 ? 22 : 34,
        fontWeight: 900, color: color || C.red,
        lineHeight: 1, letterSpacing: '-1px',
      }}>
        {value}
      </span>
      {unit && <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{unit}</span>}
    </div>
    {sub && <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '1px', textTransform: 'uppercase' }}>{sub}</div>}
  </div>
)

// ── Chart Panel ───────────────────────────────────────────────────────
const ChartPanel = ({ title, sub, children, action, style = {} }) => (
  <div className="rc-chart-panel" style={{
    background: C.bg2, border: `1px solid ${C.border}`,
    padding: '22px 24px', position: 'relative', overflow: 'hidden',
    transition: 'border-color .3s', ...style,
  }}>
    <div className="rc-panel-accent" style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
      background: `linear-gradient(90deg, transparent, ${C.red}, transparent)`,
      transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s ease',
    }} />
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
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function RootCauseAnalysis() {
  const [results,   setResults]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [apiOnline, setApiOnline] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const r = await analyticsApi.rootCauseResults()
        setResults(r.data || r)
        setApiOnline(true)
      } catch (err) {
        console.error('Root cause fetch error:', err)
        setApiOnline(false)
        setError('FastAPI offline')
      } finally { setLoading(false) }
    }
    fetchData()
  }, [])

  // ── RC-C: ALL hooks declared BEFORE any conditional return ────────
  const fi        = results?.feature_importance || []
  const xgbReport = results?.xgb_report         || {}

  const classPerf = useMemo(() => {
    const cr = xgbReport?.classification_report || {}
    return Object.entries(cr)
      .filter(([cls]) => !REPORT_META_KEYS.has(cls))
      .map(([cls, m]) => ({
        class:     cls,
        precision: m?.precision    || 0,
        recall:    m?.recall       || 0,
        f1:        m?.['f1-score'] || 0,
        support:   m?.support      || 0,
      }))
  }, [xgbReport])

  const top20 = useMemo(() => {
    if (!Array.isArray(fi) || fi.length === 0) return []
    return fi.slice(0, 20).map(f => ({
      ...f,
      feature_label: (f.feature || '').replace(/_/g, ' ').replace(/mean/g, '').trim(),
    }))
  }, [fi])

  // RC-B: single declaration — no duplicate
  const top10 = useMemo(() => {
    if (!Array.isArray(fi) || fi.length === 0) return []
    return fi.slice(0, 10)
  }, [fi])

  // ── Early returns AFTER all hooks ─────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, display: 'inline-block', animation: 'rc-pulse 1.8s infinite' }} />
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.blue }}>
          Loading Classifiers…
        </span>
      </div>
      <Spinner size={48} />
    </div>
  )

  // "Not run yet" state
  const notRunYet = !results?.best_model && !!results?.message
  if (notRunYet) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
        <style>{`@keyframes rc-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}`}</style>
        <div style={{ padding: '40px 48px' }}>

          {/* Hero header */}
          <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 28, marginBottom: 48 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.28)', padding: '6px 14px',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, display: 'inline-block' }} />
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#93C5FD' }}>
                  CLASSIFIER · Not Run Yet
                </span>
              </div>
            </div>
            <h1 style={{
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: 'clamp(28px, 3.5vw, 54px)', fontWeight: 900,
              letterSpacing: '-1.5px', lineHeight: 1, color: C.text, marginBottom: 8,
            }}>
              ROOT CAUSE <span style={{ color: C.red, fontStyle: 'italic' }}>CLASSIFICATION</span>
            </h1>
          </div>

          {/* Empty state panel */}
          <div style={{
            background: C.bg2, border: `1px solid ${C.border}`,
            padding: '48px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg, transparent, ${C.blue}, transparent)` }} />
            <div style={{ marginBottom: 20, opacity: .35 }}>
              <IcoCpu size={48} color={C.blue} />
            </div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 10 }}>
              Classifier Not Run Yet
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.7 }}>
              {results.message || 'Execute Notebook 05 root cause classifier first, then save root_cause_results.json.'}
            </div>
            <code style={{
              background: 'rgba(255,255,255,.04)', border: `1px solid ${C.border}`,
              padding: '8px 18px', fontSize: 11, color: C.cyan, letterSpacing: '.5px',
            }}>
              models/classification/root_cause_results.json
            </code>
          </div>
        </div>
      </div>
    )
  }

  // ── Remaining derived values ───────────────────────────────────────
  const bestModel    = results?.best_model         || 'N/A'
  const rfReport     = results?.rf_report          || {}
  const classes      = results?.classes            || []
  const confMatrices = results?.confusion_matrices || {}
  const cmXgb        = confMatrices?.xgboost

  // ── Chart configs ─────────────────────────────────────────────────

  // Feature importance (mean) — top 5 red, rest blue
  const importanceChart = top20.length > 0 ? {
    series: [{ name: 'RF + XGBoost Mean', data: top20.map(f => f.importance_mean || 0).reverse() }],
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions.chart, type: 'bar', background: 'transparent', animations: { enabled: false } },
      plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: '60%', distributed: true } },
      colors:      top20.map((_, i) => i < 5 ? C.red : C.blue).reverse(),
      xaxis: {
        categories: top20.map(f => f.feature_label).reverse(),
        labels:     { style: { fontSize: '10px', colors: C.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      dataLabels: {
        enabled: true, textAnchor: 'start', offsetX: 8,
        style:   { fontSize: '9px', fontWeight: 700, colors: [C.text], fontFamily: "'Barlow Condensed',sans-serif" },
        formatter: v => v.toFixed(3),
      },
      legend:  { show: false },
      grid:    { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3, xaxis: { lines: { show: false } } },
      tooltip: { theme: 'dark', y: { formatter: v => v.toFixed(4) } },
    },
  } : null

  // RF vs XGBoost grouped bar
  const rfVsXgbChart = top10.length > 0 ? {
    series: [
      { name: 'Random Forest', data: top10.map(f => f.importance_rf  || 0) },
      { name: 'XGBoost',       data: top10.map(f => f.importance_xgb || 0) },
    ],
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions.chart, type: 'bar', background: 'transparent', animations: { enabled: false } },
      colors:      [MODEL.random_forest.color, MODEL.xgboost.color],
      plotOptions: { bar: { columnWidth: '58%', borderRadius: 0 } },
      xaxis: {
        categories: top10.map(f => (f.feature || '').replace(/_/g, ' ').substring(0, 18)),
        labels:     { rotate: -35, style: { fontSize: '9px', colors: C.textMuted, fontFamily: "'Barlow Condensed',sans-serif" } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      dataLabels: { enabled: false },
      legend: {
        position: 'top', horizontalAlign: 'left',
        labels: { colors: C.textMuted }, markers: { radius: 2 },
        itemMargin: { horizontal: 14 },
      },
      grid:    { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3 },
      tooltip: { theme: 'dark', y: { formatter: v => v.toFixed(4) } },
    },
  } : null

  // Per-class F1 (categorical palette)
  const PER_CLASS_PALETTE = [C.red, C.amber, C.green, C.blue, C.purple, C.cyan, C.orange, C.redLight]
  const perClassChart = classPerf.length > 0 ? {
    series: [{ name: 'F1-Score', data: classPerf.map(c => c.f1) }],
    options: {
      ...baseChartOptions,
      chart:       { ...baseChartOptions.chart, type: 'bar', background: 'transparent', animations: { enabled: false } },
      plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: '58%', distributed: true } },
      colors:      classPerf.map((_, i) => PER_CLASS_PALETTE[i % PER_CLASS_PALETTE.length]),
      xaxis: {
        categories: classPerf.map(c => c.class),
        max:        1.0,
        labels:     { style: { fontSize: '10px', colors: C.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis:      { max: 1.0, labels: { style: { fontSize: '10px', colors: C.textMuted }, maxWidth: 120 } },
      dataLabels: {
        enabled: true, textAnchor: 'start', offsetX: 8,
        style:   { fontSize: '10px', fontWeight: 700, colors: [C.text], fontFamily: "'Barlow Condensed',sans-serif" },
        formatter: v => v.toFixed(2),
      },
      legend:  { show: false },
      grid:    { borderColor: 'rgba(255,255,255,.04)', strokeDashArray: 3, xaxis: { lines: { show: false } } },
      tooltip: { theme: 'dark', y: { formatter: v => `F1: ${v.toFixed(3)}` } },
    },
  } : null

  // Confusion matrix heatmap — dark-friendly blue scale
  const cmHeatmap = (cmXgb && classes.length > 0) ? (() => {
    const cmNorm = cmXgb.map(row => {
      const sum = row.reduce((a, b) => a + b, 0) || 1
      return row.map(v => parseFloat(((v / sum) * 100).toFixed(1)))
    })
    return {
      series: classes.map((cls, i) => ({
        name: cls,
        data: cmNorm[i].map((v, j) => ({ x: classes[j], y: v })),
      })),
      options: {
        ...baseChartOptions,
        chart:       { ...baseChartOptions.chart, type: 'heatmap', background: 'transparent', animations: { enabled: false } },
        plotOptions: {
          heatmap: {
            radius:       0,
            enableShades: false,
            colorScale:   { ranges: CM_RANGES },
          },
        },
        dataLabels: {
          enabled: true,
          style:   { fontSize: '9px', fontWeight: 700, colors: ['rgba(255,255,255,.85)'] },
          // Show raw count alongside normalised %; raw count from original matrix
          formatter: (v, { seriesIndex: si, dataPointIndex: di }) => String(cmXgb[si][di]),
        },
        xaxis: {
          labels:   { rotate: -20, style: { fontSize: '9px', colors: C.textMuted } },
          position: 'top',
          axisBorder: { show: false }, axisTicks: { show: false },
        },
        yaxis:  { labels: { style: { fontSize: '10px', colors: C.textMuted }, maxWidth: 100 } },
        tooltip: {
          theme: 'dark',
          y: { formatter: (v, { seriesIndex: si, dataPointIndex: di }) =>
            `${v.toFixed(1)}% (${cmXgb[si][di]} samples)` },
        },
        legend: { show: false },
      },
    }
  })() : null

  // KPI tiles
  const kpiTiles = [
    { label: 'Best Model',    value: bestModel.toUpperCase(), color: MODEL[bestModel]?.color || C.blue, icon: IcoTarget,   sub: 'Lowest classification error' },
    { label: 'RF Accuracy',   value: rfReport?.accuracy  != null ? rfReport.accuracy.toFixed(3)  : 'N/A', color: MODEL.random_forest.color, icon: IcoBarChart, sub: 'Random Forest' },
    { label: 'XGB Accuracy',  value: xgbReport?.accuracy != null ? xgbReport.accuracy.toFixed(3) : 'N/A', color: MODEL.xgboost.color,       icon: IcoActivity, sub: 'XGBoost'       },
    { label: 'XGB F1-Macro',  value: xgbReport?.f1_macro != null ? xgbReport.f1_macro.toFixed(3) : 'N/A', color: C.green,                   icon: IcoCheck,    sub: 'Macro average' },
    {
      label: 'RF CV F1',
      value: rfReport?.cv_f1_mean != null
        ? `${rfReport.cv_f1_mean.toFixed(3)} ±${rfReport.cv_f1_std?.toFixed(3) || '?'}`
        : 'N/A',
      color: MODEL.random_forest.color, icon: IcoRefresh, sub: 'Cross-validation',
    },
    {
      label: 'XGB CV F1',
      value: xgbReport?.cv_f1_mean != null
        ? `${xgbReport.cv_f1_mean.toFixed(3)} ±${xgbReport.cv_f1_std?.toFixed(3) || '?'}`
        : 'N/A',
      color: MODEL.xgboost.color, icon: IcoRefresh, sub: 'Cross-validation',
    },
    { label: 'Classes',       value: classes.length,  color: C.purple, icon: IcoGrid,  sub: 'Complaint categories' },
    { label: 'Top Features',  value: fi.length || 0,  color: C.amber,  icon: IcoSearch, sub: 'SHAP + tree importance' },
  ]

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>

      <style>{`
        @keyframes rc-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        .rc-stat-block:hover {
          border-color: rgba(207,10,44,.22) !important;
          background: rgba(207,10,44,.03) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(207,10,44,.07);
        }
        .rc-chart-panel:hover { border-color: rgba(207,10,44,.2) !important; }
        .rc-chart-panel:hover .rc-panel-accent { transform: scaleX(1) !important; }
        .rc-table-row:hover td { background: rgba(255,255,255,.018) !important; }
        .rc-feature-card:hover {
          border-color: rgba(207,10,44,.22) !important;
          background: rgba(207,10,44,.025) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(207,10,44,.07);
        }
        .rc-feature-card:hover .rc-feature-accent { transform: scaleX(1) !important; }
      `}</style>

      <div style={{ padding: '40px 48px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── HERO HEADER ──────────────────────────────────────────── */}
        <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 28, marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'rgba(207,10,44,.1)', border: '1px solid rgba(207,10,44,.28)', padding: '6px 14px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block', animation: 'rc-pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: C.redLight }}>
                {apiOnline ? 'LIVE · Classification Engine' : 'OFFLINE · Cached Results'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: C.textDim, letterSpacing: '1.5px' }}>
              Random Forest · XGBoost · SHAP
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: 'clamp(28px, 3.5vw, 54px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: C.text, marginBottom: 8,
              }}>
                ROOT CAUSE{' '}
                <span style={{ color: C.red, fontStyle: 'italic' }}>CLASSIFICATION</span>
              </h1>
              <p style={{ fontSize: 13, color: C.textMuted, fontWeight: 300 }}>
                Identifying complaint drivers · {classes.length} classes · Best model: {bestModel.toUpperCase()}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? '● Online' : '● Offline', color: apiOnline ? C.green : C.red, bd: apiOnline ? 'rgba(34,197,94,.28)' : 'rgba(207,10,44,.28)', bg: apiOnline ? 'rgba(34,197,94,.08)' : 'rgba(207,10,44,.08)' },
                { label: bestModel.toUpperCase() + ' Best',  color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
                { label: `${classes.length} Classes`,         color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
                { label: 'SHAP Features',                     color: C.textMuted, bd: C.border, bg: 'rgba(255,255,255,.02)' },
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

        {/* ── ERROR BANNER ─────────────────────────────────────────── */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.28)',
            padding: '12px 20px', marginBottom: 1,
          }}>
            <IcoAlert size={14} color={C.amber} />
            <span style={{ fontSize: 12, color: C.amber }}>{error}</span>
          </div>
        )}

        {/* ── KPI TILES ─────────────────────────────────────────────── */}
        <SectionLabel sub="Classifier performance metrics · CV = 5-fold cross-validation · F1-Macro = average across all complaint classes">
          Classification KPIs
        </SectionLabel>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1, background: 'rgba(255,255,255,.04)',
        }}>
          {kpiTiles.map((kpi, i) => (
            <StatBlock key={i} label={kpi.label} value={kpi.value} unit={kpi.unit} color={kpi.color} icon={kpi.icon} sub={kpi.sub} />
          ))}
        </div>

        {/* ── FEATURE IMPORTANCE ───────────────────────────────────── */}
        <SectionLabel sub="Red = top 5 most impactful · Blue = remaining features · Higher score = stronger complaint driver">
          Feature Importance Analysis
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          <ChartPanel
            title="Feature Importance — Mean (RF + XGBoost)"
            sub="Top 20 features averaged across both models"
          >
            {importanceChart ? (
              <ReactApexChart options={importanceChart.options} series={importanceChart.series} type="bar" height={400} />
            ) : (
              <EmptyState icon={<IcoBarChart size={36} color="rgba(255,255,255,.18)" />} title="No feature importance data" />
            )}
          </ChartPanel>

          <ChartPanel
            title="RF vs XGBoost — Top 10 Features"
            sub={`Blue = Random Forest · Red = XGBoost · ${top10.length} features shown`}
          >
            {rfVsXgbChart ? (
              <>
                <ReactApexChart options={rfVsXgbChart.options} series={rfVsXgbChart.series} type="bar" height={400} />
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10 }}>
                  {Object.values(MODEL).map(m => (
                    <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, background: m.color }} />
                      <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState icon={<IcoBarChart size={36} color="rgba(255,255,255,.18)" />} title="No comparison data" />
            )}
          </ChartPanel>
        </div>

        {/* ── TOP 5 FEATURE CARDS ──────────────────────────────────── */}
        {top20.length > 0 && (
          <>
            <SectionLabel sub="Features with the highest combined importance score — these are the primary complaint drivers">
              Top 5 Most Important Features
            </SectionLabel>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 1, background: 'rgba(255,255,255,.04)',
            }}>
              {top20.slice(0, 5).map((f, i) => (
                <div
                  key={i}
                  className="rc-feature-card"
                  style={{
                    background: C.bg3, border: `1px solid ${C.border}`,
                    padding: '26px 20px', position: 'relative', overflow: 'hidden',
                    transition: 'all .35s cubic-bezier(.22,1,.36,1)', cursor: 'default',
                    textAlign: 'center',
                  }}
                >
                  <div className="rc-feature-accent" style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
                    background: `linear-gradient(90deg, transparent, ${i < 3 ? C.red : C.blue}, transparent)`,
                    transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s ease',
                  }} />
                  {/* Rank */}
                  <div style={{
                    fontFamily: "'Barlow Condensed',sans-serif",
                    fontSize: 11, fontWeight: 800, color: i < 3 ? C.red : C.blue,
                    letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 12,
                  }}>
                    #{i + 1}
                  </div>
                  {/* Feature name */}
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: C.text,
                    wordBreak: 'break-word', lineHeight: 1.4, marginBottom: 14,
                    minHeight: 34,
                  }}>
                    {f.feature_label}
                  </div>
                  {/* Mean importance */}
                  <div style={{
                    fontFamily: "'Barlow Condensed',sans-serif",
                    fontSize: 26, fontWeight: 900, color: i < 3 ? C.red : C.blue,
                    letterSpacing: '-1px', lineHeight: 1, marginBottom: 8,
                  }}>
                    {f.importance_mean?.toFixed(4)}
                  </div>
                  {/* RF / XGB breakdown */}
                  <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '.5px', lineHeight: 1.7 }}>
                    <span style={{ color: MODEL.random_forest.color, fontWeight: 700 }}>RF</span> {f.importance_rf?.toFixed(4) || '—'}
                    {'  ·  '}
                    <span style={{ color: MODEL.xgboost.color, fontWeight: 700 }}>XGB</span> {f.importance_xgb?.toFixed(4) || '—'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── PER-CLASS F1 + CONFUSION MATRIX ─────────────────────── */}
        <SectionLabel sub="XGBoost per-class performance · F1 = harmonic mean of precision and recall">
          Per-Class Performance &amp; Confusion Matrix
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>
          <ChartPanel
            title="Per-Class F1 Scores"
            sub="XGBoost — true class rows only (meta rows excluded)"
          >
            {perClassChart ? (
              <ReactApexChart options={perClassChart.options} series={perClassChart.series} type="bar" height={380} />
            ) : (
              <EmptyState icon={<IcoActivity size={36} color="rgba(255,255,255,.18)" />} title="No per-class data" />
            )}
          </ChartPanel>

          <ChartPanel
            title="Confusion Matrix — XGBoost"
            sub="Row-normalised % · Cell label = raw count · Blue diagonal = correct classifications"
          >
            {cmHeatmap ? (
              <>
                <ReactApexChart options={cmHeatmap.options} series={cmHeatmap.series} type="heatmap" height={380} />
                {/* Color scale legend */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  {CM_RANGES.map(r => (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, background: r.color, border: `1px solid ${C.border}` }} />
                      <span style={{ fontSize: 9, color: C.textDim }}>{r.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState icon={<IcoGrid size={36} color="rgba(255,255,255,.18)" />} title="No confusion matrix data" />
            )}
          </ChartPanel>
        </div>

        {/* ── CLASSIFICATION REPORT TABLE ──────────────────────────── */}
        <SectionLabel
          action={<Badge variant="red">{classPerf.length} classes</Badge>}
          sub="XGBoost full classification report · Precision = predicted positives correct · Recall = actual positives found · F1 = harmonic mean"
        >
          Classification Report — XGBoost
        </SectionLabel>

        <div style={{ border: `1px solid ${C.border}`, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg, transparent, ${C.red}, transparent)` }} />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.025)', borderBottom: `1px solid ${C.border}` }}>
                {[
                  { label: 'Class',      icon: IcoList  },
                  { label: 'Precision',  icon: IcoSort  },
                  { label: 'Recall',     icon: IcoSort  },
                  { label: 'F1-Score',   icon: IcoSort  },
                  { label: 'Support',    icon: null     },
                ].map(({ label, icon: Icon }) => (
                  <th key={label} style={{
                    padding: '12px 16px', textAlign: 'left',
                    fontSize: 9, fontWeight: 800, letterSpacing: '1.5px',
                    textTransform: 'uppercase', color: C.textDim, whiteSpace: 'nowrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {Icon && <Icon size={10} color={C.textDim} />}
                      {label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classPerf.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: C.textMuted }}>
                    No class performance data
                  </td>
                </tr>
              ) : (
                classPerf.map((c, i) => (
                  <tr
                    key={c.class || i}
                    className="rc-table-row"
                    style={{ borderBottom: `1px solid rgba(255,255,255,.04)`, transition: 'all .15s' }}
                  >
                    <td style={{ padding: '11px 16px', fontWeight: 700, color: C.text, fontSize: 12 }}>
                      {c.class}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 700, color: C.blue, letterSpacing: '-.3px' }}>
                        {c.precision.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 700, color: C.green, letterSpacing: '-.3px' }}>
                        {c.recall.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, color: c.f1 >= 0.8 ? C.green : c.f1 >= 0.6 ? C.amber : C.redLight, letterSpacing: '-.3px' }}>
                        {c.f1.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', color: C.textDim, fontSize: 11, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600 }}>
                      {c.support.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}