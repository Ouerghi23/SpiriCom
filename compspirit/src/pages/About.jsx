// src/pages/About.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriComp — NOC Intelligence Platform
// Professional enterprise page for NOC Engineers · Huawei Tunisia
//
// Changes from original:
//   - All emoji icons replaced with Lucide React
//   - Full react-i18next (about.* keys, EN + ZH)
//   - Card/PageHeader/THEME replaced with inline dark design system
//   - Technical content rewritten for NOC engineer audience
//   - Huawei enterprise tone throughout
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect }  from 'react'
import { useTranslation }        from 'react-i18next'
import {
  Brain, Radio, Signal, Globe, Cpu, BarChart3,
  Building2, Smartphone, Network, Database,
  GitBranch, TrendingUp, Users, Layers,
  FileText, BookOpen, Github, Activity,
  ExternalLink, Download, MapPin, Zap,
  ShieldCheck, Award, ChevronRight, Code2,
  Server, Box,
} from 'lucide-react'
import { Badge } from '../components/UI'

// ── Colour palette ────────────────────────────────────────────────────
const C = {
  bg:        '#080808',
  bg2:       '#0C0C0C',
  bg3:       '#0A0A0A',
  surface:   '#0C0C0C',
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

// ── Section label (matches all other pages) ───────────────────────────
const SLabel = ({ children }) => (
  <div style={{
    fontSize: 10, fontWeight: 800, color: C.red,
    letterSpacing: '4.5px', textTransform: 'uppercase',
    display: 'flex', alignItems: 'center', marginBottom: 16,
  }}>
    <span style={{ width: 22, height: 1, background: C.red, display: 'inline-block', flexShrink: 0, marginRight: 12 }}/>
    {children}
  </div>
)

// ── Panel card (replaces old Card component) ──────────────────────────
const Panel = ({ children, style = {} }) => (
  <div style={{
    background: C.surface, border: `1px solid ${C.border}`,
    position: 'relative', overflow: 'hidden', ...style,
  }}>
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: '1.5px',
      background: `linear-gradient(90deg, transparent, ${C.red}, transparent)`,
    }}/>
    {children}
  </div>
)

