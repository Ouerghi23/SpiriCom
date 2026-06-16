// src/components/BrandPerformance.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC Dashboard — Brand Performance Section  v4
// Feeds from: GET /api/brand/performance
// Requires:   npm install simple-icons
//
// MIGRATION (vs v3):
//  BP-1  REAL BRAND ICONS. Avatars render official monochrome brand
//        marks from simple-icons (Huawei, Samsung, Apple, Xiaomi,
//        OPPO, vivo, OnePlus, Nokia, Motorola, Sony, Honor, LG, HTC).
//        Brands without a mark in the library (Realme, Tecno, Itel,
//        ZTE, Infinix, Alcatel, Wiko) fall back to the monogram tile.
//        The 🍎 emoji is gone.
//  BP-2  Local HW tokens / SectionLabel removed — imported from
//        components/UI. No T/GAP props: useTheme() + gapColor()
//        internally (update the call site in Forecasting.jsx to
//        <BrandPerformanceSection/>).
//  BP-3  Churn severity → ALARM ladder via one churnSeverity() used
//        by both the row value and the DualBar (was raw red/amber/
//        green that drifted from the system). 5G accent → blueLight.
//        Summary-KPI colors → tokens.
//  BP-4  Rank bug fixed: rank was computed AFTER Huawei was pinned,
//        so Huawei always displayed #1 regardless of its real rank.
//        Ranks now come from the pure sort order; pinning only
//        affects display position.
//  BP-5  Huawei avatar gradient used the legacy #CF0A2C — now HW.red.
//        Sponsor styling kept (brand chrome is the legitimate red).
//  BP-6  Show-more hover via CSS class (no inline mouseEnter
//        mutation). "Churn ▸ 5G" glyph → "Churn / 5G".
//        Typography floor: 7/8px labels → 9/10px.
//  BP-7  i18n integration — all hardcoded strings replaced with
//        translation keys from forecast.brand namespace.
// ─────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from 'react'
import { useTranslation }               from 'react-i18next'
import {
  ChevronDown, ChevronUp, Wifi, AlertTriangle, Users, BarChart2,
} from 'lucide-react'
import {
  siHuawei, siSamsung, siApple, siXiaomi, siOppo, siVivo,
  siOneplus, siNokia, siMotorola, siSony, siHonor, siLg, siHtc,
} from 'simple-icons'
import { useTheme }     from '../context/ThemeContext'
import { analyticsApi } from '../api/client'
import {
  HW, ALARM, FONT, gapColor, SectionLabel,
} from './UI'

// ── BP-3: one churn-severity mapping for every surface ───────────────
const churnSeverity = rate =>
  rate > 0.40 ? ALARM.critical :
  rate > 0.28 ? ALARM.major    : ALARM.normal

