// src/components/UI.jsx

import { useTheme } from '../context/ThemeContext'

export { DARK as THEME } from '../context/ThemeContext'

// ════════════════════════════════════════════════════════════════════
// 1. TOKENS
// ════════════════════════════════════════════════════════════════════

// ── Brand (chrome only — never to encode data state) ─────────────────
export const HW = {
  red:       '#EE3A43',
  redHover:  '#D42F38',
  redDim:    'rgba(238,58,67,.10)',
  redBd:     'rgba(238,58,67,.28)',
  redGlow:   'rgba(238,58,67,.18)',
  blue:      '#0093D5',
  blueDim:   'rgba(0,147,213,.10)',
  blueBd:    'rgba(0,147,213,.28)',
  blueGlow:  'rgba(0,147,213,.22)',
  blueLight: '#00C3FF',
  navy:      '#001F3F',
  navyMid:   '#0C2D4E',
}

// ── Alarm severity (the ONLY palette for problem/health states) ──────
export const ALARM = {
  critical: '#DC2626',
  major:    '#EA580C',
  minor:    '#CA8A04',
  warning:  '#0093D5',
  normal:   '#16A34A',
  unknown:  '#6B7280',
}

export const sevDim = (hex, a = '12') => `${hex}${a}`
export const sevBd  = (hex)          => `${hex}40`

export const FONT = {
  display: "'Barlow Condensed', sans-serif",
  body:    "'Barlow', 'Inter', system-ui, sans-serif",
}

export const PALETTE = [
  HW.blue, ALARM.critical, ALARM.normal, ALARM.minor,
  '#8B5CF6', '#F97316', '#14B8A6', '#EC4899', '#6366F1', '#84CC16',
]

const BLUE_RAMP = [
  '#00C3FF', '#0093D5', '#1A9FD9', '#33ABDE', '#4DB7E2',
  '#0077B3', '#66C3E7', '#005F8F', '#80CFEC', '#004B73',
]
export const blueRamp = i => BLUE_RAMP[i % BLUE_RAMP.length]

export const gapColor = T =>
  T.mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.09)'

export const gridLine = T =>
  T.mode === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)'

export const FLOAT = {
  fab:        48,
  fabIcon:    20,
  gap:        12,
  right:      24,
  bottom:     24,
  panelW:     372,
  panelH:     520,
  panelShadow:'0 20px 60px rgba(0,0,0,.55)',
  accentH:    2,
  headerPad:  '12px 14px 10px',
  avatar:     28,
  control:    36,
  radius:     4,
  bubbleRadius: 8,
  z: { fabTop: 9999, fabSecond: 9998, panel: 9997, controls: 9996 },
}
FLOAT.fabBottom   = n => FLOAT.bottom + n * (FLOAT.fab + FLOAT.gap)
FLOAT.panelBottom = FLOAT.fabBottom(1) + FLOAT.fab + FLOAT.gap
FLOAT.panelRight  = k => FLOAT.right + k * (FLOAT.panelW + FLOAT.gap)

// ════════════════════════════════════════════════════════════════════
// 2. GLOBAL STYLES
// ════════════════════════════════════════════════════════════════════
export const NocBaseStyles = () => {
  const { theme: T } = useTheme()
  return (
    <style>{`
      @keyframes noc-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.78)} }
      @keyframes noc-spin  { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      @keyframes noc-dots  { 0%,80%,100%{opacity:.25;transform:scale(.75)} 40%{opacity:1;transform:scale(1)} }

      .noc-stat { transition: all .3s cubic-bezier(.22,1,.36,1); cursor: default; }
      .noc-stat:hover {
        border-color: ${HW.blueBd} !important;
        background: ${HW.blueDim} !important;
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,147,213,.10);
      }

      .noc-panel { transition: border-color .3s; }
      .noc-panel:hover { border-color: ${HW.blueBd} !important; }
      .noc-panel:hover .noc-panel-accent { transform: scaleX(1) !important; }

      .noc-info { transition: all .25s; }
      .noc-info:hover {
        border-left-color: ${HW.blue} !important;
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(0,147,213,.08);
      }

      @media (prefers-reduced-motion: reduce) {
        .noc-stat, .noc-panel, .noc-info,
        .noc-stat:hover, .noc-info:hover { transition: none; transform: none; }
        [style*="noc-pulse"], [style*="noc-spin"], [style*="noc-dots"] { animation: none !important; }
      }
    `}</style>
  )
}