// ── Innovation pillar card ─────────────────────────────────────────────
function PillarCard({ Icon, title, tag, body, accent }) {
  return (
    <div
      className="about-pillar"
      style={{
        background: C.bg3, border: `1px solid ${C.border}`,
        padding: '28px 26px', position: 'relative', overflow: 'hidden',
        transition: 'all .3s cubic-bezier(.22,1,.36,1)', cursor: 'default',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}/>

      {/* Icon + Tag row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{
          width: 46, height: 46,
          background: `${accent}10`, border: `1px solid ${accent}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={accent}/>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '2px', padding: '3px 10px',
          border: `1px solid ${accent}30`, color: accent,
          textTransform: 'uppercase', background: `${accent}08`,
        }}>
          {tag}
        </span>
      </div>

      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 18, fontWeight: 800, color: C.text,
        letterSpacing: '-.3px', marginBottom: 12, lineHeight: 1.2,
      }}>
        {title}
      </div>
      <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.85, margin: 0, fontWeight: 300 }}>
        {body}
      </p>
    </div>
  )
}

// ── Partner card ───────────────────────────────────────────────────────
function PartnerCard({ Icon, name, role, color, detail }) {
  return (
    <div
      className="about-partner"
      style={{
        background: C.bg3, border: `1px solid ${C.border}`,
        padding: '28px 30px', display: 'flex', alignItems: 'flex-start', gap: 22,
        transition: 'all .25s', position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}/>
      <div style={{
        width: 52, height: 52, flexShrink: 0,
        background: `${color}10`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} color={color}/>
      </div>
      <div>
        <div style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 7 }}>{role}</div>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-.3px', marginBottom: 12,
        }}>
          {name}
        </div>
        <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.85, margin: 0, fontWeight: 300 }}>{detail}</p>
      </div>
    </div>
  )
}

// ── Architecture diagram ───────────────────────────────────────────────
function ArchDiagram({ t }) {
  const layers = [
    { label: t('about.archL1'), color: C.blue,   Icon: Database,  items: ['complaints_clean.parquet', 'kpi_daily_agg.parquet', 'feature_matrix.parquet'] },
    { label: t('about.archL2'), color: C.red,    Icon: Brain,     items: ['Anomaly Detection', 'Spike Forecasting', 'Root Cause RCA', 'User Clustering'] },
    { label: t('about.archL3'), color: C.amber,  Icon: Box,       items: ['models/anomaly/', 'models/prediction/', 'models/classification/', 'models/clustering/'] },
    { label: t('about.archL4'), color: C.green,  Icon: Server,    items: ['analytics_api.py', 'nlp_api.py', 'SQLite complaints.db'] },
    { label: t('about.archL5'), color: C.purple, Icon: BarChart3, items: ['React / Vite', 'ApexCharts', 'Leaflet', 'NOC Engineer UI'] },
  ]
  return (
    <Panel style={{ padding: '24px' }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {layers.map((layer, i) => (
          <div key={layer.label} style={{ flex: 1, position: 'relative' }}>
            {i < layers.length - 1 && (
              <div style={{ position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}>
                <ChevronRight size={14} color="rgba(255,255,255,.2)"/>
              </div>
            )}
            <div style={{
              margin: '0 5px', padding: '18px 14px',
              background: `${layer.color}08`, border: `1px solid ${layer.color}28`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <layer.Icon size={12} color={layer.color}/>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: layer.color }}>
                  {layer.label}
                </div>
              </div>
              {layer.items.map(item => (
                <div key={item} style={{ fontSize: 9, color: C.textMuted, marginBottom: 5, lineHeight: 1.5, fontFamily: 'monospace' }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ── GitHub live card ───────────────────────────────────────────────────
function GithubProfile({ username, t }) {
  const [data,    setData]    = useState(null)
  const [repos,   setRepos]   = useState([])
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
    <Panel style={{ overflow: 'hidden' }}>
      <a
        href={`https://github.com/${username}`}
        target="_blank" rel="noreferrer"
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div style={{ padding: '24px 26px 18px', borderBottom: `1px solid ${C.border}` }}>
          {loading ? (
            <div style={{ color: C.textMuted, fontSize: 11, letterSpacing: 2 }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
              {data?.avatar_url && (
                <img src={data.avatar_url} alt={username} style={{ width: 68, height: 68, borderRadius: '50%', border: `2px solid rgba(207,10,44,.4)`, objectFit: 'cover', flexShrink: 0 }}/>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 900, color: C.text, letterSpacing: '-.3px', marginBottom: 4 }}>
                  {data?.name || username}
                </div>
                <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginBottom: 8 }}>@{username}</div>
                {data?.bio && (
                  <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 10 }}>{data.bio}</div>
                )}
                {data?.location && (
                  <div style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <MapPin size={10} color={C.textDim}/> {data.location}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
                  {[['Public Repos', data?.public_repos ?? '—'], ['Followers', data?.followers ?? '—'], ['Following', data?.following ?? '—']].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 900, color: C.red, letterSpacing: '-1px', lineHeight: 1 }}>{val}</div>
                      <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 3 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {repos.length > 0 && (
          <div style={{ padding: '14px 26px 22px' }}>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 12, fontWeight: 700 }}>
              {t('about.recentRepos')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {repos.slice(0, 4).map(repo => (
                <div key={repo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{repo.name}</div>
                    {repo.description && (
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {repo.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {repo.language && (
                      <span style={{ fontSize: 9, color: C.textDim, background: 'rgba(255,255,255,.04)', border: `1px solid ${C.border}`, padding: '2px 8px' }}>
                        {repo.language}
                      </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.textDim }}>
                      <Award size={9} color={C.textDim}/> {repo.stargazers_count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.red }}>
              <Github size={13} color={C.red}/> github.com/{username}
              <ExternalLink size={10} color={C.red}/>
            </div>
          </div>
        )}
      </a>
    </Panel>
  )
}

// ── Document / resource card ───────────────────────────────────────────
function DocCard({ Icon, iconColor, title, desc, badge, href, type = 'external' }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
      <div
        className="about-doc"
        style={{
          background: C.bg3, border: `1px solid ${C.border}`,
          padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10,
          transition: 'all .25s', cursor: 'pointer', height: '100%',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{
            width: 36, height: 36,
            background: `${iconColor}10`, border: `1px solid ${iconColor}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon size={16} color={iconColor}/>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '-.2px' }}>{title}</div>
        <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.65, flex: 1 }}>{desc}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: C.red }}>
          {type === 'download'
            ? <><Download size={10} color={C.red}/> Download</>
            : <><ExternalLink size={10} color={C.red}/> Open</>
          }
        </div>
      </div>
    </a>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function About() {
  const { t } = useTranslation()

  // ── Platform KPIs ────────────────────────────────────────────────
  const KPIS = [
    { value: '50K+',   label: t('about.kpiComplaints'), color: C.red    },
    { value: '552K',   label: t('about.kpiSessions'),   color: C.blue   },
    { value: '24',     label: t('about.kpiGov'),         color: C.green  },
    { value: '~4 500', label: t('about.kpiSites'),       color: C.purple },
    { value: '89%+',   label: t('about.kpiRca'),         color: C.amber  },
    { value: '2.91',   label: t('about.kpiForecast'),    color: C.cyan   },
    { value: '18 mo',  label: t('about.kpiHistory'),     color: C.orange },
    { value: '6',      label: t('about.kpiModules'),     color: '#EC4899'},
  ]

  // ── Innovation pillars ────────────────────────────────────────────
  const PILLARS = [
    { Icon: ShieldCheck, tag: t('about.p1Tag'), title: t('about.p1Title'), accent: C.red,    body: t('about.p1Body') },
    { Icon: TrendingUp,  tag: t('about.p2Tag'), title: t('about.p2Title'), accent: C.blue,   body: t('about.p2Body') },
    { Icon: Signal,      tag: t('about.p3Tag'), title: t('about.p3Title'), accent: C.green,  body: t('about.p3Body') },
    { Icon: Globe,       tag: t('about.p4Tag'), title: t('about.p4Title'), accent: C.cyan,   body: t('about.p4Body') },
  ]

  // ── Tech stack ────────────────────────────────────────────────────
  const STACK = [
    { name: 'Python 3.11',     role: 'Data pipeline · ML models',        color: C.blue,   pct: 95, Icon: Code2   },
    { name: 'FastAPI',         role: 'REST analytics + NLP API',          color: C.green,  pct: 88, Icon: Zap     },
    { name: 'React + Vite',    role: 'NOC dashboard frontend',            color: C.purple, pct: 90, Icon: Layers  },
    { name: 'Scikit-learn',    role: 'Anomaly detection · NLP classifier',color: C.amber,  pct: 85, Icon: Brain   },
    { name: 'XGBoost',         role: 'Forecasting · RCA classification',  color: C.red,    pct: 88, Icon: BarChart3},
    { name: 'Prophet + ARIMA', role: 'Time-series seasonality',           color: C.cyan,   pct: 78, Icon: TrendingUp},
    { name: 'Leaflet.js',      role: 'Geospatial complaint map',          color: C.green,  pct: 72, Icon: MapPin  },
    { name: 'Pandas · NumPy',  role: 'Data wrangling · feature eng.',     color: '#6366F1',pct: 93, Icon: Database},
  ]

  // ── ML notebook steps ─────────────────────────────────────────────
  const ML_STEPS = [
    { nb: 'NB 01', color: C.blue,   Icon: Database,  title: 'EDA & Data Quality',
      desc: 'Missing value analysis, outlier detection, complaint distribution by region, service type, and time dimension. Establishes data quality baseline before any feature engineering.',
      outputs: ['complaints_clean.parquet', 'figures/d1_*.png'] },
    { nb: 'NB 02', color: C.purple, Icon: GitBranch, title: 'Cleaning & Feature Engineering',
      desc: 'NaN imputation, normalisation, KPI rolling windows, lag features, temporal encodings. Produces the feature matrix that feeds all downstream ML models.',
      outputs: ['feature_matrix.parquet', 'kpi_daily_agg.parquet'] },
    { nb: 'NB 03', color: C.cyan,   Icon: MapPin,    title: 'Spatio-Temporal Analysis',
      desc: "Geospatial hotspot mapping, hourly density heatmaps, region × KPI cross-correlation. Surfaces where and when network QoE degrades across Tunisia's 24 governorates.",
      outputs: ['spatiotemporal_features.parquet', 'figures/d2_*.png'] },
    { nb: 'NB 04', color: C.amber,  Icon: Network,   title: 'Correlation & Root Cause',
      desc: 'Pearson/Spearman KPI correlations, Granger causality, QoE degradation event analysis. Links KPI drops directly to complaint volume spikes and service impact.',
      outputs: ['correlation_matrix.parquet', 'reports/d3_*.csv'] },
    { nb: 'NB 05', color: C.red,    Icon: Brain,     title: 'ML Models — D4',
      desc: 'Production training: Isolation Forest anomaly detection, XGBoost + Prophet + ARIMA ensemble forecasting, XGBoost root cause classification, K-Means subscriber segmentation. All models serialised to disk.',
      outputs: ['models/anomaly/', 'models/prediction/', 'models/classification/', 'models/clustering/'] },
  ]

  // ── Resource cards ────────────────────────────────────────────────
  const DOCS = [
    { Icon: BookOpen,    iconColor: C.blue,   title: t('about.docNoc'),    desc: t('about.docNocDesc'),    badge: { variant: 'blue',  label: '.docx'  }, href: '/docs/SpiriComp_NOC_UserGuide.docx',        type: 'download' },
    { Icon: FileText,    iconColor: C.green,  title: t('about.docKpi'),    desc: t('about.docKpiDesc'),    badge: { variant: 'green', label: '.docx'  }, href: '/docs/SpiriComp_KPI_Reference.docx',         type: 'download' },
    { Icon: Github,      iconColor: C.text,   title: t('about.docGithub'), desc: t('about.docGithubDesc'), badge: { variant: 'red',   label: 'GitHub' }, href: 'https://github.com/Ouerghi23',               type: 'external' },
    { Icon: Activity,    iconColor: C.amber,  title: t('about.docApi'),    desc: t('about.docApiDesc'),    badge: { variant: 'amber', label: 'Live'   }, href: 'http://localhost:8000/docs',                 type: 'external' },
    { Icon: Users,       iconColor: C.cyan,   title: t('about.docPortal'), desc: t('about.docPortalDesc'), badge: { variant: 'cyan',  label: 'AR/FR/EN'}, href: '/form',                                    type: 'external' },
    { Icon: ShieldCheck, iconColor: C.green,  title: t('about.docHealth'), desc: t('about.docHealthDesc'), badge: { variant: 'green', label: 'Health' }, href: 'http://localhost:8000/api/analytics/status', type: 'external' },
  ]

  // ── Meta info row ─────────────────────────────────────────────────
  const META = [
    [t('about.metaProject'),  t('about.metaProjectVal')],
    [t('about.metaPartner'),  t('about.metaPartnerVal')],
    [t('about.metaOperator'), t('about.metaOperatorVal')],
    [t('about.metaData'),     t('about.metaDataVal')],
    [t('about.metaYear'),     t('about.metaYearVal')],
    [t('about.metaAuthor'),   t('about.metaAuthorVal')],
  ]

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>

      <style>{`
        @keyframes about-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        .about-pillar:hover  { border-color:rgba(207,10,44,.22)!important; background:rgba(207,10,44,.025)!important; transform:translateY(-3px); box-shadow:0 12px 32px rgba(207,10,44,.07); }
        .about-partner:hover { border-color:rgba(207,10,44,.2)!important; transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.25); }
        .about-doc:hover     { border-color:rgba(207,10,44,.25)!important; background:rgba(207,10,44,.025)!important; transform:translateY(-2px); }
      `}</style>

      <div style={{ padding: '40px 48px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── HERO ──────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(207,10,44,.06) 0%, rgba(255,255,255,.008) 60%)',
          border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.red}`,
          padding: '44px 48px', marginBottom: 1, position: 'relative', overflow: 'hidden',
        }}>
          {/* Grid pattern */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(207,10,44,.05) 1px, transparent 1px)', backgroundSize: '28px 28px', pointerEvents: 'none' }}/>
          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* Live badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(207,10,44,.1)', border: '1px solid rgba(207,10,44,.28)', padding: '5px 14px', marginBottom: 24 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block', animation: 'about-pulse 2s ease-in-out infinite' }}/>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: C.red }}>
                {t('about.heroBadge')}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 40, alignItems: 'flex-start' }}>
              <div>
                <h1 style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 'clamp(36px,4vw,68px)', fontWeight: 900,
                  letterSpacing: '-2px', lineHeight: .92, color: C.text, marginBottom: 22,
                }}>
                  {t('about.heroTitle1')}<br/>
                  <span style={{ color: C.red, fontStyle: 'italic' }}>{t('about.heroTitle2')}</span><br/>
                  <span style={{ color: C.textMuted, fontSize: 'clamp(22px,2.5vw,42px)', fontStyle: 'normal' }}>{t('about.heroTitle3')}</span>
                </h1>

                <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.9, maxWidth: 640, fontWeight: 300, marginBottom: 24 }}>
                  {t('about.heroDesc')}
                </p>

                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {(t('about.tags', { returnObjects: true }) || []).map(tag => (
                    <span key={tag} style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase',
                      padding: '5px 14px', border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.025)', color: C.textMuted,
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Meta info block */}
              <div style={{ background: C.bg3, border: `1px solid ${C.border}`, padding: '22px 26px', minWidth: 230 }}>
                {META.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid rgba(255,255,255,.04)` }}>
                    <span style={{ fontSize: 9, color: C.textDim, fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', minWidth: 72 }}>{k}</span>
                    <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI STRIP ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'rgba(255,255,255,.04)', marginBottom: 1 }}>
          {KPIS.map((k, i) => (
            <div key={i} style={{ background: C.bg3, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${k.color}, transparent)` }}/>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 900, color: k.color, letterSpacing: '-1px', lineHeight: 1, marginBottom: 6 }}>
                {k.value}
              </div>
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600 }}>
                {k.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── INNOVATION PILLARS ─────────────────────────────────────── */}
        <div style={{ marginTop: 52 }}>
          <SLabel>{t('about.pillarsSection')}</SLabel>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(22px,2.5vw,36px)', fontWeight: 900, color: C.text, letterSpacing: '-1px', marginBottom: 6 }}>
            {t('about.pillarsTitle')}
          </h2>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>{t('about.pillarsSub')}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1, background: 'rgba(255,255,255,.04)', marginBottom: 1 }}>
          {PILLARS.map(p => <PillarCard key={p.tag} {...p}/>)}
        </div>

        {/* ── STRATEGIC PARTNERS ───────────────────────────────────── */}
        <div style={{ marginTop: 52 }}>
          <SLabel>{t('about.partnerSection')}</SLabel>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(22px,2.5vw,36px)', fontWeight: 900, color: C.text, letterSpacing: '-1px', marginBottom: 6 }}>
            {t('about.partnerTitle')}
          </h2>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>{t('about.partnerSub')}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)', marginBottom: 1 }}>
          <PartnerCard Icon={Building2}  name={t('about.huaweiName')}  role={t('about.huaweiRole')}  color={C.red}  detail={t('about.huaweiDetail')}/>
          <PartnerCard Icon={Smartphone} name={t('about.ooredooName')} role={t('about.ooredooRole')} color={C.blue} detail={t('about.ooredooDetail')}/>
        </div>

        {/* ── SYSTEM ARCHITECTURE ─────────────────────────────────── */}
        <div style={{ marginTop: 52 }}>
          <SLabel>{t('about.archSection')}</SLabel>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(22px,2.5vw,36px)', fontWeight: 900, color: C.text, letterSpacing: '-1px', marginBottom: 6 }}>
            {t('about.archTitle')}
          </h2>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>{t('about.archSub')}</p>
        </div>
        <ArchDiagram t={t}/>

        {/* ── ML PIPELINE ─────────────────────────────────────────── */}
        <div style={{ marginTop: 52 }}>
          <SLabel>{t('about.mlSection')}</SLabel>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(22px,2.5vw,36px)', fontWeight: 900, color: C.text, letterSpacing: '-1px', marginBottom: 6 }}>
            {t('about.mlTitle')}
          </h2>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>{t('about.mlSub')}</p>
        </div>
        <Panel style={{ padding: '24px 28px' }}>
          {ML_STEPS.map((step, i) => (
            <div key={step.nb} style={{ display: 'flex', gap: 20, paddingBottom: i < 4 ? 24 : 0, borderBottom: i < 4 ? `1px solid ${C.border}` : 'none', marginBottom: i < 4 ? 24 : 0 }}>
              {/* Step icon */}
              <div style={{ flexShrink: 0, width: 52, height: 52, background: `${step.color}14`, border: `1px solid ${step.color}35`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <step.Icon size={14} color={step.color}/>
                <div style={{ fontSize: 8, fontWeight: 900, color: step.color, textAlign: 'center', letterSpacing: '.3px' }}>{step.nb}</div>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{step.title}</div>
                  <div style={{ height: 1, flex: 1, background: `${step.color}30` }}/>
                </div>
                <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.75, marginBottom: 10, fontWeight: 300 }}>{step.desc}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {step.outputs.map(o => (
                    <code key={o} style={{ fontSize: 9, background: 'rgba(255,255,255,.04)', border: `1px solid ${C.border}`, padding: '2px 9px', color: C.textMuted, letterSpacing: '.3px' }}>
                      {o}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </Panel>

        {/* ── TECH STACK ───────────────────────────────────────────── */}
        <div style={{ marginTop: 52 }}>
          <SLabel>{t('about.stackSection')}</SLabel>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(22px,2.5vw,36px)', fontWeight: 900, color: C.text, letterSpacing: '-1px', marginBottom: 6 }}>
            {t('about.stackTitle')}
          </h2>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>{t('about.stackSub')}</p>
        </div>
        <Panel style={{ padding: '26px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 40px' }}>
            {STACK.map(item => (
              <div key={item.name} style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <item.Icon size={13} color={item.color}/>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{item.name}</span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>{item.role}</span>
                  </div>
                  <span style={{ fontSize: 11, color: item.color, fontWeight: 800, fontFamily: 'monospace', flexShrink: 0 }}>{item.pct}%</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,.05)' }}>
                  <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, transition: 'width 1s cubic-bezier(.22,1,.36,1)' }}/>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* ── AUTHOR + RESOURCES ───────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginTop: 52 }}>
          {/* Author */}
          <div>
            <SLabel>{t('about.authorSection')}</SLabel>
            <GithubProfile username="Ouerghi23" t={t}/>
          </div>

          {/* Resources */}
          <div>
            <SLabel>{t('about.resourceSection')}</SLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,.04)' }}>
              {DOCS.map(d => <DocCard key={d.title} {...d}/>)}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}