// ── Brand registry — official mark (simple-icons) + color + category ─
// `icon` is a simple-icons object ({ path, hex }); null → monogram tile.
export const BRAND_REGISTRY = {
  'Huawei':   { icon: siHuawei,   color: HW.red,    bg: `linear-gradient(135deg, ${HW.red}, ${HW.navy})`, initials: 'HW',   sponsor: true, category: 'flagship'  },
  'Samsung':  { icon: siSamsung,  color: '#1428A0', bg: 'linear-gradient(135deg,#1428A0,#0A1870)', initials: 'SAM',  category: 'flagship'  },
  'Apple':    { icon: siApple,    color: '#555555', bg: 'linear-gradient(135deg,#555,#222)',       initials: 'AP',   category: 'flagship'  },
  'Xiaomi':   { icon: siXiaomi,   color: '#FF6900', bg: 'linear-gradient(135deg,#FF6900,#CC4400)', initials: 'MI',   category: 'mid-range' },
  'OPPO':     { icon: siOppo,     color: '#1C8B3B', bg: 'linear-gradient(135deg,#1C8B3B,#0F5C27)', initials: 'OPPO', category: 'mid-range' },
  'vivo':     { icon: siVivo,     color: '#415FFF', bg: 'linear-gradient(135deg,#415FFF,#2233CC)', initials: 'VIVO', category: 'mid-range' },
  'OnePlus':  { icon: siOneplus,  color: '#EB0029', bg: 'linear-gradient(135deg,#EB0029,#A30020)', initials: '1+',   category: 'flagship'  },
  'Realme':   { icon: null,       color: '#F5A623', bg: 'linear-gradient(135deg,#F5A623,#C07800)', initials: 'RLM',  category: 'budget'    },
  'Nokia':    { icon: siNokia,    color: '#005AFF', bg: 'linear-gradient(135deg,#005AFF,#0033AA)', initials: 'NOK',  category: 'budget'    },
  'Tecno':    { icon: null,       color: '#00A3E0', bg: 'linear-gradient(135deg,#00A3E0,#006699)', initials: 'TCN',  category: 'budget'    },
  'Itel':     { icon: null,       color: '#E63946', bg: 'linear-gradient(135deg,#E63946,#9B0010)', initials: 'ITL',  category: 'budget'    },
  'ZTE':      { icon: null,       color: '#0068B3', bg: 'linear-gradient(135deg,#0068B3,#004080)', initials: 'ZTE',  category: 'mid-range' },
  'Infinix':  { icon: null,       color: '#B22222', bg: 'linear-gradient(135deg,#B22222,#800000)', initials: 'INF',  category: 'budget'    },
  'Motorola': { icon: siMotorola, color: '#5F4B8B', bg: 'linear-gradient(135deg,#5F4B8B,#3A2D5C)', initials: 'MOTO', category: 'mid-range' },
  'Sony':     { icon: siSony,     color: '#222222', bg: 'linear-gradient(135deg,#333,#000)',       initials: 'SONY', category: 'flagship'  },
  'Honor':    { icon: siHonor,    color: '#0066CC', bg: 'linear-gradient(135deg,#0066CC,#003E8C)', initials: 'HON',  category: 'mid-range' },
  'Alcatel':  { icon: null,       color: '#00ADEF', bg: 'linear-gradient(135deg,#00ADEF,#007AAA)', initials: 'ALC',  category: 'budget'    },
  'Wiko':     { icon: null,       color: '#00BCD4', bg: 'linear-gradient(135deg,#00BCD4,#007A8A)', initials: 'WK',   category: 'budget'    },
  'LG':       { icon: siLg,       color: '#A50034', bg: 'linear-gradient(135deg,#A50034,#6B0022)', initials: 'LG',   category: 'mid-range' },
  'HTC':      { icon: siHtc,      color: '#96C11F', bg: 'linear-gradient(135deg,#96C11F,#5C7A00)', initials: 'HTC',  category: 'mid-range' },
}

const _PALETTE = ['#6366F1', '#8B5CF6', '#EC4899', '#14B8A6',
                  '#F97316', '#84CC16', '#06B6D4', '#A855F7']

const getBrand = (name) => {
  if (!name) return { icon: null, color: ALARM.unknown, bg: ALARM.unknown,
    initials: '?', category: 'other' }
  const exact = BRAND_REGISTRY[name]
  if (exact) return exact
  const ci = Object.keys(BRAND_REGISTRY).find(k => k.toLowerCase() === name.toLowerCase())
  if (ci) return BRAND_REGISTRY[ci]
  const hash  = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const color = _PALETTE[hash % _PALETTE.length]
  return { icon: null, color, bg: `linear-gradient(135deg,${color},${color}99)`,
    initials: name.slice(0, 3).toUpperCase(), category: 'other' }
}

// ── BP-1: brand avatar — official mark, monogram fallback ────────────
function BrandAvatar({ name, size = 32 }) {
  const b = getBrand(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, flexShrink: 0,
      background: b.bg || b.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {b.icon ? (
        <svg role="img" aria-label={`${name} logo`}
          viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58}
          fill="#fff" xmlns="http://www.w3.org/2000/svg">
          <path d={b.icon.path}/>
        </svg>
      ) : (
        <span style={{
          color: '#fff', fontSize: size > 30 ? 9 : 8,
          fontWeight: 900, fontFamily: FONT.display,
          letterSpacing: '-0.3px', lineHeight: 1,
        }}>
          {b.initials || name.slice(0, 3).toUpperCase()}
        </span>
      )}
    </div>
  )
}

