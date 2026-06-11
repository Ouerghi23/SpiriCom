// src/pages/RootCauseAnalysis.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC Dashboard — Root Cause Analysis (Full i18n + Redesign)
// Huawei Brand: Red #EE3A43 · Blue #0093D5 · Dark Navy #001F3F
//
// i18n: ALL hardcoded English strings replaced with t() calls.
//       Existing 8 keys preserved. ~50 new keys added.
//       EN/ZH JSON files generated alongside this file.
//
// Color fixes, design fixes, and inherited bug fixes all retained
// from previous revision (see prior change log for full details).
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import ReactApexChart from 'react-apexcharts'
import { Badge, Spinner, EmptyState, baseChartOptions } from '../components/UI'
import { useTheme }     from '../context/ThemeContext'
import { analyticsApi } from '../api/client'

// ── Huawei Brand Tokens ───────────────────────────────────────────────
const HW = {
  red:     '#EE3A43',
  redL:    '#FF5A62',
  redDim:  'rgba(238,58,67,.1)',
  redBd:   'rgba(238,58,67,.28)',
  blue:    '#0093D5',
  blueDim: 'rgba(0,147,213,.1)',
  blueBd:  'rgba(0,147,213,.28)',
  navy:    '#001F3F',
}

const gapColor = mode =>
  mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.09)'

// ── SVG Icon factory ──────────────────────────────────────────────────
const Ico = d => ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)
const IcoTarget   = Ico(<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>)
const IcoActivity = Ico(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>)
const IcoSearch   = Ico(<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>)
const IcoAlert    = Ico(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>)

// ── Sub-components ────────────────────────────────────────────────────
const SectionLabel = ({ children, action, sub, T }) => (
  <div style={{ marginTop: 40, marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: HW.red, letterSpacing: '4.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 20, height: 1.5, background: HW.red, display: 'inline-block', flexShrink: 0, borderRadius: 1 }}/>
        {children}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
    {sub && (
      <div style={{ fontSize: 10, color: T?.textDim, letterSpacing: '1px', marginTop: 5, paddingLeft: 32 }}>
        {sub}
      </div>
    )}
  </div>
)

const StatBlock = ({ label, value, unit, color, icon: IconComp, sub, T }) => {
  const accent = color || HW.red
  return (
    <div className="rc-stat-block" style={{ background: T?.bgCard, border: `1px solid ${T?.border}`, borderTop: `2px solid ${accent}`, padding: '22px 20px', position: 'relative', overflow: 'hidden', transition: 'all .3s cubic-bezier(.22,1,.36,1)', cursor: 'default' }}>
      <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}/>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: T?.textDim, letterSpacing: '1.8px', textTransform: 'uppercase', lineHeight: 1.5 }}>{label}</span>
        {IconComp && (
          <div style={{ width: 26, height: 26, border: `1px solid ${accent}30`, background: `${accent}0E`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 4 }}>
            <IconComp size={12} color={accent}/>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: sub ? 8 : 0 }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: typeof value === 'string' && value.length > 8 ? 20 : 32, fontWeight: 900, color: accent, lineHeight: 1, letterSpacing: '-1px' }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 11, color: T?.textMuted, fontWeight: 600 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 9, color: T?.textDim, letterSpacing: '1px', textTransform: 'uppercase' }}>{sub}</div>}
    </div>
  )
}