// ════════════════════════════════════════════════════════════════════
// 3. STRUCTURE
// ════════════════════════════════════════════════════════════════════

export const SectionLabel = ({ children, sub, action }) => {
  const { theme: T } = useTheme()
  return (
    <div style={{ marginTop: 44, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          fontSize: 10, fontWeight: 800, color: HW.blue,
          letterSpacing: '4px', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 20, height: 1.5, background: HW.blue,
            display: 'inline-block', borderRadius: 1 }}/>
          {children}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1px',
          marginTop: 5, paddingLeft: 32, lineHeight: 1.5 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export const ChartPanel = ({ title, sub, action, children, style = {} }) => {
  const { theme: T } = useTheme()
  return (
    <div className="noc-panel" style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      padding: '22px 24px', position: 'relative', overflow: 'hidden',
      ...style,
    }}>
      <div className="noc-panel-accent" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
        background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)`,
        transform: 'scaleX(0)', transformOrigin: 'center',
        transition: 'transform .4s ease',
      }}/>
      {(title || sub || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            {title && (
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text,
                letterSpacing: '.4px', marginBottom: 3 }}>
                {title}
              </div>
            )}
            {sub && (
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1px' }}>
                {sub}
              </div>
            )}
          </div>
          {action && <div style={{ flexShrink: 0, marginLeft: 16 }}>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export const GapGrid = ({ columns = 'repeat(4,1fr)', children, style = {} }) => {
  const { theme: T } = useTheme()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: columns,
      gap: 1, background: gapColor(T), ...style }}>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// 4. DATA DISPLAY — stats, strips, badges, banners, gauges
// ════════════════════════════════════════════════════════════════════

export const StatBlock = ({
  label, value, unit, delta, good, color, icon: IconComp, sub, alert,
  deltaIcons,
}) => {
  const { theme: T } = useTheme()
  const accent = color || HW.blue
  const deltaColor = good
    ? (delta >= 0 ? ALARM.normal   : ALARM.critical)
    : (delta >= 0 ? ALARM.critical : ALARM.normal)
  const DeltaIcon = deltaIcons
    ? (delta > 0 ? deltaIcons.up : delta < 0 ? deltaIcons.down : deltaIcons.flat)
    : null

  return (
    <div className="noc-stat" style={{
      background: T.bgCard,
      border:     `1px solid ${alert ? `${ALARM.critical}55` : T.border}`,
      borderTop:  `2px solid ${accent}`,
      padding:    '22px 20px',
      position:   'relative',
      overflow:   'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, ${accent}00, ${accent}55, ${accent}00)` }}/>
      {alert && (
        <div style={{ position: 'absolute', top: 8, right: 8,
          width: 8, height: 8, borderRadius: '50%', background: ALARM.critical,
          animation: 'noc-pulse 1.5s ease-in-out infinite' }}/>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.textDim,
          letterSpacing: '1.8px', textTransform: 'uppercase', lineHeight: 1.5 }}>
          {label}
        </span>
        {IconComp && (
          <div style={{ width: 26, height: 26, border: `1px solid ${accent}30`,
            background: `${accent}0E`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', borderRadius: 4 }}>
            <IconComp size={14} color={accent}/>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 8 }}>
        <span style={{ fontFamily: FONT.display, fontSize: 36, fontWeight: 900,
          color: accent, lineHeight: 1, letterSpacing: '-1.5px' }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>
            {unit}
          </span>
        )}
      </div>

      {(delta != null || sub) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {delta != null && (
            <span style={{ fontSize: 11, fontWeight: 700, color: deltaColor,
              display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {DeltaIcon && <DeltaIcon size={11} color={deltaColor}/>}
              {!DeltaIcon && (delta > 0 ? '+' : delta < 0 ? '−' : '')}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && (
            <span style={{ fontSize: 10, color: T.textDim,
              letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              {sub}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export const StatStrip = ({ items = [], style = {} }) => {
  const { theme: T } = useTheme()
  return (
    <div style={{ display: 'grid',
      gridTemplateColumns: `repeat(${items.length || 1},1fr)`,
      gap: 1, background: gapColor(T), ...style }}>
      {items.map(it => (
        <div key={it.label} style={{ background: T.bgCard, padding: '11px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
            textTransform: 'uppercase', fontWeight: 700 }}>
            {it.label}
          </span>
          <span style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 800,
            color: it.color || T.text, letterSpacing: '-.5px' }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export const AlertBanner = ({
  severity = 'normal', icon: IconComp, title, message, value,
  pulse = true, action, style = {},
}) => {
  const { theme: T } = useTheme()
  const c = ALARM[severity] || ALARM.unknown
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: sevDim(c, '0C'), border: `1px solid ${sevBd(c)}`,
      padding: '10px 20px', marginBottom: 1, ...style,
    }}>
      {IconComp
        ? <IconComp size={14} color={c} style={{ flexShrink: 0 }}/>
        : <span style={{ width: 6, height: 6, borderRadius: '50%', background: c,
            display: 'inline-block', flexShrink: 0,
            animation: pulse ? 'noc-pulse 2s ease-in-out infinite' : 'none' }}/>
      }
      <span style={{ fontSize: 10, fontWeight: 800, color: c,
        letterSpacing: '2.5px', textTransform: 'uppercase', flexShrink: 0 }}>
        {title}
      </span>
      <span style={{ width: 1, height: 12, background: sevBd(c) }}/>
      <span style={{ fontSize: 12, color: T.textMuted }}>{message}</span>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {action}
        {value != null && (
          <span style={{ fontFamily: FONT.display, fontSize: 22,
            fontWeight: 900, color: c }}>
            {value}
          </span>
        )}
      </div>
    </div>
  )
}

const BADGE_VARIANTS = {
  critical: { bg: sevDim(ALARM.critical, '1A'), bd: sevBd(ALARM.critical), fg: ALARM.critical },
  major:    { bg: sevDim(ALARM.major,    '1A'), bd: sevBd(ALARM.major),    fg: ALARM.major    },
  minor:    { bg: sevDim(ALARM.minor,    '1A'), bd: sevBd(ALARM.minor),    fg: ALARM.minor    },
  normal:   { bg: sevDim(ALARM.normal,   '1A'), bd: sevBd(ALARM.normal),   fg: ALARM.normal   },
  red:    { bg: 'rgba(238,58,67,.1)',  bd: 'rgba(238,58,67,.3)',  fg: HW.red    },
  blue:   { bg: 'rgba(0,147,213,.1)',  bd: 'rgba(0,147,213,.3)',  fg: HW.blue   },
  green:  { bg: 'rgba(34,197,94,.1)',  bd: 'rgba(34,197,94,.28)', fg: '#16A34A' },
  amber:  { bg: 'rgba(245,158,11,.1)', bd: 'rgba(245,158,11,.28)',fg: '#D97706' },
  cyan:   { bg: 'rgba(6,182,212,.1)',  bd: 'rgba(6,182,212,.28)', fg: '#0891B2' },
  purple: { bg: 'rgba(124,58,237,.1)', bd: 'rgba(124,58,237,.28)',fg: '#7C3AED' },
  orange: { bg: 'rgba(234,88,12,.1)',  bd: 'rgba(234,88,12,.28)', fg: '#EA580C' },
  gray:   { bg: 'rgba(128,128,128,.1)',bd: 'rgba(128,128,128,.2)',fg: 'inherit' },
}

export const Badge = ({ children, variant = 'blue' }) => {
  const { theme: T } = useTheme()
  const c  = BADGE_VARIANTS[variant] || BADGE_VARIANTS.blue
  const fg = c.fg === 'inherit' ? T.textMuted : c.fg
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px',
      fontSize: 10, fontWeight: 700, letterSpacing: .8,
      textTransform: 'uppercase', borderRadius: 4,
      background: c.bg, border: `1px solid ${c.bd}`, color: fg,
    }}>
      {children}
    </span>
  )
}

export const InfoCard = ({ label, value, color = HW.blue, icon: IconComp }) => {
  const { theme: T } = useTheme()
  return (
    <div className="noc-info" style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${color}`, padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      {IconComp && (
        <div style={{ width: 36, height: 36, background: `${color}10`,
          border: `1px solid ${color}22`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', borderRadius: 4, flexShrink: 0 }}>
          <IconComp size={14} color={color}/>
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.8px',
          textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 800,
          color, wordBreak: 'break-word', lineHeight: 1.2 }}>
          {value}
        </div>
      </div>
    </div>
  )
}

// ── RingGauge ─────────────────────────────────────────────────────────
// NEW. Compact circular score indicator, CSS-only (conic-gradient, no
// SVG). Single clear use case for now: NB00's Data Quality Score
// (94.7/100), which currently has no visual representation anywhere
// in the app.
//   <RingGauge value={94.7} label="Data Quality" sub="NB00"/>
// Deliberately kept minimal: one ring, no secondary/dual-ring variant,
// no new color system (reuses ALARM exactly like every other severity
// display in this file).
export const RingGauge = ({
  value, max = 100, label, sub, severity, size = 96, strokeWidth = 8,
}) => {
  const { theme: T } = useTheme()
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = severity ? ALARM[severity] :
    pct >= 80 ? ALARM.normal : pct >= 60 ? ALARM.minor :
    pct >= 40 ? ALARM.major : ALARM.critical

  return (
    <div style={{ display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 10 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%', position: 'relative',
        background: `conic-gradient(${color} ${pct}%, ${T.border} 0)`,
        transition: 'background .6s ease',
      }}>
        {/* Punches the ring hole — must match the background this sits
            on. Uses T.bgCard since RingGauge is meant to live inside a
            ChartPanel/Card, consistent with every other data-display
            component in this file. */}
        <div style={{
          position: 'absolute', inset: strokeWidth, borderRadius: '50%',
          background: T.bgCard, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: FONT.display, fontSize: size * 0.26,
            fontWeight: 900, color: T.text, lineHeight: 1, letterSpacing: '-1px' }}>
            {value}
          </span>
          {max !== 100 && <span style={{ fontSize: 9, color: T.textDim }}>/ {max}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.textDim,
          letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          {label}
        </div>
        {sub && <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// 5. FEEDBACK — spinner, empty state
// ════════════════════════════════════════════════════════════════════

export const Spinner = ({ size = 32 }) => (
  <div style={{ display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 24, gap: 6 }}>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        width: size / 4, height: size / 4, borderRadius: '50%',
        background: HW.blue,
        animation: `noc-dots 1.2s ${i * .2}s infinite ease-in-out`,
      }}/>
    ))}
  </div>
)

export const EmptyState = ({ icon: IconComp, title, desc, action }) => {
  const { theme: T } = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 24px', textAlign: 'center',
      minHeight: 180 }}>
      {IconComp && (
        <div style={{ marginBottom: 14, opacity: .25 }}>
          <IconComp size={34} color={T.textDim}/>
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 5 }}>
        {title}
      </div>
      {desc && (
        <div style={{ fontSize: 11, color: T.textDim, maxWidth: 340, lineHeight: 1.6 }}>
          {desc}
        </div>
      )}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// 6. CHART DEFAULTS
// ════════════════════════════════════════════════════════════════════

export const baseChartOptions = (T) => ({
  chart: {
    foreColor:  T.textMuted,
    fontFamily: FONT.body,
    toolbar:    { show: false },
    zoom:       { enabled: false },
    background: 'transparent',
    animations: { enabled: false },
  },
  grid: {
    borderColor:     gridLine(T),
    strokeDashArray: 3,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true  } },
  },
  legend: {
    fontSize:   '11px',
    labels:     { colors: T.textMuted },
    markers:    { radius: 2 },
    itemMargin: { horizontal: 14 },
  },
  tooltip: {
    theme: T.mode === 'dark' ? 'dark' : 'light',
    style: { fontSize: '11px' },
  },
  xaxis: {
    labels:     { style: { fontSize: '10px', colors: T.textMuted } },
    axisBorder: { show: false },
    axisTicks:  { show: false },
  },
  yaxis: {
    labels: { style: { fontSize: '10px', colors: T.textMuted } },
  },
  colors: [HW.blue, ALARM.critical, ALARM.normal, ALARM.minor, '#8B5CF6'],
})

export const singleSeriesBarColors = (count, rankGraded = true) =>
  rankGraded ? Array.from({ length: count }, (_, i) => blueRamp(i)) : [HW.blue]

// ════════════════════════════════════════════════════════════════════
// 7. PAGE CHROME (kept from v1)
// ════════════════════════════════════════════════════════════════════

export const BrandHeader = ({ title, subtitle, badges = [], icon: Icon }) => {
  const { theme: T } = useTheme()
  return (
    <div style={{
      background: T.mode === 'dark'
        ? `linear-gradient(135deg, ${HW.redDim} 0%, #0E1120 35%, #0C0D12 100%)`
        : `linear-gradient(135deg, rgba(238,58,67,.06) 0%, #F5F7FF 35%, #F0F2F8 100%)`,
      border: `1px solid ${T.border}`,
      padding: '22px 28px', marginBottom: 24,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 16, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: `linear-gradient(to bottom, ${HW.red}, rgba(238,58,67,.1))` }}/>
      <div style={{ position: 'absolute', top: '-40%', right: 0, width: 240, height: 240,
        background: `radial-gradient(circle, ${HW.blueDim} 0%, transparent 70%)`,
        pointerEvents: 'none' }}/>
      <div style={{ position: 'relative', zIndex: 1, paddingLeft: 10 }}>
        <h1 style={{ color: T.text, fontSize: 21, fontWeight: 700, margin: 0,
          letterSpacing: '-.3px', lineHeight: 1.2,
          display: 'flex', alignItems: 'center', gap: 10 }}>
          {Icon && <Icon size={20} color={HW.blue}/>}
          {title}
        </h1>
        {subtitle && (
          <p style={{ color: T.textMuted, fontSize: 12, margin: '4px 0 0', lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
      </div>
      {badges.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap',
          position: 'relative', zIndex: 1 }}>
          {badges.map((b, i) => (
            <span key={i} style={{
              background: HW.blueDim, color: HW.blue,
              border: `1px solid ${HW.blueBd}`, padding: '3px 12px',
              borderRadius: 20, fontSize: 11, fontWeight: 600, letterSpacing: .3 }}>
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export const Card = ({ children, style = {}, className = '', noPadding = false }) => {
  const { theme: T } = useTheme()
  return (
    <div className={className} style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      padding: noPadding ? 0 : 18, transition: 'border-color .2s',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// 8. DEPRECATED ALIASES — migrate pages to the new names, then delete.
// ════════════════════════════════════════════════════════════════════

/** @deprecated use <StatBlock/> */
export const KpiCard = (props) => <StatBlock {...props}/>

/** @deprecated use <ChartPanel/> */
export const ChartCard = ({ title, subtitle, children, action, height, style }) => (
  <ChartPanel title={title} sub={subtitle} action={action} style={style}>
    <div style={height ? { height } : {}}>{children}</div>
  </ChartPanel>
)

/** @deprecated use <SectionLabel/> */
export const SectionHeader = ({ children, action, subtitle }) => (
  <SectionLabel sub={subtitle} action={action}>{children}</SectionLabel>
)

/** @deprecated use <BrandHeader/> or <SectionLabel/> */
export const PageHeader = ({ title, subtitle, badges = [] }) => (
  <BrandHeader title={title} subtitle={subtitle} badges={badges}/>
)