// src/pages/RootCauseAnalysis.jsx
// ─────────────────────────────────────────────────────────────────────
// Root Cause Classification — Random Forest + XGBoost + SHAP
//
// FIX RC-A: EmptyState added to the UI import list.
// FIX RC-B: Duplicate `const top10` removed — only one declaration kept.
// FIX RC-C: All useMemo hooks moved ABOVE the `if (notRunYet)` early
//           return so they are always called unconditionally — React
//           Rules of Hooks requires this.
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import ReactApexChart from 'react-apexcharts'
// FIX RC-A: EmptyState added
import {
  PageHeader, SectionHeader, KpiCard, Card, ChartCard,
  Badge, Spinner, EmptyState, THEME, baseChartOptions,
} from '../components/UI'
import { analyticsApi } from '../api/client'

const C = THEME
const MODEL_COLORS     = { random_forest: '#3498DB', xgboost: '#E74C3C' }
const REPORT_META_KEYS = new Set(['accuracy', 'macro avg', 'weighted avg'])

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
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // ── FIX RC-C: ALL hooks declared here, before any conditional return ──
  // React Rules of Hooks: hooks must always be called in the same order,
  // never inside conditions or after early returns.

  const fi        = results?.feature_importance      || []
  const xgbReport = results?.xgb_report              || {}

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

  // FIX RC-B: single declaration — the duplicate `const top10` below the
  //           importanceChart definition has been removed.
  const top10 = useMemo(() => {
    if (!Array.isArray(fi) || fi.length === 0) return []
    return fi.slice(0, 10)
  }, [fi])

  // ── Early returns come AFTER all hooks ────────────────────────────
  if (loading) return <div style={{ padding: 24 }}><Spinner size={48} /></div>

  const notRunYet = !results?.best_model && !!results?.message
  if (notRunYet) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '24px 24px 48px' }}>
        <PageHeader
          title="Root Cause Classification"
          subtitle="Random Forest · XGBoost · SHAP — Identifying complaint drivers"
          badges={['Not run yet']}
        />
        <EmptyState
          icon="🔬"
          title="Classifier not run yet"
          desc={results.message || 'Execute Notebook 05 root cause classifier first, then save root_cause_results.json to models/classification/.'}
          action={
            <code style={{ background: 'rgba(255,255,255,.06)', padding: '6px 14px', borderRadius: 6, fontSize: 11, color: C.textMuted }}>
              models/classification/root_cause_results.json
            </code>
          }
        />
      </div>
    )
  }

  // ── Remaining derived values (not hooks) ──────────────────────────
  const bestModel    = results?.best_model         || 'N/A'
  const rfReport     = results?.rf_report          || {}
  const classes      = results?.classes            || []
  const confMatrices = results?.confusion_matrices || {}

  // ── Chart configs ──────────────────────────────────────────────────

  const importanceChart = top20.length > 0 ? {
    series: [{ name: 'RF + XGBoost Mean', data: top20.map(f => f.importance_mean || 0).reverse() }],
    options: {
      ...baseChartOptions,
      chart: { ...baseChartOptions.chart, type: 'bar' },
      plotOptions: { bar: { horizontal: true, borderRadius: 3, distributed: true } },
      colors: top20.map((_, i) => i < 5 ? '#E74C3C' : '#3498DB').reverse(),
      xaxis: {
        categories: top20.map(f => f.feature_label).reverse(),
        labels: { style: { fontSize: '10px' } },
      },
      dataLabels: { enabled: true, style: { fontSize: '9px', colors: ['#fff'] }, formatter: v => v.toFixed(3) },
      legend: { show: false },
    },
  } : null

  const rfVsXgbChart = top10.length > 0 ? {
    series: [
      { name: 'Random Forest', data: top10.map(f => f.importance_rf  || 0) },
      { name: 'XGBoost',       data: top10.map(f => f.importance_xgb || 0) },
    ],
    options: {
      ...baseChartOptions,
      chart: { ...baseChartOptions.chart, type: 'bar' },
      colors: [MODEL_COLORS.random_forest, MODEL_COLORS.xgboost],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 2 } },
      xaxis: {
        categories: top10.map(f => (f.feature || '').replace(/_/g, ' ').substring(0, 18)),
        labels: { rotate: -35, style: { fontSize: '9px', colors: C.textMuted } },
      },
      dataLabels: { enabled: false },
      legend: { position: 'top' },
    },
  } : null

  const perClassChart = classPerf.length > 0 ? {
    series: [{ name: 'F1-Score', data: classPerf.map(c => c.f1) }],
    options: {
      ...baseChartOptions,
      chart: { ...baseChartOptions.chart, type: 'bar' },
      plotOptions: { bar: { horizontal: true, borderRadius: 3, distributed: true } },
      colors: ['#E74C3C', '#F39C12', '#2ECC71', '#3498DB', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E'],
      xaxis: { categories: classPerf.map(c => c.class), labels: { style: { fontSize: '10px' } } },
      dataLabels: { enabled: true, style: { fontSize: '9px', colors: ['#fff'] }, formatter: v => v.toFixed(2) },
      legend: { show: false },
      yaxis: { max: 1.0 },
    },
  } : null

  const cmXgb = confMatrices?.xgboost
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
        chart: { ...baseChartOptions.chart, type: 'heatmap' },
        plotOptions: {
          heatmap: {
            radius: 3,
            colorScale: { ranges: [
              { from: 0,  to: 10,  color: '#DBEAFE', name: 'Low'       },
              { from: 10, to: 30,  color: '#93C5FD', name: 'Medium'    },
              { from: 30, to: 60,  color: '#3B82F6', name: 'High'      },
              { from: 60, to: 80,  color: '#1D4ED8', name: 'Very High' },
              { from: 80, to: 100, color: '#1E3A5F', name: 'Dominant'  },
            ] },
          },
        },
        dataLabels: {
          enabled: true,
          style: { fontSize: '9px', colors: ['#fff'] },
          formatter: (v, { seriesIndex: si, dataPointIndex: di }) => String(cmXgb[si][di]),
        },
        xaxis: { labels: { style: { fontSize: '9px' }, rotate: -25 }, position: 'top' },
        yaxis: { labels: { style: { fontSize: '10px', colors: C.textMuted } } },
      },
    }
  })() : null

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <div style={{ padding: '24px 24px 48px' }}>

        <PageHeader
          title="Root Cause Classification"
          subtitle="Random Forest · XGBoost · SHAP — Identifying complaint drivers"
          badges={[bestModel.toUpperCase(), `${classes.length} Classes`, 'SHAP', apiOnline ? 'Live' : 'Offline']}
        />

        {error && (
          <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: 12, marginBottom: 20, fontSize: 12, color: '#FCD34D' }}>
            {error}
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Best Model"   value={bestModel.toUpperCase()}                                                                                              color={bestModel === 'xgboost' ? C.red : C.blue} icon="🏆" />
          <KpiCard label="RF Accuracy"  value={rfReport?.accuracy   != null ? rfReport.accuracy.toFixed(3)                                                  : 'N/A'} color={MODEL_COLORS.random_forest}              icon="📊" />
          <KpiCard label="XGB Accuracy" value={xgbReport?.accuracy  != null ? xgbReport.accuracy.toFixed(3)                                                 : 'N/A'} color={MODEL_COLORS.xgboost}                   icon="📈" />
          <KpiCard label="XGB F1-Macro" value={xgbReport?.f1_macro  != null ? xgbReport.f1_macro.toFixed(3)                                                 : 'N/A'} color={C.green}                                icon="🎯" />
          <KpiCard label="RF CV F1"     value={rfReport?.cv_f1_mean  != null ? `${rfReport.cv_f1_mean.toFixed(3)} ±${rfReport.cv_f1_std?.toFixed(3)  || '?'}` : 'N/A'} color={MODEL_COLORS.random_forest}          icon="🔄" />
          <KpiCard label="XGB CV F1"    value={xgbReport?.cv_f1_mean != null ? `${xgbReport.cv_f1_mean.toFixed(3)} ±${xgbReport.cv_f1_std?.toFixed(3) || '?'}` : 'N/A'} color={MODEL_COLORS.xgboost}             icon="✅" />
          <KpiCard label="Classes"      value={classes.length}                                                                                                       color={C.purple}                               icon="📋" />
          <KpiCard label="Top Features" value={fi.length || 0}                                                                                                       color={C.amber}                                icon="🔍" />
        </div>

        {/* ── Feature importance charts ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <SectionHeader>Feature Importance (Mean)</SectionHeader>
            <ChartCard subtitle="Top 20 features — RF + XGBoost average">
              {importanceChart
                ? <ReactApexChart options={importanceChart.options} series={importanceChart.series} type="bar" height={400} />
                : <EmptyState icon="📊" title="No feature importance data" />
              }
            </ChartCard>
          </div>
          <div>
            <SectionHeader>RF vs XGBoost</SectionHeader>
            <ChartCard subtitle="Top 10 features — side-by-side comparison">
              {rfVsXgbChart
                ? <ReactApexChart options={rfVsXgbChart.options} series={rfVsXgbChart.series} type="bar" height={400} />
                : <EmptyState icon="⚖️" title="No comparison data" />
              }
            </ChartCard>
          </div>
        </div>

        {/* ── Per-class chart + confusion matrix ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, marginBottom: 24 }}>
          <div>
            <SectionHeader>Per-Class F1 Scores</SectionHeader>
            <ChartCard subtitle="XGBoost — true per-class rows only">
              {perClassChart
                ? <ReactApexChart options={perClassChart.options} series={perClassChart.series} type="bar" height={380} />
                : <EmptyState icon="📉" title="No per-class data" />
              }
            </ChartCard>
          </div>
          <div>
            <SectionHeader>Confusion Matrix</SectionHeader>
            <ChartCard subtitle="XGBoost — row normalised % (raw count in cell)">
              {cmHeatmap
                ? <ReactApexChart options={cmHeatmap.options} series={cmHeatmap.series} type="heatmap" height={380} />
                : <EmptyState icon="🟦" title="No confusion matrix data" />
              }
            </ChartCard>
          </div>
        </div>

        {/* ── Classification report table ── */}
        <SectionHeader>
          Classification Report — XGBoost
          <span style={{ marginLeft: 12 }}><Badge variant="red">{classPerf.length} classes</Badge></span>
        </SectionHeader>
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,.03)', borderBottom: `1px solid ${C.border}` }}>
                {['Class', 'Precision', 'Recall', 'F1-Score', 'Support'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: C.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classPerf.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>No class performance data</td>
                </tr>
              ) : (
                classPerf.map((c, i) => (
                  <tr key={c.class || i} style={{ borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px', color: C.text,    fontWeight: 600 }}>{c.class}</td>
                    <td style={{ padding: '10px 14px', color: C.blue,    fontFamily: 'monospace', fontSize: 10, fontWeight: 600 }}>{c.precision.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', color: C.green,   fontFamily: 'monospace', fontSize: 10, fontWeight: 600 }}>{c.recall.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', color: C.red,     fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}>{c.f1.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', color: C.textMuted, fontSize: 10 }}>{c.support}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        {/* ── Top 5 features ── */}
        {top20.length > 0 && (
          <>
            <SectionHeader>Top 5 Most Important Features</SectionHeader>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
              {top20.slice(0, 5).map((f, i) => (
                <Card key={i} style={{ borderTop: `2px solid ${i < 3 ? C.red : C.blue}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>#{i + 1}</div>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 700, marginBottom: 8, wordBreak: 'break-word' }}>{f.feature_label}</div>
                  <div style={{ fontSize: 10, color: C.textMuted }}>
                    Mean: <span style={{ color: C.red, fontWeight: 700, fontFamily: 'monospace' }}>{f.importance_mean?.toFixed(4)}</span>
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim, marginTop: 4 }}>
                    RF {f.importance_rf?.toFixed(4) || '—'} · XGB {f.importance_xgb?.toFixed(4) || '—'}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}