// src/pages/Forecasting.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC Dashboard — Forecasting & Churn Intelligence (v2)
//
// DATA SOURCES (KPI dataset — Dataset 2):
//   /api/churn/model-summary · /api/churn/high-risk · /api/churn/shap
//   /api/forecast/5g · /api/forecast/brand · /api/coverage/5g
//
// MIGRATION (vs previous version):
//  FC-1  Duplicated HW / RISK / gapColor / SectionLabel / StatBlock /
//        ChartPanel removed — imported from components/UI. No T prop
//        drilling. fc-* keyframes/hover classes replaced by
//        <NocBaseStyles/> classes (noc-stat / noc-panel).
//  FC-2  RISK ladder mapped onto ALARM tokens — churn risk IS a
//        severity scale: CRITICAL→critical, HIGH→major, MEDIUM→minor,
//        LOW→normal. The same ladder drives the donut, the probability
//        histogram deciles, RiskBar, and the table chips, so every
//        surface agrees on what each color means.
//  FC-3  Red discipline elsewhere: SHAP importance is magnitude →
//        blueRamp (was red/amber by size); brand bars → blueRamp
//        (was 12-color rainbow); group contribution → blue (a share
//        is not an alarm); table hover → neutral; forecast line →
//        blueLight dashed (a forecast is not an alarm); hero pill →
//        blue identity chrome; "Churned" hero badge → ALARM.critical.
//  FC-4  Live data vs training facts separated. Counts, churn rate,
//        threshold, SHAP feature count, and subtitles now derive from
//        modelSummary / shapResults. Numbers that are properties of a
//        TRAINING RUN (MAPE/R² of NB02 models, churn-def quantiles)
//        live in one TRAINING constant, clearly labeled "update on
//        retrain" — not scattered through JSX pretending to be live.
//  FC-5  ✓/✗ glyphs → Lucide Check/X. Typography floor ≥10px for
//        data-bearing labels. Forecast markers stroke → T.bgCard.
//  FC-6  Error banner → AlertBanner. isPrimary derives from
//        best_model (was hardcoded to LR).

// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation }  from 'react-i18next'
import ReactApexChart      from 'react-apexcharts'
import {
  Users, AlertTriangle, TrendingUp, Activity,
  Shield, BarChart3, RefreshCw, Radio, Star, Check, X,
} from 'lucide-react'

import {
  HW, ALARM, FONT, gapColor, gridLine, blueRamp,
  SectionLabel, StatBlock, ChartPanel, GapGrid,
  AlertBanner, Badge, Spinner, EmptyState, baseChartOptions,
  sevDim, sevBd,
} from '../components/UI'
import { useTheme }              from '../context/ThemeContext'
import { analyticsApi }          from '../api/client'
import BrandPerformanceSection   from '../components/BrandPerformance'
import Coverage5GSection         from '../components/Coverage5GSection'

// ── FC-2: churn risk IS severity — one ladder everywhere ─────────────
const RISK = {
  CRITICAL: { color: ALARM.critical, label: 'CRITICAL' },
  HIGH:     { color: ALARM.major,    label: 'HIGH'     },
  MEDIUM:   { color: ALARM.minor,    label: 'MEDIUM'   },
  LOW:      { color: ALARM.normal,   label: 'LOW'      },
}

// ── FC-4: facts of the NB02/NB03 TRAINING RUNS — not live data. ──────
// Update when models are retrained; everything else derives from the
// API at runtime.
const TRAINING = {
  forecastModels: [
    { label: 'XGBoost MAPE', value: '1.49%',  color: HW.blue,      sub: 'Primary'    },
    { label: 'XGBoost R²',   value: '0.9873', color: ALARM.normal, sub: 'Excellent'  },
    { label: 'ARIMA MAPE',   value: '16.56%', color: ALARM.normal, sub: 'Target met' },
    { label: 'Prophet MAPE', value: '26.28%', color: ALARM.minor,  sub: 'Above 20%'  },
  ],
  churnDef: [
    { label: 'C1 — Low Data Usage', metric: 'dou_total ≤ 1.26 MB (Q20)', count: '980 subs (20.0%)' },
    { label: 'C2 — Short Duration', metric: 'duration ≤ 127 s (Q20)',    count: '984 subs (20.1%)' },
  ],
  bothCriteria: 194,
  targets: { accuracy: 0.80, f1: 0.72, auc: 0.85 },
}

