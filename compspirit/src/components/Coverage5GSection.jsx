// src/components/Coverage5GSection.jsx
// ─────────────────────────────────────────────────────────────────────
// 5G Network Coverage & Adoption module for Forecasting.jsx (v2)
// Consumes GET /api/coverage/5g · requires analyticsApi.coverage5g()
//
// MIGRATION (vs previous version):
//  CV-1  Local HW palette removed — tokens imported from UI.jsx.
//        KpiTile deleted (StatBlock in a GapGrid does the same job);
//        Panel deleted (ChartPanel). All components use useTheme()
//        internally — no more T props.
//  CV-2  Recharts tooltips were hardcoded dark (#0A0A0F + white) —
//        broken in light mode. Theme-aware now.
//  CV-3  The "LIVE DATA" pulse referenced an undefined `pulse`
//        keyframe (silent no-op) — now uses noc-pulse from
//        <NocBaseStyles/>.
//  CV-4  Severity mapping: province bars and gap cards use ALARM
//        tokens (<10% adoption critical, <20% minor). Gap cards:
//        NO COVERAGE → critical, POOR → major (was brand red/amber).
//  CV-5  churnDiff was a string compared with > 0 — numeric now.
//        by_province / generation_mix / coverage_gaps guarded with
//        defaults (page crashed if the API omitted any of them).
//  CV-6  Unused imports pruned (Radar*, Signal, TrendingUp, Users).
//        Typography floor ≥10px for data labels.
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect }  from 'react'
import { useTheme }             from '../context/ThemeContext'
import {
  Wifi, AlertTriangle, Smartphone, BarChart2, Zap,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts'
import { analyticsApi } from '../api/client'
import {
  HW, ALARM, FONT, StatBlock, ChartPanel, GapGrid,
  AlertBanner, sevDim, sevBd,
} from './UI'

// ── Device-generation categorical colors (identity, not severity) ────
const GEN_COLORS = {
  '2G': ALARM.unknown,
  '3G': '#F59E0B',
  '4G': HW.blue,
  '5G': HW.blueLight,
}

// CV-4: adoption severity (low coverage = problem)
const adoptionColor = pct =>
  pct < 10 ? ALARM.critical : pct < 20 ? ALARM.minor : HW.blue

// ── Inner section heading (module-local chrome) ───────────────────────
function SectionHead({ icon: Icon, label, sub }) {
  const { theme: T } = useTheme()
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 4, flexShrink: 0,
          background: HW.blueDim, display: 'flex', alignItems: 'center',
          justifyContent: 'center' }}>
          <Icon size={14} color={HW.blue}/>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '3px',
          textTransform: 'uppercase', color: HW.blue }}>
          {label}
        </span>
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, marginLeft: 36 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── CV-2: theme-aware Recharts tooltip ────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  const { theme: T } = useTheme()
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${HW.blueBd}`,
      padding: '8px 12px', fontSize: 11, color: T.text,
      boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: HW.blue }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════
export default function Coverage5GSection() {
  const { theme: T } = useTheme()

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [showAll, setShowAll] = useState({ province: false })

  useEffect(() => {
    setLoading(true)
    analyticsApi.coverage5g()
      .then(r => { setData(r.data); setError(null) })
      .catch(e => setError(e.response?.data?.detail || e.message || 'API error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: T.textDim }}>
      <Wifi size={28} color={HW.blue} style={{ marginBottom: 10, opacity: 0.5,
        animation: 'noc-pulse 1.8s ease-in-out infinite' }}/>
      <div style={{ fontSize: 12 }}>Loading 5G coverage data…</div>
      <div style={{ fontSize: 10, marginTop: 4 }}>GET /api/coverage/5g</div>
    </div>
  )

  if (error) return (
    <AlertBanner severity="major" icon={AlertTriangle}
      title="5G COVERAGE UNAVAILABLE"
      message={`${error} — run NB04 to generate churn_features.parquet`}/>
  )

  if (!data) return null

  // CV-5: defensive defaults — page crashed if any key was missing
  const {
    kpi = {},
    by_province = [],
    generation_mix = [],
    performance = null,
    coverage_gaps = [],
  } = data

  const provSlice = showAll.province ? by_province : by_province.slice(0, 12)

  const genData = generation_mix.map(g => ({
    name: g.generation, value: g.pct, count: g.count,
  }))

  const perfData = performance?.mostly_5g && performance?.mostly_4g ? [
    { metric: 'Latency (ms)',
      '5G users': performance.mostly_5g.avg_latency ?? 0,
      '4G users': performance.mostly_4g.avg_latency ?? 0 },
    { metric: 'Pkt Loss (%)',
      '5G users': parseFloat(((performance.mostly_5g.avg_pkt_loss ?? 0) * 100).toFixed(3)),
      '4G users': parseFloat(((performance.mostly_4g.avg_pkt_loss ?? 0) * 100).toFixed(3)) },
    { metric: 'RTT (ms)',
      '5G users': performance.mostly_5g.avg_rtt ?? 0,
      '4G users': performance.mostly_4g.avg_rtt ?? 0 },
  ] : []

  // CV-5: numeric, not string
  const churnDiffNum = performance?.mostly_5g?.churn_rate != null
    && performance?.mostly_4g?.churn_rate != null
    ? (performance.mostly_5g.churn_rate - performance.mostly_4g.churn_rate) * 100
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Module title bar ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: `1px solid ${T.border}`, paddingBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 4,
          background: `linear-gradient(135deg, ${HW.navy}, ${HW.blue})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Wifi size={18} color="#fff"/>
        </div>
        <div>
          <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 900,
            color: T.text, letterSpacing: '-0.5px' }}>
            5G NETWORK <span style={{ color: HW.blue }}>COVERAGE</span>
          </div>
          <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.5px' }}>
            NB04 outputs · churn_features.parquet
            {kpi.total_subscribers != null
              ? ` · ${kpi.total_subscribers.toLocaleString()} subscribers` : ''}
          </div>
        </div>
        {/* CV-3: working pulse via noc-pulse */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          background: HW.blueDim, border: `1px solid ${HW.blueBd}`,
          padding: '4px 10px', fontSize: 10, fontWeight: 800,
          letterSpacing: '2px', color: HW.blue, textTransform: 'uppercase' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: HW.blue,
            display: 'inline-block',
            animation: 'noc-pulse 2s ease-in-out infinite' }}/>
          LIVE DATA
        </div>
      </div>

      {/* ── 1. KPI strip (CV-1: shared StatBlock) ─────────────────── */}
      <GapGrid columns={`repeat(auto-fit, minmax(160px, 1fr))`}>
        <StatBlock
          label="5G Adoption Rate"
          value={kpi.adoption_rate_pct ?? '—'} unit="%"
          color={HW.blueLight} icon={Wifi}
          sub={kpi.total_subscribers != null
            ? `avg ratio_5g · ${kpi.total_subscribers.toLocaleString()} subs` : ''}/>
        <StatBlock
          label="5G-Capable Devices"
          value={kpi.capable_devices_pct ?? '—'} unit="%"
          color={HW.blue} icon={Smartphone}
          sub={kpi.subscribers_using_5g != null
            ? `${kpi.subscribers_using_5g.toLocaleString()} using 5G now` : ''}/>
        <StatBlock
          label="Subscribers on 5G"
          value={kpi.subscribers_using_5g?.toLocaleString() ?? '—'}
          color={ALARM.normal} icon={Zap}
          sub={kpi.subscribers_no_5g != null
            ? `${kpi.subscribers_no_5g.toLocaleString()} on 4G/non-5G` : ''}/>
        <StatBlock
          label="Avg 5G Traffic"
          value={kpi.avg_5g_traffic != null ? kpi.avg_5g_traffic.toFixed(0) : '—'}
          unit="MB" color="#8B5CF6" icon={BarChart2}
          sub="per subscriber · raw traffic_5g"/>
        {churnDiffNum !== null && (
          <StatBlock
            label="5G vs 4G Churn Δ"
            value={`${churnDiffNum > 0 ? '+' : ''}${churnDiffNum.toFixed(1)}`}
            unit="pp"
            color={churnDiffNum > 0 ? ALARM.critical : ALARM.normal}
            icon={AlertTriangle}
            alert={churnDiffNum > 0}
            sub="5G user churn vs 4G user churn"/>
        )}
      </GapGrid>

      {/* ── 2. Province adoption bar ──────────────────────────────── */}
      <ChartPanel>
        <SectionHead icon={BarChart2} label="5G Adoption by Province"
          sub="Average ratio_5g per governorate — sorted descending · severity-colored below 20%"/>
        {by_province.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 11, padding: '20px 0' }}>
            Province data unavailable — province_encoded column needed
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={provSlice} layout="vertical"
                margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                <XAxis type="number" domain={[0, 100]}
                  tickFormatter={v => `${v}%`}
                  tick={{ fill: T.textDim, fontSize: 10 }}/>
                <YAxis type="category" dataKey="province" width={34}
                  tick={{ fill: T.textDim, fontSize: 10 }}/>
                <Tooltip content={<ChartTooltip/>}
                  formatter={v => [`${v}%`, '5G Adoption']}/>
                <Bar dataKey="ratio_5g_pct" name="5G Adoption %"
                  fill={HW.blue} radius={[0, 3, 3, 0]}>
                  {provSlice.map((entry, i) => (
                    <Cell key={i} fill={adoptionColor(entry.ratio_5g_pct)}/>   // CV-4
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {by_province.length > 12 && (
              <button
                onClick={() => setShowAll(s => ({ ...s, province: !s.province }))}
                aria-expanded={showAll.province}
                style={{ marginTop: 8, width: '100%', background: 'transparent',
                  border: `1px solid ${T.border}`, color: T.textDim,
                  fontSize: 10, padding: 5, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '1px',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 4 }}>
                {showAll.province
                  ? <><ChevronUp size={10}/> Show less</>
                  : <><ChevronDown size={10}/> Show all {by_province.length} provinces</>}
              </button>
            )}
          </>
        )}
      </ChartPanel>

      {/* ── 3+4. Generation mix & performance comparison ──────────── */}
      <GapGrid columns="1fr 1.4fr">

        {/* Generation donut */}
        <ChartPanel>
          <SectionHead icon={Smartphone} label="Device Generation Mix"
            sub="2G → 3G → 4G → 5G breakdown from generation_numeric"/>
          {genData.length === 0 ? (
            <div style={{ color: T.textDim, fontSize: 11 }}>No generation data</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <PieChart width={160} height={160}>
                <Pie data={genData} cx={75} cy={75}
                  innerRadius={40} outerRadius={72}
                  dataKey="value" nameKey="name" strokeWidth={0}>
                  {genData.map((g, i) => (
                    <Cell key={i} fill={GEN_COLORS[g.name] || ALARM.unknown}/>
                  ))}
                </Pie>
                {/* CV-2: theme-aware */}
                <Tooltip
                  formatter={(v, n) => [`${v}%`, n]}
                  contentStyle={{ background: T.bgCard,
                    border: `1px solid ${HW.blueBd}`,
                    fontSize: 11, color: T.text }}/>
              </PieChart>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {genData.map((g, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                      background: GEN_COLORS[g.name] || ALARM.unknown }}/>
                    <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: T.text }}>
                      {g.name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 900,
                      color: GEN_COLORS[g.name] || ALARM.unknown }}>
                      {g.value}%
                    </span>
                    <span style={{ fontSize: 10, color: T.textDim }}>
                      {g.count?.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartPanel>

        {/* 5G vs 4G performance */}
        <ChartPanel>
          <SectionHead icon={Zap} label="5G vs 4G/non-5G Performance"
            sub="Grouped by ratio_5g > 0.1 (mostly 5G) vs ≤ 0.1 (mostly 4G)"/>
          {perfData.length === 0 ? (
            <div style={{ color: T.textDim, fontSize: 11, padding: '20px 0' }}>
              Performance data unavailable — avg_latency_ms column needed
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={perfData}
                  margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                  <XAxis dataKey="metric" tick={{ fill: T.textDim, fontSize: 10 }}/>
                  <YAxis tick={{ fill: T.textDim, fontSize: 10 }}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Legend wrapperStyle={{ fontSize: 10 }}/>
                  {/* Categorical pair: 5G brand-light vs 4G brand-deep */}
                  <Bar dataKey="5G users" fill={HW.blueLight} radius={[3, 3, 0, 0]}/>
                  <Bar dataKey="4G users" fill="#005F8F"      radius={[3, 3, 0, 0]}/>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                {[
                  { label: 'Mostly 5G', val: performance.mostly_5g.count, c: HW.blueLight },
                  { label: 'Mostly 4G', val: performance.mostly_4g.count, c: '#005F8F'    },
                ].map(({ label, val, c }) => (
                  <div key={label} style={{ flex: 1, padding: '8px 10px',
                    border: `1px solid ${c}30`, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: c,
                      fontFamily: FONT.display }}>
                      {val?.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1px' }}>
                      {label}
                    </div>
                  </div>
                ))}
                {churnDiffNum !== null && (
                  <div style={{ flex: 1, padding: '8px 10px',
                    border: `1px solid ${sevBd(churnDiffNum > 0 ? ALARM.critical : ALARM.normal)}`,
                    textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 900, fontFamily: FONT.display,
                      color: churnDiffNum > 0 ? ALARM.critical : ALARM.normal }}>
                      {churnDiffNum > 0 ? '+' : ''}{churnDiffNum.toFixed(1)}pp
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim }}>5G vs 4G churn Δ</div>
                  </div>
                )}
              </div>
            </>
          )}
        </ChartPanel>
      </GapGrid>

      {/* ── 5. Coverage gap alerts (CV-4) ─────────────────────────── */}
      {coverage_gaps.length > 0 && (
        <ChartPanel>
          <SectionHead icon={AlertTriangle} label="Coverage Gap Alerts"
            sub="Provinces with 5G adoption < 15% AND elevated churn rate — underserved regions"/>
          <div style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {coverage_gaps.map((g, i) => {
              const sev = g.ratio_5g_pct < 5 ? ALARM.critical : ALARM.major
              return (
                <div key={i} style={{
                  padding: '12px 14px',
                  background: sevDim(sev, '08'),
                  border: `1px solid ${sevBd(sev)}`,
                  borderLeft: `3px solid ${sev}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: T.text,
                      letterSpacing: '1px' }}>
                      {g.province}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px',
                      padding: '2px 6px', background: sevDim(sev, '14'), color: sev }}>
                      {g.ratio_5g_pct < 5 ? 'NO COVERAGE' : 'POOR'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 10, color: T.textDim }}>5G adoption</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: sev,
                        fontFamily: FONT.display }}>
                        {g.ratio_5g_pct.toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: T.textDim }}>Churn rate</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: ALARM.major,
                        fontFamily: FONT.display }}>
                        {(g.churn_rate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 7, height: 3, background: T.border,
                    borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${g.ratio_5g_pct}%`, height: '100%',
                      background: sev, borderRadius: 2 }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </ChartPanel>
      )}

    </div>
  )
}