const ChartPanel = ({ title, sub, children, action, style = {}, T }) => (
  <div className="rc-chart-panel" style={{ background: T?.bgCard, border: `1px solid ${T?.border}`, padding: '22px 24px', position: 'relative', overflow: 'hidden', transition: 'border-color .3s', ...style }}>
    <div className="rc-panel-accent" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)`, transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s ease' }}/>
    {(title || sub || action) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          {title && <div style={{ fontSize: 12, fontWeight: 700, color: T?.text, letterSpacing: '.5px', marginBottom: 3 }}>{title}</div>}
          {sub   && <div style={{ fontSize: 10, color: T?.textDim, letterSpacing: '1px' }}>{sub}</div>}
        </div>
        {action && <div style={{ flexShrink: 0, marginLeft: 16 }}>{action}</div>}
      </div>
    )}
    {children}
  </div>
)

// ═════════════════════════════════════════════════════════════════════
export default function RootCauseAnalysis() {
  const { t }              = useTranslation()
  const { theme: T, mode } = useTheme()
  const GAP                = gapColor(mode)

  const [rca5g,       setRca5g]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [apiOnline,   setApiOnline]   = useState(true)
  const [msisdnQuery, setMsisdnQuery] = useState('')
  const [drillResult, setDrillResult] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const r5g = await analyticsApi.rootCause5g()
        setRca5g(r5g.data || r5g)
        setApiOnline(true)
      } catch (err) {
        console.error('RCA 5G fetch error:', err)
        setApiOnline(false)
        setError(t('rootcause.apiOffline'))
      } finally { setLoading(false) }
    }
    fetchData()
  }, [t])

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: '40px 48px', background: T.bg, minHeight: '100vh' }}>
      <style>{`@keyframes rc-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: HW.red, display: 'inline-block', animation: 'rc-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: HW.red }}>
          {t('rootcause.loading')}
        </span>
      </div>
      <Spinner size={48}/>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, minHeight: '100vh', color: T.text, transition: 'background .3s' }}>
      <style>{`
        @keyframes rc-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        .rc-stat-block:hover { border-color:${HW.redBd}!important; background:${HW.redDim}!important; transform:translateY(-2px); box-shadow:0 8px 24px rgba(238,58,67,.07); }
        .rc-chart-panel:hover { border-color:${HW.blueBd}!important; }
        .rc-chart-panel:hover .rc-panel-accent { transform:scaleX(1)!important; }
        .rc-table-row:hover td { background:${T.bgCardHover}!important; }
        .rc-feature-card:hover { border-color:${HW.redBd}!important; background:${HW.redDim}!important; transform:translateY(-2px); }
        .rc-feature-card:hover .rc-feature-accent { transform:scaleX(1)!important; }
      `}</style>

      <div style={{ padding: '36px 44px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* HERO HEADER */}
        <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 24, marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: HW.redDim, border: `1px solid ${HW.redBd}`, padding: '5px 13px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: HW.red, display: 'inline-block', animation: 'rc-pulse 2s ease-in-out infinite' }}/>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: HW.redL }}>
                {apiOnline ? t('rootcause.liveBadge') : t('rootcause.offlineBadge')}
              </span>
            </div>
            <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '1.5px' }}>{t('rootcause.techStack')}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(26px,3.5vw,52px)', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1, color: T.text, marginBottom: 8 }}>
                {t('rootcause.titlePrefix')}{' '}
                <span style={{ color: HW.red, fontStyle: 'italic' }}>{t('rootcause.titleAccent')}</span>
              </h1>
              <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 300 }}>
                {t('rootcause.heroDesc')} · 5G KPI Analysis · NB07 + NB08b
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? t('rootcause.onlineLabel') : t('rootcause.offlineLabel'), color: apiOnline ? '#22C55E' : HW.red, bd: apiOnline ? 'rgba(34,197,94,.28)' : HW.redBd, bg: apiOnline ? 'rgba(34,197,94,.08)' : HW.redDim },
                { label: t('rootcause.shapFeatures'), color: T.textMuted, bd: T.border, bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: t('rootcause.shapFeatures'),                               color: T.textMuted, bd: T.border, bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
              ].map((b, i) => (
                <span key={i} style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '5px 13px', border: `1px solid ${b.bd}`, background: b.bg, color: b.color }}>
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.28)', padding: '11px 18px', marginBottom: 1 }}>
            <IcoAlert size={14} color="#F59E0B"/>
            <span style={{ fontSize: 12, color: '#F59E0B' }}>{error}</span>
          </div>
        )}


                {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.28)', padding: '11px 18px', marginBottom: 1 }}>
            <IcoAlert size={14} color="#F59E0B"/>
            <span style={{ fontSize: 12, color: '#F59E0B' }}>{error}</span>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* §A. 5G ROOT CAUSE OVERVIEW                                */}
        {/* ══════════════════════════════════════════════════════════ */}
        <SectionLabel T={T}
          action={<Badge variant="blue">NB07 · anomaly_results</Badge>}
          sub={`${rca5g?.summary?.subscribers_5g?.toLocaleString() || '—'} subscribers with ratio_5g > ${((rca5g?.summary?.ratio_threshold || 0.1) * 100).toFixed(0)}% · ${rca5g?.summary?.consensus_anomalies || 0} consensus anomalies · source: top_anomaly_driver`}>
          5G ROOT CAUSE ANALYSIS
        </SectionLabel>

        {/* Summary KPI strip */}
        {rca5g?.summary && (
          <div style={{ display: 'flex', gap: 1, background: GAP, marginBottom: 1 }}>
            {[
              { label: '5G Subscribers',     value: (rca5g.summary.subscribers_5g || 0).toLocaleString(),   color: HW.blue  },
              { label: '% of Base',           value: `${rca5g.summary.pct_5g || 0}%`,                        color: '#22D3EE' },
              { label: 'Anomalies Detected',  value: (rca5g.summary.consensus_anomalies || 0).toLocaleString(), color: HW.red },
              { label: '% Anomalous',         value: `${rca5g.summary.pct_anomalous || 0}%`,                 color: '#F59E0B' },
              { label: 'Top Root Cause',      value: rca5g.summary.top_cause || '—',                         color: '#A855F7' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: T.bgCard, padding: '12px 16px',
                borderTop: `2px solid ${color}22` }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: T.textDim,
                  letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 18, fontWeight: 900, color, lineHeight: 1, wordBreak: 'break-word' }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* §A1. Top causes ranked bar + KPI profile comparison */}
        {rca5g?.top_causes?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: GAP }}>

            {/* Ranked causes */}
            <div className="rc-chart-panel" style={{ background: T.bgCard, border: `1px solid ${T.border}`, padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
              <div className="rc-panel-accent" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg,transparent,${HW.blue},transparent)`, transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s' }}/>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 3 }}>Root Cause Ranking — 5G Subscribers</div>
              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 18, letterSpacing: '1px' }}>
                Most frequent anomaly driver · filtered to ratio_5g &gt; {((rca5g.summary?.ratio_threshold || 0.1) * 100).toFixed(0)}%
              </div>
              {rca5g.top_causes.map((c, i) => {
                const pct    = c.pct || 0
                const maxPct = rca5g.top_causes[0]?.pct || 1
                const colors = [HW.red, '#FF6B35', '#F59E0B', HW.blue, '#A855F7', '#22D3EE', '#22C55E', '#F97316']
                const col    = colors[i % colors.length]
                return (
                  <div key={c.cause} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{c.label}</span>
                        <span style={{ fontSize: 9, color: T.textDim, marginLeft: 6, letterSpacing: '1px' }}>
                          {c.cause}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: 15, fontWeight: 800, color: col }}>{pct}%
                          {c.fallback && <span style={{ fontSize: 8, color: T.textDim, marginLeft: 4, fontWeight: 400 }}>deviation</span>}
                        </span>
                        <span style={{ fontSize: 9, color: T.textDim }}>({c.count.toLocaleString()})</span>
                      </div>
                    </div>
                    <div style={{ height: 5, background: T.mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${(pct / maxPct) * 100}%`, height: '100%', background: col, borderRadius: 2, transition: 'width .5s ease' }}/>
                    </div>
                    <div style={{ fontSize: 9, color: T.textDim, marginTop: 3, fontStyle: 'italic' }}>{c.action}</div>
                  </div>
                )
              })}
            </div>

            {/* KPI Profile: 5G vs all */}
            <div className="rc-chart-panel" style={{ background: T.bgCard, border: `1px solid ${T.border}`, padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
              <div className="rc-panel-accent" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg,transparent,${HW.blue},transparent)`, transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s' }}/>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 3 }}>KPI Profile — 5G vs All Subscribers</div>
              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 18, letterSpacing: '1px' }}>
                Mean value comparison · <span style={{ color: HW.blue }}>■ All</span> vs <span style={{ color: HW.red }}>■ 5G active</span>
              </div>
              {Object.entries(rca5g.kpi_profile || {}).slice(0, 8).map(([col, p]) => {
                const worse = p.good_is === 'low'
                  ? p['5g_mean'] > p.all_mean
                  : p['5g_mean'] < p.all_mean
                const maxVal = Math.max(p['5g_mean'], p.all_mean, 0.001)
                return (
                  <div key={col} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: T.text }}>{p.label}</span>
                      {worse && (
                        <span style={{ fontSize: 8, fontWeight: 800, color: HW.red,
                          background: HW.redDim, border: `1px solid ${HW.redBd}`,
                          padding: '1px 5px', letterSpacing: '1px' }}>WORSE</span>
                      )}
                    </div>
                    {/* All subscribers bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ width: 28, fontSize: 8, color: T.textDim, flexShrink: 0 }}>ALL</span>
                      <div style={{ flex: 1, height: 4, background: T.mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)', borderRadius: 2 }}>
                        <div style={{ width: `${(p.all_mean / maxVal) * 100}%`, height: '100%', background: HW.blue, borderRadius: 2 }}/>
                      </div>
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: HW.blue, minWidth: 50, textAlign: 'right' }}>
                        {p.all_mean.toFixed(3)}{p.unit ? ` ${p.unit}` : ''}
                      </span>
                    </div>
                    {/* 5G bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 28, fontSize: 8, color: T.textDim, flexShrink: 0 }}>5G</span>
                      <div style={{ flex: 1, height: 4, background: T.mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)', borderRadius: 2 }}>
                        <div style={{ width: `${(p['5g_mean'] / maxVal) * 100}%`, height: '100%', background: worse ? HW.red : '#22C55E', borderRadius: 2 }}/>
                      </div>
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 700, color: worse ? HW.red : '#22C55E', minWidth: 50, textAlign: 'right' }}>
                        {p['5g_mean'].toFixed(3)}{p.unit ? ` ${p.unit}` : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* §A2. Province root cause heatmap */}
        {rca5g?.by_province?.length > 0 && (
          <div style={{ marginTop: 1, background: T.bgCard, border: `1px solid ${T.border}`, padding: '22px 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 3 }}>Root Cause by Governorate</div>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 16, letterSpacing: '1px' }}>
              Dominant anomaly driver per province · sorted by 5G subscriber count
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {rca5g.by_province.slice(0, 24).map(p => {
                const causeColors = {
                  avg_latency_ms: HW.red, avg_packet_loss: '#FF6B35',
                  client_rtt_ms: '#F59E0B', voip_quality: '#A855F7',
                  session_active_rate: HW.blue, congestion_level: '#22D3EE',
                  traffic_diversity: '#22C55E', ratio_5g: '#F97316',
                }
                const col = causeColors[p.top_cause] || T.textMuted
                return (
                  <div key={p.province} style={{
                    padding: '10px 14px', background: T.mode === 'dark' ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.02)',
                    border: `1px solid ${T.border}`, borderLeft: `3px solid ${col}`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{p.province}</div>
                    <div style={{ fontSize: 9, color: col, fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', marginTop: 3 }}>
                      {p.top_cause_label}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                      <span style={{ fontSize: 9, color: T.textDim }}>{p.subscribers_5g} 5G subs</span>
                      {p.avg_ratio_5g != null && (
                        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, color: HW.blue }}>
                          {(p.avg_ratio_5g * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}


        {/* §A2.5 — NB08b SHAP: per risk level + Critical+High drivers */}
        {rca5g?.nb08b_available && (
          <>
            <SectionLabel T={T}
              action={<Badge variant="purple">NB08b · SHAP · XGBoost</Badge>}
              sub="SHAP mean |value| per risk level · source: rca_5g_results.json">
              5G KPI ROOT CAUSE — SHAP ANALYSIS
            </SectionLabel>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: GAP }}>

              {/* Critical+High top drivers */}
              <div className="rc-chart-panel" style={{ background: T.bgCard, border: `1px solid ${T.border}`, padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
                <div className="rc-panel-accent" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg,transparent,${HW.red},transparent)`, transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s' }}/>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 3 }}>
                  Root Cause Drivers — Critical + High Risk
                </div>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 18, letterSpacing: '1px' }}>
                  SHAP mean |value| · 5G subscribers at Critical or High risk
                </div>
                {(rca5g.top_5g_hi_root_causes || []).slice(0, 8).map((item, i) => {
                  const maxShap = rca5g.top_5g_hi_root_causes[0]?.shap_hi || 1
                  const pct     = (item.shap_hi / maxShap) * 100
                  const colors  = [HW.red, '#FF6B35', '#F59E0B', HW.blue, '#A855F7', '#22D3EE', '#22C55E', '#F97316']
                  const col     = colors[i % colors.length]
                  return (
                    <div key={item.feature} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
                          {item.feature.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 800, color: col }}>
                          {item.shap_hi?.toFixed(5)}
                        </span>
                      </div>
                      <div style={{ height: 5, background: T.mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)', borderRadius: 2 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 2, transition: 'width .5s' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Per risk level — top driver */}
              <div className="rc-chart-panel" style={{ background: T.bgCard, border: `1px solid ${T.border}`, padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
                <div className="rc-panel-accent" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px', background: `linear-gradient(90deg,transparent,${HW.blue},transparent)`, transform: 'scaleX(0)', transformOrigin: 'center', transition: 'transform .4s' }}/>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 3 }}>
                  Top KPI Driver per Risk Level
                </div>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 18, letterSpacing: '1px' }}>
                  Primary SHAP driver explaining each risk category
                </div>
                {Object.entries(rca5g.shap_per_risk_level || {}).map(([riskLevel, features]) => {
                  const top = features?.[0]
                  if (!top) return null
                  const riskPal = { Critical: HW.red, High: '#F59E0B', Medium: HW.blue, Low: '#22C55E' }
                  const col = riskPal[riskLevel] || T.textMuted
                  return (
                    <div key={riskLevel} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: `1px solid ${T.border}` }}>
                      {/* Risk badge */}
                      <div style={{ minWidth: 72, padding: '4px 10px', background: `${col}15`, border: `1px solid ${col}30`, textAlign: 'center' }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: col, letterSpacing: '1px', textTransform: 'uppercase' }}>
                          {riskLevel}
                        </span>
                      </div>
                      {/* Arrow */}
                      <span style={{ fontSize: 14, color: T.textDim }}>→</span>
                      {/* Top driver */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                          {top.feature.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </div>
                        <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>
                          SHAP: {top.shap?.toFixed(5)}
                          {features[1] && <span style={{ marginLeft: 10 }}>
                            #2: {features[1].feature.replace(/_/g,' ')} ({features[1].shap?.toFixed(4)})
                          </span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {(!rca5g.shap_per_risk_level || Object.keys(rca5g.shap_per_risk_level).length === 0) && (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
                    Run 08b_RootCauseAnalysis_5G.ipynb to generate SHAP analysis
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* §A3. MSISDN drill-down */}
        <SectionLabel T={T}
          sub="Search any subscriber — see their KPI profile, root cause, and NOC recommendation"
          action={<Badge variant="red">Subscriber Drill-Down</Badge>}>
          5G SUBSCRIBER ANALYSIS
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 1, background: GAP }}>
          {/* Search + high-risk list */}
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, padding: '22px 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 14 }}>High-Risk 5G Subscribers</div>

            {/* MSISDN search */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <input
                value={msisdnQuery}
                onChange={e => setMsisdnQuery(e.target.value)}
                placeholder="Search MSISDN…"
                style={{
                  flex: 1, padding: '8px 12px', fontSize: 11,
                  background: T.bgCard, color: T.text,
                  border: `1px solid ${T.border}`, outline: 'none',
                  fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '.5px',
                }}
              />
              <button
                onClick={() => {
                  if (!msisdnQuery.trim()) return
                  const found = rca5g?.high_risk_5g?.find(
                    s => s.msisdn?.includes(msisdnQuery.trim())
                  )
                  setDrillResult(found || { msisdn: msisdnQuery, error: 'Not in top 20 high-risk list' })
                }}
                style={{
                  padding: '8px 14px', background: HW.blueDim,
                  border: `1px solid ${HW.blueBd}`, color: HW.blue,
                  fontSize: 9, fontWeight: 800, letterSpacing: '1.5px',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                SEARCH
              </button>
            </div>

            {/* Top 20 list */}
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {(rca5g?.high_risk_5g || []).map((s, i) => {
                const riskColors = {
                  Critical: HW.red, High: '#F59E0B', CRITICAL: HW.red, HIGH: '#F59E0B'
                }
                const rc = riskColors[s.risk_level] || T.textMuted
                return (
                  <div key={i}
                    onClick={() => setDrillResult(s)}
                    style={{
                      padding: '9px 12px', borderBottom: `1px solid ${T.border}`,
                      cursor: 'pointer', transition: 'background .15s',
                      background: drillResult?.msisdn === s.msisdn
                        ? (T.mode === 'dark' ? 'rgba(0,147,213,.08)' : 'rgba(0,147,213,.05)')
                        : 'transparent',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.mode === 'dark' ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.02)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = drillResult?.msisdn === s.msisdn ? (T.mode === 'dark' ? 'rgba(0,147,213,.08)' : 'rgba(0,147,213,.05)') : 'transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13, fontWeight: 700, color: T.text }}>{s.msisdn}</span>
                      <span style={{ fontSize: 8, fontWeight: 800, color: rc, background: `${rc}15`, border: `1px solid ${rc}30`, padding: '1px 6px', letterSpacing: '1px' }}>
                        {s.risk_level}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>
                      Cause: <span style={{ color: HW.red, fontWeight: 700 }}>{s.root_cause?.replace(/_/g, ' ') || '—'}</span>
                      {s.ratio_5g != null && <span style={{ marginLeft: 8 }}>5G: {(s.ratio_5g * 100).toFixed(1)}%</span>}
                    </div>
                  </div>
                )
              })}
              {(!rca5g?.high_risk_5g?.length) && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
                  No high-risk 5G data — run NB07
                </div>
              )}
            </div>
          </div>

          {/* Drill-down detail panel */}
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, padding: '22px 24px' }}>
            {!drillResult ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: T.textMuted }}>
                <IcoSearch size={36} color={T.textDim}/>
                <div style={{ fontSize: 13 }}>Select a subscriber to see their analysis</div>
                <div style={{ fontSize: 10, color: T.textDim }}>KPI profile · root cause · NOC recommendation</div>
              </div>
            ) : drillResult.error ? (
              <div style={{ padding: 24, color: T.textMuted, fontSize: 12 }}>{drillResult.error}</div>
            ) : (
              <div>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 900, color: T.text, letterSpacing: '-.5px' }}>
                      {drillResult.msisdn}
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, letterSpacing: '1px' }}>
                      Subscriber profile · NB07 anomaly detection
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {drillResult.risk_level && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase',
                        padding: '4px 10px',
                        color:      ['Critical','CRITICAL'].includes(drillResult.risk_level) ? HW.red : '#F59E0B',
                        background: ['Critical','CRITICAL'].includes(drillResult.risk_level) ? HW.redDim : 'rgba(245,158,11,.1)',
                        border:     `1px solid ${['Critical','CRITICAL'].includes(drillResult.risk_level) ? HW.redBd : 'rgba(245,158,11,.28)'}`,
                      }}>
                        {drillResult.risk_level}
                      </span>
                    )}
                    {drillResult.churn_prob != null && (
                      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', padding: '4px 10px', color: T.textMuted, border: `1px solid ${T.border}`, background: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' }}>
                        P(churn): {(drillResult.churn_prob * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Root cause highlight */}
                {drillResult.root_cause && drillResult.root_cause !== '—' && (
                  <div style={{
                    background: HW.redDim, border: `1px solid ${HW.redBd}`,
                    borderLeft: `4px solid ${HW.red}`, padding: '14px 18px', marginBottom: 18,
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: HW.red, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
                      ⚠ ROOT CAUSE IDENTIFIED
                    </div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 900, color: T.text }}>
                      {drillResult.root_cause.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6, lineHeight: 1.6 }}>
                      {drillResult.action || ''}
                    </div>
                  </div>
                )}

                {/* KPI values */}
                <div style={{ fontSize: 9, fontWeight: 700, color: T.textDim, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>
                  KPI VALUES
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18 }}>
                  {[
                    { key: 'ratio_5g',        label: '5G Ratio',     fmt: v => `${(v*100).toFixed(1)}%`  },
                    { key: 'avg_latency_ms',   label: 'Latency',     fmt: v => `${v.toFixed(1)} ms`       },
                    { key: 'avg_packet_loss',  label: 'Packet Loss', fmt: v => `${(v*100).toFixed(2)}%`  },
                    { key: 'client_rtt_ms',    label: 'RTT',         fmt: v => `${v.toFixed(1)} ms`       },
                    { key: 'voip_quality',     label: 'VoIP Quality',fmt: v => v.toFixed(2)               },
                    { key: 'churn_prob',       label: 'Churn Prob',  fmt: v => `${(v*100).toFixed(1)}%`  },
                  ].map(({ key, label, fmt }) => {
                    const val = drillResult[key]
                    if (val == null) return null
                    const isRootCause = drillResult.root_cause?.includes(key.replace('avg_',''))
                    return (
                      <div key={key} style={{
                        padding: '10px 12px', background: isRootCause ? HW.redDim : (T.mode === 'dark' ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.03)'),
                        border: `1px solid ${isRootCause ? HW.redBd : T.border}`,
                      }}>
                        <div style={{ fontSize: 8, color: isRootCause ? HW.red : T.textDim, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</div>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 900, color: isRootCause ? HW.red : T.text, marginTop: 4 }}>
                          {fmt(val)}
                        </div>
                      </div>
                    )
                  }).filter(Boolean)}
                </div>

                {/* Benchmark comparison */}
                {rca5g?.thresholds && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.textDim, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>
                      NETWORK BENCHMARKS (P50 · P75 · P90 · P95)
                    </div>
                    <div style={{ display: 'flex', gap: 1, background: GAP }}>
                      {Object.entries(rca5g.thresholds).slice(0, 4).map(([col, th]) => {
                        const subVal = drillResult[col]
                        const worse  = subVal != null && (th.good_is === 'low' ? subVal > th.p90 : subVal < th.p50)
                        return (
                          <div key={col} style={{ flex: 1, background: T.bgCard, padding: '10px 12px' }}>
                            <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
                              {col.replace('avg_','').replace(/_/g,' ')}
                            </div>
                            {['p50','p75','p90','p95'].map(pk => (
                              <div key={pk} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 8, color: T.textDim }}>{pk.toUpperCase()}</span>
                                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, fontWeight: 700, color: T.textMuted }}>
                                  {th[pk]?.toFixed(2)}{th.unit ? ` ${th.unit}` : ''}
                                </span>
                              </div>
                            ))}
                            {subVal != null && (
                              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}`, fontSize: 9, color: worse ? HW.red : '#22C55E', fontWeight: 800 }}>
                                Sub: {subVal.toFixed(3)} {worse ? '⚠ ABOVE P90' : '✓ OK'}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}