// ══════════════════════════════════════════════════════════════════════
// Page-local: risk progress bar (shares the RISK ladder)
// ══════════════════════════════════════════════════════════════════════
const RiskBar = ({ probability, level }) => {
  const { theme: T } = useTheme()
  const { color } = RISK[level] || RISK.MEDIUM
  const pct = Math.round((probability || 0) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, overflow: 'hidden',
        background: T.mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color,
          borderRadius: 2, transition: 'width .6s ease' }}/>
      </div>
      <span style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: 800,
        color, minWidth: 40, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
export default function Forecasting() {
  const { t }        = useTranslation()
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)
  const base         = useMemo(() => baseChartOptions(T), [T])

  const [modelSummary,  setModelSummary]  = useState(null)
  const [churnScores,   setChurnScores]   = useState([])
  const [shapResults,   setShapResults]   = useState(null)
  const [forecast5g,    setForecast5g]    = useState([])
  const [brandForecast, setBrandForecast] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [refreshing,    setRefreshing]    = useState(false)

  const fetchData = useCallback(async (background = false) => {
    try {
      setError(null)
      background ? setRefreshing(true) : setLoading(true)

      const [modelRes, scoresRes, shapRes, fg5gRes, brandRes] = await Promise.allSettled([
        analyticsApi.churnModelSummary(),
        analyticsApi.churnHighRisk(),
        analyticsApi.churnShap(),
        analyticsApi.forecast5g(),
        analyticsApi.forecastBrand(),
      ])

      if (modelRes.status  === 'fulfilled') setModelSummary(modelRes.value.data)
      if (scoresRes.status === 'fulfilled') setChurnScores(scoresRes.value.data?.customers || [])
      if (shapRes.status   === 'fulfilled') setShapResults(shapRes.value.data)
      if (fg5gRes.status   === 'fulfilled') setForecast5g(fg5gRes.value.data?.series || [])
      if (brandRes.status  === 'fulfilled') setBrandForecast(brandRes.value.data?.brands || [])
    } catch (err) {
      console.error('Forecasting fetch error:', err)
      setError(t('forecast.connectionError') || 'API connection failed')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    fetchData(false)
    const interval = setInterval(() => fetchData(true), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  // ── Derived (FC-4: live values from the API) ──────────────────────
  const totalCustomers = modelSummary?.n_customers    || 0
  const totalChurned   = modelSummary?.n_churned      || 0
  const churnRatePct   = modelSummary?.churn_rate_pct || 0
  const nHighRisk      = modelSummary?.n_high_risk    || 0
  const bestModel      = modelSummary?.best_model     || 'logistic_regression'
  const bestModelLabel = bestModel.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const bestThreshold  = modelSummary?.models?.[bestModel]?.threshold
  const nTest          = modelSummary?.n_test

  const highRiskRows = useMemo(() =>
    [...churnScores]
      .filter(c => (c.churn_probability || 0) >= 0.50)
      .sort((a, b) => (b.churn_probability || 0) - (a.churn_probability || 0))
      .slice(0, 15),
    [churnScores]
  )

  const riskDist = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    churnScores.forEach(c => { if (counts[c.risk_level] !== undefined) counts[c.risk_level]++ })
    return counts
  }, [churnScores])

  const shapDrivers = useMemo(() => {
    const raw = shapResults?.shap_importance_lr || shapResults?.churn_profile || []
    return raw
      .filter(d => (d.mean_abs_shap != null || d.difference != null))
      .sort((a, b) => (b.mean_abs_shap || Math.abs(b.difference) || 0)
                    - (a.mean_abs_shap || Math.abs(a.difference) || 0))
      .slice(0, 10)
  }, [shapResults])

  const shapFeatureCount = shapResults?.shap_importance_lr?.length
                        || shapResults?.churn_profile?.length || 0

  const churnTrend = useMemo(() => {
    if (churnScores.length === 0) return []
    return Array.from({ length: 10 }, (_, i) => {
      const lo = i / 10, hi = (i + 1) / 10
      return {
        label: `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`,
        count: churnScores.filter(c =>
          (c.churn_probability || 0) >= lo && (c.churn_probability || 0) < hi).length,
      }
    })
  }, [churnScores])

  const avgRiskScore = useMemo(() => {
    if (churnScores.length === 0) return 0
    return ((churnScores.reduce((s, c) => s + (c.churn_probability || 0), 0)
      / churnScores.length) * 100).toFixed(1)
  }, [churnScores])

  // ── Chart configs ─────────────────────────────────────────────────
  // Donut — FC-2: ALARM ladder
  const riskDonutChart = useMemo(() => ({
    series: [riskDist.CRITICAL, riskDist.HIGH, riskDist.MEDIUM, riskDist.LOW],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'donut' },
      labels: ['Critical', 'High', 'Medium', 'Low'],
      colors: [RISK.CRITICAL.color, RISK.HIGH.color, RISK.MEDIUM.color, RISK.LOW.color],
      stroke: { width: 2, colors: [T.bgCard] },
      plotOptions: { pie: { donut: { size: '70%', labels: {
        show: true,
        name:  { fontSize: '11px', color: T.textMuted, offsetY: -6 },
        value: { fontFamily: FONT.display, fontSize: '30px', fontWeight: 900,
          color: T.text, offsetY: 4, formatter: v => `${v}` },
        total: { show: true, label: t('forecast.customers') || 'Customers',
          fontSize: '10px', color: T.textMuted,
          formatter: () => String(churnScores.length || totalCustomers) },
      } } } },
      legend: { position: 'bottom', horizontalAlign: 'center', fontSize: '11px',
        labels: { colors: T.textMuted }, itemMargin: { horizontal: 8, vertical: 4 } },
      dataLabels: { enabled: false },
      tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v.toLocaleString()} customers` } },
    },
  }), [riskDist, base, T, t, churnScores.length, totalCustomers])

  // Probability histogram — FC-2: same ladder by decile
  const churnDistChart = useMemo(() => ({
    series: [{ name: t('forecast.customers') || 'Customers',
      data: churnTrend.map(b => b.count) }],
    options: {
      ...base,
      chart:  { ...base.chart, type: 'bar' },
      colors: churnTrend.map((_, i) => {
        const hi = (i + 1) / 10
        if (hi > 0.75) return RISK.CRITICAL.color
        if (hi > 0.50) return RISK.HIGH.color
        if (hi > 0.25) return RISK.MEDIUM.color
        return RISK.LOW.color
      }),
      plotOptions: { bar: { columnWidth: '80%', borderRadius: 0, distributed: true } },
      xaxis: { categories: churnTrend.map(b => b.label),
        title: { text: t('forecast.churnProbBucket') || 'Churn Probability',
          style: { fontSize: '10px', color: T.textDim } },
        labels: { style: { fontSize: '9px', colors: T.textMuted } },
        axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { title: { text: t('forecast.customerCount') || 'Customers',
          style: { fontSize: '10px', color: T.textMuted } },
        labels: { style: { fontSize: '10px', colors: T.textMuted } } },
      legend: { show: false },
      dataLabels: { enabled: false },
      grid: { borderColor: gridLine(T), strokeDashArray: 3 },
      tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
        y: { formatter: v => `${v} customers` } },
    },
  }), [churnTrend, base, T, t])

  // SHAP — FC-3: importance is magnitude → blueRamp
  const shapChart = useMemo(() => {
    if (shapDrivers.length === 0) return null
    const vals = shapDrivers.map(d =>
      parseFloat((d.mean_abs_shap || Math.abs(d.difference) || 0).toFixed(4)))
    const labels = shapDrivers.map(d => (d.feature || '').replace(/_/g, ' '))
    return {
      series: [{ name: t('forecast.shapImpact') || 'SHAP Impact', data: vals }],
      options: {
        ...base,
        chart:  { ...base.chart, type: 'bar' },
        colors: vals.map((_, i) => blueRamp(i)),
        plotOptions: { bar: { horizontal: true, borderRadius: 0, barHeight: '55%',
          distributed: true, dataLabels: { position: 'top' } } },
        xaxis: { categories: labels,
          labels: { style: { fontSize: '11px', colors: T.textMuted } },
          axisBorder: { show: false }, axisTicks: { show: false },
          title: { text: t('forecast.meanAbsShap') || 'Mean |SHAP Value|',
            style: { fontSize: '10px', color: T.textDim } } },
        yaxis: { labels: { style: { fontSize: '10px', colors: T.textMuted }, maxWidth: 170 } },
        dataLabels: { enabled: true, textAnchor: 'start', offsetX: 8,
          style: { fontSize: '10px', fontWeight: 600, colors: [T.text] },
          formatter: v => v.toFixed(3) },
        legend: { show: false },
        grid: { xaxis: { lines: { show: false } },
          yaxis: { lines: { show: true, strokeDashArray: 3 } } },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `SHAP: ${v.toFixed(4)}` } },
      },
    }
  }, [shapDrivers, base, T, t])

  // 5G forecast — FC-3: forecast is projection, not alarm → blueLight
  const fiveGChart = useMemo(() => {
    if (forecast5g.length === 0) return null
    const hist = forecast5g.filter(d => !d.is_forecast && d.type !== 'forecast')
    const pred = forecast5g.filter(d =>  d.is_forecast || d.type === 'forecast')
    return {
      series: [
        { name: t('forecast.historicalSeries') || 'Historical 5G', type: 'area',
          data: hist.map(d => ({ x: d.date || d.ds, y: d.value || d.y || d.yhat })) },
        { name: t('forecast.forecastSeries') || '30-Day Forecast', type: 'line',
          data: pred.map(d => ({ x: d.date || d.ds, y: d.value || d.yhat })) },
      ],
      options: {
        ...base,
        chart:  { ...base.chart, type: 'line', stacked: false },
        colors: [HW.blue, HW.blueLight],
        stroke: { curve: ['smooth', 'smooth'], width: [2, 2.5], dashArray: [0, 6] },
        markers: { size: [0, 5], strokeWidth: [0, 2],
          strokeColors: ['transparent', T.bgCard], hover: { size: 7 } },   // FC-5
        fill: { type: ['gradient', 'solid'],
          gradient: { shade: 'dark', type: 'vertical', gradientToColors: ['transparent'],
            opacityFrom: 0.2, opacityTo: 0.01, stops: [0, 90] } },
        xaxis: { type: 'datetime',
          labels: { format: 'dd MMM', style: { fontSize: '10px', colors: T.textMuted } },
          axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { title: { text: t('forecast.trafficLog') || 'Traffic (log1p)',
            style: { fontSize: '10px', color: T.textMuted, fontWeight: 400 } },
          labels: { style: { fontSize: '10px', colors: T.textMuted },
            formatter: v => v?.toFixed(1) } },
        legend: { position: 'top', horizontalAlign: 'left',
          labels: { colors: T.textMuted }, markers: { radius: 2 },
          itemMargin: { horizontal: 16 } },
        grid: { borderColor: gridLine(T), strokeDashArray: 3 },
        tooltip: { shared: false, x: { format: 'dd MMM yyyy' },
          y: { formatter: v => `${v?.toFixed(2)} (log1p)` } },
      },
    }
  }, [forecast5g, base, T, t])

  // Brand bars — FC-3: rainbow → blueRamp (pre-sorted desc)
  const brandChart = useMemo(() => {
    if (brandForecast.length === 0) return null
    const sorted = [...brandForecast]
      .sort((a, b) => (b.forecast || b.traffic || 0) - (a.forecast || a.traffic || 0))
      .slice(0, 12)
    return {
      series: [{ name: t('forecast.forecastTraffic') || 'Forecast Traffic',
        data: sorted.map(b => b.forecast || b.traffic || 0) }],
      options: {
        ...base,
        chart:  { ...base.chart, type: 'bar' },
        colors: sorted.map((_, i) => blueRamp(i)),
        plotOptions: { bar: { columnWidth: '65%', borderRadius: 0, distributed: true } },
        xaxis: { categories: sorted.map(b => b.brand || b.name || ''),
          labels: { rotate: -35, style: { fontSize: '10px', fontFamily: FONT.display,
            colors: T.textMuted, fontWeight: 600 } },
          axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { title: { text: t('forecast.trafficLog') || 'Traffic (log1p)',
            style: { fontSize: '10px', color: T.textMuted } },
          labels: { style: { fontSize: '10px', colors: T.textMuted },
            formatter: v => v?.toFixed(1) } },
        dataLabels: { enabled: false },
        legend: { show: false },
        grid: { borderColor: gridLine(T), strokeDashArray: 3 },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `${v?.toFixed(2)} (log1p)` } },
      },
    }
  }, [brandForecast, base, T, t])

  const kpiTiles = useMemo(() => [
    { label: t('forecast.totalCustomers') || 'Total Customers',
      value: totalCustomers.toLocaleString(), color: HW.blue, icon: Users,
      sub: t('forecast.kpiNetworkSub') || 'KPI network base' },
    { label: t('forecast.highRiskCount') || 'High-Risk Customers',
      value: nHighRisk.toLocaleString(), color: ALARM.critical, icon: AlertTriangle,
      alert: nHighRisk > 0,
      sub: `${((nHighRisk / Math.max(totalCustomers, 1)) * 100).toFixed(1)}% of base` },
    { label: t('forecast.churnRate') || 'Churn Rate',
      value: churnRatePct.toFixed(1), unit: '%', color: ALARM.major, icon: TrendingUp,
      sub: t('forecast.kpiChurnSub') || 'DOU OR Duration ≤ Q20' },
    { label: t('forecast.avgRiskScore') || 'Avg Risk Score',
      value: avgRiskScore, unit: '%', color: HW.blue, icon: Shield,
      sub: `Primary: ${bestModelLabel}` },
  ], [totalCustomers, nHighRisk, churnRatePct, avgRiskScore, bestModelLabel, t])

  const modelCards = useMemo(() => [
    { label: 'Logistic Regression', metrics: modelSummary?.models?.logistic_regression,
      color: HW.blue, isPrimary: bestModel === 'logistic_regression' },
    { label: 'Random Forest', metrics: modelSummary?.models?.random_forest,
      color: '#8B5CF6', isPrimary: bestModel === 'random_forest' },
    { label: 'XGBoost', metrics: modelSummary?.models?.xgboost,
      color: '#14B8A6', isPrimary: bestModel === 'xgboost' },
  ], [modelSummary, bestModel])

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: HW.blue,
          display: 'inline-block', animation: 'noc-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
          textTransform: 'uppercase', color: HW.blue }}>
          {t('common.loading') || 'Loading Churn Intelligence'}
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
        .fc-risk-row:hover td { background:${T.bgCardHover}!important; }
      `}</style>

      <div style={{ padding: '36px 44px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ══ HERO HEADER ════════════════════════════════════════════ */}
        <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 24, marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            {/* FC-3: section identity chrome → blue, not red */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7,
              background: HW.blueDim, border: `1px solid ${HW.blueBd}`,
              padding: '5px 13px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: HW.blue,
                display: 'inline-block', animation: 'noc-pulse 2s ease-in-out infinite' }}/>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
                textTransform: 'uppercase', color: HW.blue }}>
                {t('forecast.liveBadge') || 'CHURN INTELLIGENCE'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '1.5px' }}>
              Huawei Technologies Tunisia — KPI Dataset · Churn v5
            </span>
            {refreshing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 6 }}>
                <RefreshCw size={11} color={T.textDim}
                  style={{ animation: 'noc-spin .9s linear infinite' }}/>
                <span style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.5px',
                  textTransform: 'uppercase' }}>
                  {t('overview.refreshing') || 'Refreshing'}
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              {/* The ONE brand-red element on this page */}
              <h1 style={{ fontFamily: FONT.display,
                fontSize: 'clamp(26px, 3.5vw, 52px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: T.text, marginBottom: 8 }}>
                {t('forecast.titleShort') || 'CHURN'}{' '}
                <span style={{ color: HW.red, fontStyle: 'italic' }}>
                  {t('forecast.titleAccent') || 'FORECASTING'}
                </span>
              </h1>
              <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 300,
                letterSpacing: '.3px' }}>
                {t('forecast.subtitle') ||
                  'Churn risk prediction · SHAP drivers · 5G adoption forecast · Brand performance'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: `${totalChurned.toLocaleString()} ${t('forecast.churned') || 'Churned'}`,
                  color: ALARM.critical, bd: sevBd(ALARM.critical), bg: sevDim(ALARM.critical, '0E') },
                { label: `${totalCustomers.toLocaleString()} ${t('forecast.customers') || 'Total'}`,
                  color: T.textMuted, bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: `${nHighRisk.toLocaleString()} ${t('forecast.atRisk') || 'At Risk'}`,
                  color: ALARM.major, bd: sevBd(ALARM.major), bg: sevDim(ALARM.major, '0E') },
                { label: bestModelLabel,
                  color: ALARM.normal, bd: sevBd(ALARM.normal), bg: sevDim(ALARM.normal, '0E') },
              ].map((b, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 800,
                  letterSpacing: '1.5px', textTransform: 'uppercase',
                  padding: '5px 13px', border: `1px solid ${b.bd}`,
                  background: b.bg, color: b.color,
                  display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Error banner — FC-6 */}
        {error && (
          <AlertBanner severity="minor" icon={AlertTriangle}
            title={t('common.error') || 'ERROR'}
            message={`${error} — ${t('forecast.demoMode') || 'displaying empty state placeholders'}`}/>
        )}

        {/* ══ §1. KPI TILES ══════════════════════════════════════════ */}
        <SectionLabel
          action={<Badge variant="blue">{t('forecast.churnDefV5') || 'Churn v5'}</Badge>}
          sub={`dou_total OR duration ≤ Q20 · ${totalCustomers.toLocaleString()} KPI subscribers · ${bestModelLabel} primary model`}>
          {t('forecast.kpiSection') || 'CHURN RISK OVERVIEW'}
        </SectionLabel>

        <GapGrid columns="repeat(4,1fr)">
          {kpiTiles.map((kpi, i) => <StatBlock key={i} {...kpi}/>)}
        </GapGrid>

        {/* ══ §2. MODEL PERFORMANCE ══════════════════════════════════ */}
        <SectionLabel
          sub={`Chronological 80/20 split${nTest ? ` · ${nTest.toLocaleString()} test customers` : ''} · Targets: Acc>${TRAINING.targets.accuracy * 100}% F1>${TRAINING.targets.f1 * 100}% AUC>${TRAINING.targets.auc * 100}%`}>
          {t('forecast.modelSection') || 'MODEL PERFORMANCE'}
        </SectionLabel>

        <GapGrid columns="repeat(3,1fr)">
          {modelCards.map(({ label, metrics, color, isPrimary }) => (
            <div key={label} className="noc-stat" style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderTop: `2px solid ${color}`, padding: '20px 22px',
              position: 'relative', overflow: 'hidden',
            }}>
              {isPrimary && (
                <div style={{ position: 'absolute', top: 10, right: 12,
                  display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Star size={9} color={HW.blue}/>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px',
                    color: HW.blue, textTransform: 'uppercase' }}>
                    {t('forecast.primaryModel') || 'Primary'}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }}/>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Accuracy', value: metrics?.accuracy, target: TRAINING.targets.accuracy },
                  { label: 'F1-Score', value: metrics?.f1,       target: TRAINING.targets.f1 },
                  { label: 'AUC-ROC',  value: metrics?.auc_roc,  target: TRAINING.targets.auc },
                ].map(({ label: ml, value, target }) => {
                  const good = value != null && value > target
                  return (
                    <div key={ml}>
                      <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.5px',
                        textTransform: 'uppercase', marginBottom: 4 }}>{ml}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span style={{ fontFamily: FONT.display, fontSize: 22,
                          fontWeight: 800,
                          color: value != null
                            ? (good ? ALARM.normal : ALARM.minor) : T.textDim }}>
                          {value != null ? (value * 100).toFixed(1) : '—'}
                        </span>
                        {value != null && <span style={{ fontSize: 9, color: T.textDim }}>%</span>}
                      </div>
                      {/* FC-5: Lucide instead of ✓/✗ glyphs */}
                      <div style={{ fontSize: 9, color: T.textDim, marginTop: 2,
                        display: 'flex', alignItems: 'center', gap: 3 }}>
                        target {(target * 100).toFixed(0)}%
                        {value != null && (good
                          ? <Check size={9} color={ALARM.normal}/>
                          : <X size={9} color={ALARM.minor}/>)}
                      </div>
                    </div>
                  )
                })}
              </div>
              {metrics?.threshold != null && (
                <div style={{ marginTop: 12, paddingTop: 10,
                  borderTop: `1px solid ${T.border}`, display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.5px',
                    textTransform: 'uppercase' }}>
                    {t('forecast.optThreshold') || 'Opt. Threshold'}
                  </span>
                  <span style={{ fontFamily: FONT.display, fontSize: 16,
                    fontWeight: 800, color }}>
                    {metrics.threshold.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </GapGrid>

        {/* ══ §3. RISK DISTRIBUTION ══════════════════════════════════ */}
        <SectionLabel
          sub={t('forecast.riskSub') || 'CRITICAL ≥75% · HIGH ≥50% · MEDIUM ≥25% · LOW <25%'}>
          {t('forecast.riskSection') || 'RISK DISTRIBUTION'}
        </SectionLabel>

        <GapGrid columns="1fr 1.4fr">
          <ChartPanel
            title={t('forecast.riskDonutTitle') || 'Customers by Risk Level'}
            sub={`${(riskDist.CRITICAL + riskDist.HIGH).toLocaleString()} ${t('forecast.requireAction') || 'require immediate action'}`}>
            <ReactApexChart options={riskDonutChart.options}
              series={riskDonutChart.series} type="donut" height={260}/>
          </ChartPanel>

          <ChartPanel
            title={t('forecast.churnProbDist') || 'Churn Probability Distribution'}
            sub={t('forecast.churnProbSub') || 'Number of customers per probability decile'}>
            {churnTrend.length > 0 ? (
              <ReactApexChart options={churnDistChart.options}
                series={churnDistChart.series} type="bar" height={340}/>
            ) : (
              <EmptyState icon={Activity}
                title={t('forecast.noScores') || 'No score data'}
                desc={t('forecast.noScoresDesc') || 'Run NB05 to generate churn_scores.parquet'}/>
            )}
          </ChartPanel>
        </GapGrid>

        {/* ══ §4. CHURN DRIVERS (SHAP) ═══════════════════════════════ */}
        <SectionLabel
          action={<Badge variant="blue">
            {`LR SHAP${shapFeatureCount ? ` · ${shapFeatureCount} features` : ''}`}
          </Badge>}
          sub={`Mean |SHAP| — ${bestModelLabel} primary model${totalCustomers ? ` · ${totalCustomers.toLocaleString()} customers explained` : ''} · NB06`}>
          {t('forecast.shapSection') || 'CHURN DRIVERS'}
        </SectionLabel>

        <ChartPanel
          title={t('forecast.shapTitle') || `Top Features by SHAP Importance (${bestModelLabel})`}
          sub={t('forecast.shapPanelSub') || 'Higher value = stronger average impact on churn prediction'}>
          {shapChart ? (
            <ReactApexChart options={shapChart.options} series={shapChart.series}
              type="bar" height={380}/>
          ) : (
            <EmptyState icon={BarChart3}
              title={t('forecast.noShap') || 'SHAP data unavailable'}
              desc={t('forecast.noShapDesc') || 'Run NB06 and expose /api/churn/shap endpoint'}/>
          )}
          {shapResults?.group_contribution_lr?.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textDim,
                letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>
                {t('forecast.groupContrib') || 'CONTRIBUTION BY FEATURE GROUP'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {shapResults.group_contribution_lr.map(g => (
                  <div key={g.group} style={{ display: 'flex', alignItems: 'center', gap: 7,
                    background: T.mode === 'dark' ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.03)',
                    padding: '6px 12px' }}>
                    <span style={{ fontSize: 10, color: T.textDim, letterSpacing: '1px' }}>
                      {(g.group || '').replace('_', ' ')}
                    </span>
                    {/* FC-3: a share is not an alarm */}
                    <span style={{ fontFamily: FONT.display, fontSize: 16,
                      fontWeight: 800, color: HW.blue }}>
                      {(g.contribution_pct || 0).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartPanel>

        {/* ══ §5. HIGH-RISK CUSTOMER TABLE ═══════════════════════════ */}
        <SectionLabel
          action={<Badge variant="critical">
            {highRiskRows.length} {t('forecast.customers') || 'customers'}
          </Badge>}
          sub={`P(churn) ≥ 50% · sorted by risk score · ${bestModelLabel} primary${bestThreshold != null ? ` · threshold ${bestThreshold.toFixed(2)}` : ''}`}>
          {t('forecast.tableSection') || 'HIGH-RISK CUSTOMERS'}
        </SectionLabel>

        <div style={{ border: `1px solid ${T.border}`, overflow: 'hidden',
          position: 'relative' }}>
          {/* Panel accent — chrome, not alarm */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
            background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse',
              fontSize: 11, minWidth: 700 }}>
              <thead>
                <tr style={{ background: T.mode === 'dark'
                    ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.04)',
                  borderBottom: `1px solid ${T.border}` }}>
                  {[
                    t('forecast.thMsisdn')  || 'MSISDN',
                    t('forecast.thRisk')    || 'RISK',
                    t('forecast.thProb')    || 'CHURN PROBABILITY',
                    t('forecast.thRatio5g') || 'RATIO 5G',
                    t('forecast.thTraffic') || '5G TRAFFIC',
                    t('forecast.thActual')  || 'ACTUAL',
                  ].map(label => (
                    <th key={label} style={{ padding: '11px 14px', textAlign: 'left',
                      fontSize: 10, fontWeight: 800, letterSpacing: '1.5px',
                      textTransform: 'uppercase', color: T.textDim,
                      whiteSpace: 'nowrap' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {highRiskRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 48, textAlign: 'center',
                      color: T.textMuted }}>
                      <div style={{ marginBottom: 10 }}>
                        <Shield size={26} color={T.textDim}/>
                      </div>
                      {t('forecast.noHighRisk') ||
                        'No high-risk data — ensure /api/churn/high-risk returns churn_scores.parquet'}
                    </td>
                  </tr>
                ) : highRiskRows.map((customer, i) => {
                  const prob  = customer.churn_probability || 0
                  const level = customer.risk_level ||
                    (prob >= 0.75 ? 'CRITICAL' : prob >= 0.50 ? 'HIGH' : 'MEDIUM')
                  const { color } = RISK[level] || RISK.MEDIUM
                  return (
                    <tr key={customer.msisdn || i} className="fc-risk-row"
                      style={{ borderBottom: `1px solid ${T.mode === 'dark'
                        ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)'}`,
                        transition: 'all .15s' }}>
                      <td style={{ padding: '10px 14px', fontFamily: FONT.display,
                        fontSize: 13, fontWeight: 700, color: T.text,
                        letterSpacing: '.5px' }}>
                        {customer.msisdn || '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 800,
                          letterSpacing: '1.5px', padding: '3px 8px',
                          background: `${color}15`, border: `1px solid ${color}30`,
                          color }}>
                          {level}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', minWidth: 200 }}>
                        <RiskBar probability={prob} level={level}/>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: FONT.display,
                        fontSize: 13, fontWeight: 600, color: T.textMuted }}>
                        {customer.ratio_5g != null
                          ? `${(customer.ratio_5g * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 10, color: T.textDim }}>
                        {customer.traffic_5g != null
                          ? customer.traffic_5g > 1e6
                            ? `${(customer.traffic_5g / 1e6).toFixed(1)} MB`
                            : `${(customer.traffic_5g / 1e3).toFixed(0)} KB`
                          : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700,
                          color: customer.churn_actual === 1
                            ? ALARM.critical : ALARM.normal }}>
                          {customer.churn_actual === 1
                            ? t('forecast.churned') || 'CHURNED'
                            : t('forecast.active') || 'ACTIVE'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ══ §6. 5G ADOPTION FORECAST ═══════════════════════════════ */}
        <SectionLabel
          action={<Badge variant="blue">XGBoost · MAPE {TRAINING.forecastModels[0].value}</Badge>}
          sub="30-day horizon · log1p transformed · lag features — metrics from NB02 training run">
          {t('forecast.fgSection') || '5G ADOPTION FORECAST'}
        </SectionLabel>

        <ChartPanel
          title={t('forecast.fgTitle') || '5G Traffic Forecast — 30-Day Horizon'}
          sub={t('forecast.fgPanelSub') ||
            'Historical (solid) vs XGBoost forecast (dashed) · values in log1p scale'}>
          {fiveGChart ? (
            <ReactApexChart options={fiveGChart.options} series={fiveGChart.series}
              type="line" height={360}/>
          ) : (
            <EmptyState icon={Radio}
              title={t('forecast.noForecast') || '5G forecast unavailable'}
              desc={t('forecast.noForecastDesc') || 'Run NB02 · expose /api/forecast/5g'}/>
          )}
          {/* FC-4: training-run facts — one labeled constant, not JSX literals */}
          <div style={{ display: 'flex', gap: 1, background: GAP, marginTop: 16 }}>
            {TRAINING.forecastModels.map(({ label, value, color, sub }) => (
              <div key={label} style={{ flex: 1, background: T.bgCard,
                padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.textDim,
                  letterSpacing: '1.5px', textTransform: 'uppercase' }}>{label}</span>
                <span style={{ fontFamily: FONT.display, fontSize: 20,
                  fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
                <span style={{ fontSize: 9, color: T.textDim, letterSpacing: '1px' }}>{sub}</span>
              </div>
            ))}
          </div>
        </ChartPanel>

        {/* ══ §7. 5G NETWORK COVERAGE ════════════════════════════════ */}
        <SectionLabel
          action={<Badge variant="blue">NB04 · churn_features.parquet</Badge>}
          sub="5G adoption by province · generation mix · 5G vs 4G performance · coverage gap alerts">
          5G NETWORK COVERAGE
        </SectionLabel>

        <Coverage5GSection />

        {/* ══ §8. BRAND PERFORMANCE ══════════════════════════════════ */}
        <BrandPerformanceSection />

        {/* ══ §9. CHURN DEFINITION REFERENCE ═════════════════════════ */}
        <SectionLabel
          sub={t('forecast.defSub') ||
            'Methodology from NB03–NB05 training run · v5 final definition · update on retrain'}>
          {t('forecast.defSection') || 'CHURN DEFINITION v5'}
        </SectionLabel>

        <div style={{ display: 'flex', gap: 1, background: GAP }}>
          {[
            { ...TRAINING.churnDef[0], color: ALARM.minor },
            { ...TRAINING.churnDef[1], color: HW.blue },
            { label: 'OR Logic · Final def.',
              metric: `C1 OR C2 · ${TRAINING.bothCriteria} satisfy both`,
              count: `${totalChurned.toLocaleString()} churned · ${churnRatePct.toFixed(1)}%`,
              color: ALARM.major },
          ].map(({ label, metric, count, color }) => (
            <div key={label} style={{ flex: 1, background: T.bgCard,
              borderTop: `2px solid ${color}`, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color,
                letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 5 }}>
                {label}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>{metric}</div>
              <div style={{ fontFamily: FONT.display, fontSize: 15,
                fontWeight: 800, color }}>{count}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}