// ── Dual mini-bar (churn severity + 5G adoption) ──────────────────────
function DualBar({ churnRate, maxChurn, ratio5g, maxRatio }) {
  const { theme: T } = useTheme()
  const churnPct = Math.min((churnRate / Math.max(maxChurn, 0.001)) * 100, 100)
  const fivePct  = Math.min((ratio5g   / Math.max(maxRatio,  0.001)) * 100, 100)
  const track    = T.mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3,
      minWidth: 100, flex: 1 }}>
      <div style={{ height: 4, background: track, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${churnPct}%`, height: '100%',
          background: churnSeverity(churnRate),
          borderRadius: 2, transition: 'width .5s' }}/>
      </div>
      <div style={{ height: 4, background: track, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${fivePct}%`, height: '100%',
          background: `linear-gradient(90deg, ${HW.blue}, ${HW.blueLight})`,
          borderRadius: 2, transition: 'width .5s' }}/>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// MAIN EXPORT — BP-2: no props; theme + gap from hooks
// ═════════════════════════════════════════════════════════════════════
export default function BrandPerformanceSection() {
  const { t }        = useTranslation()
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)

  const [brands,    setBrands]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [sortKey,   setSortKey]   = useState('customer_count')
  const [filterCat, setFilterCat] = useState('all')
  const [showAll,   setShowAll]   = useState(false)

  useEffect(() => {
    analyticsApi.brandPerformance()
      .then(r => { setBrands(r.data?.brands || []); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  // ── Derived maxima ─────────────────────────────────────────────────
  const totalCustomers = useMemo(
    () => brands.reduce((s, b) => s + (b.customer_count || 0), 0), [brands])
  const maxChurn = useMemo(
    () => Math.max(...brands.map(b => b.churn_rate || 0), 0.01), [brands])
  const maxRatio = useMemo(
    () => Math.max(...brands.map(b => b.ratio_5g_mean || 0), 0.01), [brands])

  const categories = useMemo(() => {
    const s = new Set(brands.map(b => getBrand(b.brand_name).category || 'other'))
    return ['all', ...Array.from(s)]
  }, [brands])

  // ── BP-4: ranks from pure sort order; pin only changes position ────
  const { sorted, rankOf } = useMemo(() => {
    let list = [...brands]
    if (filterCat !== 'all')
      list = list.filter(b => (getBrand(b.brand_name).category || 'other') === filterCat)
    list.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
    const ranks = new Map(list.map((b, i) => [b.brand_name, i + 1]))
    const hwIdx = list.findIndex(b => b.brand_name?.toLowerCase() === 'huawei')
    if (hwIdx > 0) { const [hw] = list.splice(hwIdx, 1); list.unshift(hw) }
    return { sorted: list, rankOf: name => ranks.get(name) }
  }, [brands, sortKey, filterCat])

  const visible = showAll ? sorted : sorted.slice(0, 15)

  // ── Summary KPIs — BP-3: token colors ──────────────────────────────
  const summaryKpis = [
    { label: t('forecast.brand.kpi.brands'),         value: brands.length,                        icon: BarChart2,     color: HW.blue       },
    { label: t('forecast.brand.kpi.customers'),      value: totalCustomers.toLocaleString(),      icon: Users,         color: ALARM.normal  },
    { label: t('forecast.brand.kpi.highestChurn'),  value: `${(maxChurn * 100).toFixed(1)}%`,    icon: AlertTriangle, color: ALARM.critical },
    { label: t('forecast.brand.kpi.best5g'),        value: `${(maxRatio * 100).toFixed(1)}%`,    icon: Wifi,          color: HW.blueLight  },
  ]

  // ── Loading skeleton ──────────────────────────────────────────────
  if (loading) return (
    <div style={{ marginTop: 44 }}>
      <SectionLabel sub={t('forecast.brand.loading')}>
        {t('forecast.brandSection')}
      </SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: 52, background: T.bgCard, opacity: 0.3 + i * 0.1 }}/>
        ))}
      </div>
    </div>
  )

  // ── Empty / error state ───────────────────────────────────────────
  if (error || brands.length === 0) return (
    <div style={{ marginTop: 44 }}>
      <SectionLabel sub={t('forecast.brand.errorSub')}>
        {t('forecast.brandSection')}
      </SectionLabel>
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`,
        padding: '40px 24px', textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
        {t('forecast.brand.unavailable')}
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>
          {t('forecast.brand.errorDesc')}
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <style>{`
        .bp-row:hover { background: ${T.mode === 'dark'
          ? 'rgba(0,147,213,.05)' : 'rgba(0,147,213,.03)'} !important; }
        .bp-row:hover .bp-brand-name { color: ${HW.blue} !important; }
        .bp-more { transition: all .18s; }
        .bp-more:hover { border-color: ${HW.blue} !important; color: ${HW.blue} !important; }
      `}</style>

      {/* ── Section header ── */}
      <SectionLabel
        sub={t('forecast.brand.subtitle', { 
          count: brands.length, 
          customers: totalCustomers.toLocaleString() 
        })}
        action={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {categories.map(c => (
                <button key={c} onClick={() => setFilterCat(c)}
                  aria-pressed={filterCat === c}
                  style={{
                    padding: '4px 10px', fontSize: 9, fontWeight: 800,
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                    cursor: 'pointer', fontFamily: 'inherit',
                    border: `1px solid ${filterCat === c ? HW.blue : T.border}`,
                    background: filterCat === c ? HW.blueDim : 'transparent',
                    color: filterCat === c ? HW.blue : T.textDim,
                    transition: 'all .15s',
                  }}>
                  {c === 'all' ? t('forecast.brand.filterAll') : c}
                </button>
              ))}
            </div>
            <select value={sortKey} onChange={e => setSortKey(e.target.value)}
              aria-label={t('forecast.brand.sortLabel')}
              style={{
                appearance: 'none', background: T.bgCard, color: T.text,
                border: `1px solid ${T.border}`, padding: '5px 10px',
                fontSize: 9, fontWeight: 700, fontFamily: 'inherit',
                letterSpacing: '1px', cursor: 'pointer', outline: 'none',
              }}>
              <option value="customer_count">{t('forecast.brand.sortCustomers')}</option>
              <option value="churn_rate">{t('forecast.brand.sortChurn')}</option>
              <option value="ratio_5g_mean">{t('forecast.brand.sort5gAdoption')}</option>
              <option value="traffic_5g_mean">{t('forecast.brand.sort5gTraffic')}</option>
            </select>
          </div>
        }
      >
        {t('forecast.brandSection')}
      </SectionLabel>

      {/* ── Summary KPI strip ── */}
      <div style={{ display: 'flex', gap: 1, background: GAP, marginBottom: 1 }}>
        {summaryKpis.map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{
            flex: 1, background: T.bgCard, padding: '11px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: `2px solid ${color}22`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icon size={12} color={color}/>
              <span style={{ fontSize: 9, fontWeight: 700, color: T.textDim,
                letterSpacing: '1.5px', textTransform: 'uppercase' }}>{label}</span>
            </div>
            <span style={{ fontFamily: FONT.display,
              fontSize: 18, fontWeight: 900, color }}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── Column header ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 80px 110px 60px 60px 64px',
        gap: '0 12px', alignItems: 'center',
        padding: '7px 14px',
        background: T.mode === 'dark' ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.04)',
        borderBottom: `1px solid ${T.border}`,
        fontSize: 9, fontWeight: 800, color: T.textDim, letterSpacing: '1.5px',
        textTransform: 'uppercase',
      }}>
        <span/>
        <span>{t('forecast.brand.table.brand')}</span>
        <span style={{ textAlign: 'right' }}>{t('forecast.brand.table.customers')}</span>
        <span style={{ paddingLeft: 4 }}>{t('forecast.brand.table.churn5g')}</span>
        <span style={{ textAlign: 'right' }}>{t('forecast.brand.table.churnPct')}</span>
        <span style={{ textAlign: 'right' }}>{t('forecast.brand.table.fiveGPct')}</span>
        <span style={{ textAlign: 'right' }}>{t('forecast.brand.table.traffic')}</span>
      </div>

      {/* ── Brand rows ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visible.map(b => {
          const cfg        = getBrand(b.brand_name)
          const isHuawei   = cfg.sponsor === true
          const rank       = rankOf(b.brand_name)
          const churnPct   = ((b.churn_rate || 0) * 100).toFixed(1)
          const fivePct    = ((b.ratio_5g_mean || 0) * 100).toFixed(1)
          const sharePct   = ((b.customer_count / Math.max(totalCustomers, 1)) * 100).toFixed(1)
          const trafficMB  = ((b.traffic_5g_mean || 0) / 1e6).toFixed(2)
          const churnColor = churnSeverity(b.churn_rate || 0)

          return (
            <div key={b.brand_name} className="bp-row" style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 80px 110px 60px 60px 64px',
              gap: '0 12px', alignItems: 'center',
              padding: '10px 14px',
              background: isHuawei
                ? (T.mode === 'dark' ? 'rgba(238,58,67,.04)' : 'rgba(238,58,67,.02)')
                : T.bgCard,
              border: `1px solid ${isHuawei ? HW.redBd : T.border}`,
              borderLeft: `3px solid ${isHuawei ? HW.red : cfg.color}`,
              transition: 'all .18s',
              position: 'relative',
            }}>
              <BrandAvatar name={b.brand_name} size={32}/>

              {/* Brand name + meta */}
              <div>
                <div className="bp-brand-name" style={{
                  fontSize: 12, fontWeight: 700, color: T.text,
                  letterSpacing: '.2px', transition: 'color .15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {b.brand_name}
                  {isHuawei && (
                    <span style={{ fontSize: 9, fontWeight: 800,
                      letterSpacing: '1.5px', color: HW.red,
                      background: HW.redDim, border: `1px solid ${HW.redBd}`,
                      padding: '1px 5px' }}>
                      {t('forecast.brand.sponsor')}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: T.textDim,
                  letterSpacing: '1px', marginTop: 1 }}>
                  #{rank} · {t(`forecast.brand.categories.${cfg.category || 'device'}`)} · {sharePct}% {t('forecast.brand.share')}
                </div>
              </div>

              {/* Customers */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: FONT.display, fontSize: 15,
                  fontWeight: 800, color: T.text, lineHeight: 1 }}>
                  {b.customer_count?.toLocaleString()}
                </div>
                <div style={{ fontSize: 9, color: T.textDim, marginTop: 1 }}>
                  {t('forecast.brand.users')}
                </div>
              </div>

              <DualBar
                churnRate={b.churn_rate || 0} maxChurn={maxChurn}
                ratio5g={b.ratio_5g_mean || 0} maxRatio={maxRatio}/>

              {/* Churn % — BP-3 */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: FONT.display, fontSize: 15,
                  fontWeight: 800, color: churnColor }}>
                  {churnPct}%
                </span>
              </div>

              {/* 5G % — token */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: FONT.display, fontSize: 15,
                  fontWeight: 800, color: HW.blueLight }}>
                  {fivePct}%
                </span>
              </div>

              {/* Traffic */}
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: FONT.display, fontSize: 13,
                  fontWeight: 700, color: T.textMuted }}>
                  {trafficMB}
                </span>
                <span style={{ fontSize: 9, color: T.textDim, marginLeft: 2 }}>MB</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Show more / less — BP-6: CSS hover ── */}
      {sorted.length > 15 && (
        <button className="bp-more" onClick={() => setShowAll(v => !v)}
          aria-expanded={showAll}
          style={{
            marginTop: 1, width: '100%', padding: 10,
            background: T.bgCard, border: `1px solid ${T.border}`,
            color: T.textDim, fontSize: 10, fontWeight: 800,
            letterSpacing: '2px', textTransform: 'uppercase',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 6,
          }}>
          {showAll
            ? <><ChevronUp size={11}/> {t('forecast.brand.showTop')}</>
            : <><ChevronDown size={11}/> {t('forecast.brand.showAll', { count: sorted.length })}</>}
        </button>
      )}
    </div>
  )
}