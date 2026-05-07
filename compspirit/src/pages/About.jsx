// src/pages/About.jsx
// ─────────────────────────────────────────────────────────────────────
// About SpiriComp — in-dashboard project overview page
// Add to App.jsx: <Route path="about" element={<About />} />
// Add to routes.js NAV_LINKS: { label: 'About', path: '/dashboard/about' }
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { PageHeader, SectionHeader, Card, Badge, THEME } from '../components/UI'

const C = THEME

// ── GitHub live card ─────────────────────────────────────────────────
function GithubProfile({ username }) {
  const [data, setData]       = useState(null)
  const [repos, setRepos]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`https://api.github.com/users/${username}`).then(r => r.json()),
      fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=6`).then(r => r.json()),
    ])
      .then(([p, r]) => { setData(p); setRepos(Array.isArray(r) ? r : []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [username])

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <a href={`https://github.com/${username}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {/* Header */}
        <div style={{ padding: '28px 28px 20px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,.015)' }}>
          {loading ? (
            <div style={{ color: C.textMuted, fontSize: 11, letterSpacing: 2 }}>LOADING GITHUB…</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
              {data?.avatar_url && (
                <img src={data.avatar_url} alt={username} style={{ width: 72, height: 72, borderRadius: '50%', border: '2px solid rgba(207,10,44,.4)', objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-.3px', marginBottom: 4 }}>
                  {data?.name || username}
                </div>
                <div style={{ fontSize: 13, color: '#CF0A2C', fontWeight: 600, marginBottom: 8 }}>@{username}</div>
                {data?.bio && <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 12 }}>{data.bio}</div>}
                {data?.location && (
                  <div style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {data.location}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 24, marginTop: 14 }}>
                  {[
                    ['Public Repos', data?.public_repos ?? '—'],
                    ['Followers',    data?.followers    ?? '—'],
                    ['Following',    data?.following    ?? '—'],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#CF0A2C', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '-1px' }}>{val}</div>
                      <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Repos */}
        {repos.length > 0 && (
          <div style={{ padding: '16px 28px 24px' }}>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 12, fontWeight: 700 }}>Recent Repositories</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {repos.slice(0, 5).map(repo => (
                <div key={repo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{repo.name}</div>
                    {repo.description && (
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.description}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {repo.language && (
                      <span style={{ fontSize: 9, color: C.textDim, background: 'rgba(255,255,255,.04)', padding: '2px 8px', borderRadius: 3 }}>{repo.language}</span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.textDim }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(255,255,255,.2)"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      {repo.stargazers_count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#CF0A2C' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#CF0A2C"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
              github.com/{username}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#CF0A2C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </div>
          </div>
        )}
      </a>
    </Card>
  )
}

// ── Architecture flow diagram ─────────────────────────────────────────
function ArchDiagram() {
  const layers = [
    { label: 'Data Sources',    color: '#3B82F6', items: ['complaints_clean.parquet', 'kpi_daily_agg.parquet', 'feature_matrix.parquet'] },
    { label: 'ML Pipeline',     color: '#CF0A2C', items: ['Anomaly Detection', 'Spike Forecasting', 'Root Cause Classifier', 'User Clustering'] },
    { label: 'Storage',         color: '#F59E0B', items: ['models/anomaly/*.parquet', 'models/prediction/*.parquet', 'models/classification/*.json', 'models/clustering/*.parquet'] },
    { label: 'API Layer',       color: '#22C55E', items: ['analytics_api.py (FastAPI)', 'nlp_api.py (FastAPI)', 'SQLite complaints.db'] },
    { label: 'Dashboard',       color: '#8B5CF6', items: ['React/Vite', 'ApexCharts', 'Leaflet', 'NOC Engineer UI'] },
  ]

  return (
    <Card style={{ padding: '28px 24px' }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {layers.map((layer, i) => (
          <div key={layer.label} style={{ flex: 1, position: 'relative' }}>
            {/* Arrow connector */}
            {i < layers.length - 1 && (
              <div style={{ position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)', zIndex: 2, color: 'rgba(255,255,255,.2)', fontSize: 16 }}>→</div>
            )}
            <div style={{ margin: '0 6px', padding: '18px 14px', background: `${layer.color}10`, border: `1px solid ${layer.color}30`, borderRadius: 0, borderTop: `2px solid ${layer.color}` }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: layer.color, marginBottom: 12 }}>{layer.label}</div>
              {layer.items.map(item => (
                <div key={item} style={{ fontSize: 9, color: C.textMuted, marginBottom: 5, lineHeight: 1.4, fontFamily: 'monospace' }}>{item}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Document download card ────────────────────────────────────────────
function DocCard({ icon, title, desc, badge, href, type = 'external' }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
      <Card style={{
        padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 10,
        transition: 'all .3s', cursor: 'pointer', height: '100%',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(207,10,44,.25)'; e.currentTarget.style.background = 'rgba(207,10,44,.025)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; e.currentTarget.style.transform = 'translateY(0)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 28 }}>{icon}</div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
        <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>{desc}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#CF0A2C', marginTop: 4 }}>
          {type === 'download' ? (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#CF0A2C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</>
          ) : (
            <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#CF0A2C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg> Open</>
          )}
        </div>
      </Card>
    </a>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
export default function About() {
  const STACK = [
    { name: 'Python 3.11',       role: 'Data pipeline · ML models',     color: '#3B82F6', pct: 95 },
    { name: 'FastAPI',           role: 'REST analytics + NLP API',       color: '#22C55E', pct: 88 },
    { name: 'React + Vite',      role: 'NOC dashboard frontend',         color: '#8B5CF6', pct: 90 },
    { name: 'Scikit-learn',      role: 'Anomaly detection · clustering', color: '#F59E0B', pct: 85 },
    { name: 'XGBoost',           role: 'Forecasting · root cause RCA',   color: '#CF0A2C', pct: 88 },
    { name: 'Prophet',           role: 'Time-series seasonality',        color: '#06B6D4', pct: 78 },
    { name: 'Leaflet.js',        role: 'Geospatial complaint map',       color: '#22C55E', pct: 72 },
    { name: 'Pandas · NumPy',    role: 'Data wrangling · feature eng.',  color: '#6366F1', pct: 93 },
  ]

  const KPIs = [
    { value: '50K+',   label: 'Complaints decoded',       color: C.red    },
    { value: '552K',   label: 'KPI data points',          color: C.blue   },
    { value: '201',    label: 'Cell sites monitored',     color: C.green  },
    { value: '24',     label: 'Governorates covered',     color: C.purple },
    { value: '89%+',   label: 'RCA classification acc.',  color: C.amber  },
    { value: '2.91',   label: 'Forecast MAE (compl/day)', color: C.cyan   },
    { value: '18 mo',  label: 'Historical data range',    color: '#14B8A6'},
    { value: '6',      label: 'ML modules deployed',      color: C.orange },
  ]

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <div style={{ padding: '24px 24px 64px' }}>

        <PageHeader
          title="About SpiriComp"
          subtitle="PFE Master Engineering · Huawei Technologies Tunisia · 2026"
          badges={['PFE 2026', 'Open Source', 'NOC Intelligence', 'github.com/Ouerghi23']}
        />

        {/* ── Project overview ── */}
        <Card style={{ marginBottom: 24, padding: '32px 36px', borderLeft: '3px solid #CF0A2C', background: 'linear-gradient(135deg, rgba(207,10,44,.04) 0%, rgba(255,255,255,.01) 100%)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#CF0A2C', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>Project Overview</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.3, marginBottom: 16 }}>
                From Raw KPI Data to<br />Production NOC Intelligence
              </h2>
              <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.9, fontWeight: 300 }}>
                SpiriComp is a Projet de Fin d'Études (PFE) Master Engineering platform developed in collaboration with Huawei Technologies Tunisia. It ingests 18 months of Ooredoo Tunisia network data — 50,000+ customer complaints and 552,000 KPI sessions — and transforms it into actionable, real-time NOC intelligence through six machine learning modules.
              </p>
              <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.9, fontWeight: 300, marginTop: 12 }}>
                The platform covers the full data science lifecycle: EDA, feature engineering, spatio-temporal analysis, anomaly detection, time-series forecasting, root cause classification, customer segmentation, and multilingual NLP complaint analysis — all surfaced through a production-grade React dashboard.
              </p>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>Context</div>
              {[
                ['Project',      'PFE Master Engineering'],
                ['Institution',  'École / Université · Tunisia'],
                ['Supervisor',   'Huawei Technologies Tunisia'],
                ['Operator',     'Ooredoo Tunisia (dataset)'],
                ['Year',         '2026'],
                ['GitHub',       'github.com/Ouerghi23'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, minWidth: 100, textTransform: 'uppercase', letterSpacing: .5 }}>{k}</div>
                  <div style={{ fontSize: 12, color: C.text }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── KPI metrics ── */}
        <SectionHeader>Platform Metrics</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {KPIs.map((k, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `2px solid ${k.color}`, padding: '18px 20px' }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 900, color: k.color, letterSpacing: '-1px', marginBottom: 6 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: .5 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* ── Architecture ── */}
        <SectionHeader>System Architecture</SectionHeader>
        <div style={{ marginBottom: 24 }}>
          <ArchDiagram />
        </div>

        {/* ── Tech stack ── */}
        <SectionHeader>Technology Stack</SectionHeader>
        <Card style={{ marginBottom: 24, padding: '28px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 40px' }}>
            {STACK.map(item => (
              <div key={item.name} style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{item.name}</span>
                    <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 10 }}>{item.role}</span>
                  </div>
                  <span style={{ fontSize: 11, color: item.color, fontWeight: 700, fontFamily: 'monospace' }}>{item.pct}%</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,.05)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: 2, transition: 'width 1s cubic-bezier(.22,1,.36,1)' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── GitHub + documents ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <div>
            <SectionHeader>Engineer Profile</SectionHeader>
            <GithubProfile username="Ouerghi23" />
          </div>
          <div>
            <SectionHeader>Resources & Documents</SectionHeader>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <DocCard
                icon="📘"
                title="NOC User Guide"
                desc="Complete guide for NOC engineers — dashboard features, KPIs, alert interpretation, and workflow."
                badge={{ variant: 'blue', label: '.docx' }}
                href="/docs/SpiriComp_NOC_UserGuide.docx"
                type="download"
              />
              <DocCard
                icon="📊"
                title="KPI/KQI Reference"
                desc="Full reference for all KPIs and KQIs used in SpiriComp — definitions, thresholds, and formulas."
                badge={{ variant: 'green', label: '.docx' }}
                href="/docs/SpiriComp_KPI_Reference.docx"
                type="download"
              />
              <DocCard
                icon="🐙"
                title="GitHub Repository"
                desc="Full source code — notebooks, backend API, React dashboard, NLP pipeline."
                badge={{ variant: 'red', label: 'GitHub' }}
                href="https://github.com/Ouerghi23"
                type="external"
              />
              <DocCard
                icon="🔌"
                title="API Documentation"
                desc="FastAPI auto-generated docs — all endpoints, request/response schemas, and examples."
                badge={{ variant: 'amber', label: 'Live' }}
                href="http://localhost:8000/docs"
                type="external"
              />
              <DocCard
                icon="📝"
                title="Client Portal"
                desc="Multilingual complaint submission form — Arabic, French, English — for Ooredoo customers."
                badge={{ variant: 'cyan', label: 'AR/FR/EN' }}
                href="http://localhost:8000/form"
                type="external"
              />
              <DocCard
                icon="📡"
                title="API Status"
                desc="Live API health check — confirms all analytics and NLP endpoints are operational."
                badge={{ variant: 'green', label: 'Health' }}
                href="http://localhost:8000/api/analytics/status"
                type="external"
              />
            </div>
          </div>
        </div>

        {/* ── ML Pipeline timeline ── */}
        <SectionHeader>ML Pipeline — Notebook Sequence</SectionHeader>
        <Card style={{ padding: '24px 28px', marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { nb: 'NB 01', title: 'EDA & Data Quality',         desc: 'Missing value analysis, outlier detection, complaint distribution by region/service/time.', color: '#3B82F6', outputs: ['complaints_clean.parquet', 'figures/d1_*.png'] },
              { nb: 'NB 02', title: 'Cleaning & Feature Eng.',    desc: 'NaN imputation, normalisation, KPI rolling windows, lag features, temporal encodings.', color: '#8B5CF6', outputs: ['feature_matrix.parquet', 'kpi_daily_agg.parquet'] },
              { nb: 'NB 03', title: 'Spatio-Temporal Analysis',   desc: 'Geospatial hotspot mapping, hourly density heatmaps, region×KPI cross-correlation.', color: '#06B6D4', outputs: ['spatiotemporal_features.parquet', 'figures/d2_*.png'] },
              { nb: 'NB 04', title: 'Correlation & Root Cause',   desc: 'Pearson/Spearman KPI correlations, Granger causality, QoE degradation event analysis.', color: '#F59E0B', outputs: ['correlation_matrix.parquet', 'reports/d3_*.csv'] },
              { nb: 'NB 05', title: 'ML Models (D4)',             desc: 'Anomaly detection, 7-day forecasting, root cause classification, customer segmentation.', color: '#CF0A2C', outputs: ['models/anomaly/', 'models/prediction/', 'models/classification/', 'models/clustering/'] },
            ].map((step, i) => (
              <div key={step.nb} style={{ display: 'flex', gap: 20, paddingBottom: 24, borderBottom: i < 4 ? `1px solid ${C.border}` : 'none', marginBottom: i < 4 ? 24 : 0 }}>
                <div style={{ flexShrink: 0, width: 52, height: 52, background: `${step.color}18`, border: `1px solid ${step.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: step.color, textAlign: 'center', lineHeight: 1.2 }}>{step.nb.split(' ').join('\n')}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{step.title}</div>
                    <div style={{ height: 1, flex: 1, background: `${step.color}30` }} />
                  </div>
                  <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7, marginBottom: 8 }}>{step.desc}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {step.outputs.map(o => (
                      <code key={o} style={{ fontSize: 9, background: 'rgba(255,255,255,.04)', border: `1px solid ${C.border}`, padding: '2px 8px', borderRadius: 3, color: C.textMuted }}>{o}</code>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  )
}