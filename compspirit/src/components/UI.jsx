// src/components/UI.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriComp NOC Dashboard — Design System
//
// FIXES in this version:
//   THEME        updated to Datadog-style: #0C0D12 bg, #2F81F7 blue primary
//                red is now ALERT ONLY — not decorative
//   EmptyState   removed broken IcoGlobe default prop reference
//   SectionHeader added subtitle prop (used by Overview.jsx)
//   Spinner      dots now use THEME.primary (blue) not THEME.red
//   BrandHeader  dark navy gradient with 3px red left stripe
//   PageHeader   accent bar now blue (navigation ≠ alert)
// ─────────────────────────────────────────────────────────────────────

export const THEME = {
  // ── Backgrounds ───────────────────────────────────────────────────
  bg:              '#0C0D12',
  bgCard:          '#13151D',
  bgCardHover:     '#1A1D28',
  surface:         '#13151D',
  surfaceElevated: '#1A1D28',

  // ── Borders ───────────────────────────────────────────────────────
  border:          'rgba(255,255,255,.08)',
  borderHover:     'rgba(255,255,255,.16)',

  // ── Text (3 levels) ───────────────────────────────────────────────
  text:            '#E6E8F0',
  textMuted:       'rgba(230,232,240,.55)',
  textDim:         'rgba(230,232,240,.28)',

  // ── Primary accent — electric blue ────────────────────────────────
  primary:         '#2F81F7',
  primaryLight:    '#5B9FFA',
  primaryBg:       'rgba(47,129,247,.1)',
  primaryBorder:   'rgba(47,129,247,.28)',

  // ── Semantic — 4 colors, one meaning each ─────────────────────────
  red:             '#F85149',   // ALERT · critical · anomaly
  redBg:           'rgba(248,81,73,.1)',
  redBorder:       'rgba(248,81,73,.28)',

  green:           '#3FB950',   // HEALTHY · good QoE · resolved
  greenBg:         'rgba(63,185,80,.1)',
  greenBorder:     'rgba(63,185,80,.28)',

  amber:           '#D29922',   // WARNING · spike · degraded
  amberBg:         'rgba(210,153,34,.1)',
  amberBorder:     'rgba(210,153,34,.28)',

  blue:            '#2F81F7',   // INFO — same as primary

  // ── Extended (chart data only) ────────────────────────────────────
  cyan:            '#39C5CF',
  purple:          '#8957E5',
  orange:          '#E16A2B',
  teal:            '#1A9E8F',
}

// ── Brand Header ──────────────────────────────────────────────────────
// Dark navy gradient — 3px red left accent honours SpiriComp brand
// without making red the dominant dashboard colour.
export const BrandHeader = ({ title, subtitle, badges = [], icon: Icon }) => (
  <div style={{
    background:   'linear-gradient(135deg, rgba(207,10,44,.22) 0%, #0E1120 35%, #0C0D12 100%)',
    border:       `1px solid ${THEME.border}`,
    padding:      '24px 32px',
    borderRadius: 12,
    marginBottom: 28,
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
    flexWrap:     'wrap',
    gap:          16,
    position:     'relative',
    overflow:     'hidden',
  }}>
    {/* 3px red left accent bar */}
    <div style={{
      position:     'absolute', top: 0, left: 0, bottom: 0, width: 3,
      background:   'linear-gradient(to bottom, #CF0A2C, rgba(207,10,44,.15))',
      borderRadius: '12px 0 0 12px',
    }} />
    {/* Blue glow top-right */}
    <div style={{
      position:      'absolute', top: '-40%', right: 0,
      width: 260, height: 260,
      background:    `radial-gradient(circle, ${THEME.primaryBg} 0%, transparent 70%)`,
      pointerEvents: 'none',
    }} />

    <div style={{ position:'relative', zIndex:1, paddingLeft:8 }}>
      <h1 style={{
        color:         THEME.text, fontSize: 22, fontWeight: 700, margin: 0,
        letterSpacing: '-.4px', lineHeight: 1.2,
        display:       'flex', alignItems: 'center', gap: 12,
      }}>
        {Icon && <Icon size={22} color={THEME.primary} />}
        {title}
      </h1>
      {subtitle && (
        <p style={{ color:THEME.textMuted, fontSize:12, margin:'5px 0 0', fontWeight:400, lineHeight:1.5 }}>
          {subtitle}
        </p>
      )}
    </div>

    {badges.length > 0 && (
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', position:'relative', zIndex:1 }}>
        {badges.map((b, i) => (
          <span key={i} style={{
            background:   THEME.primaryBg,
            color:        THEME.primary,
            border:       `1px solid ${THEME.primaryBorder}`,
            padding:      '4px 14px',
            borderRadius: 20,
            fontSize:     11,
            fontWeight:   600,
            letterSpacing:.3,
          }}>
            {b}
          </span>
        ))}
      </div>
    )}
  </div>
)

// ── Page Header ───────────────────────────────────────────────────────
export const PageHeader = ({ title, subtitle, badges = [] }) => (
  <div style={{
    marginBottom: 24,
    display:      'flex', justifyContent:'space-between',
    alignItems:   'flex-end', flexWrap:'wrap', gap:16,
  }}>
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
        {/* Blue accent bar — navigation ≠ alert */}
        <div style={{ width:3, height:26, background:THEME.primary, borderRadius:2 }} />
        <h1 style={{ fontSize:24, fontWeight:700, color:THEME.text, letterSpacing:'-.4px', margin:0 }}>
          {title}
        </h1>
      </div>
      {subtitle && (
        <p style={{ fontSize:13, color:THEME.textMuted, margin:'0 0 0 15px', lineHeight:1.5 }}>
          {subtitle}
        </p>
      )}
    </div>
    {badges.length > 0 && (
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {badges.map(b => (
          <span key={b} style={{
            fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase',
            padding:'4px 10px', border:`1px solid ${THEME.border}`,
            background:'rgba(255,255,255,.03)', color:THEME.textMuted, borderRadius:4,
          }}>
            {b}
          </span>
        ))}
      </div>
    )}
  </div>
)

// ── Section Header ────────────────────────────────────────────────────
// FIX: added subtitle prop — used by Overview.jsx
export const SectionHeader = ({ children, action, subtitle }) => (
  <div style={{ margin:'24px 0 12px' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <h2 style={{
        fontSize:      11, fontWeight:700, color:THEME.textMuted,
        letterSpacing: 1.8, textTransform:'uppercase', margin:0,
        display:       'flex', alignItems:'center', gap:10,
      }}>
        {/* Blue line — section indicator, not alert */}
        <span style={{ width:14, height:1.5, background:THEME.primary, display:'inline-block', borderRadius:1 }} />
        {children}
      </h2>
      {action}
    </div>
    {subtitle && (
      <p style={{ fontSize:11, color:THEME.textDim, margin:'4px 0 0 24px', lineHeight:1.5 }}>
        {subtitle}
      </p>
    )}
  </div>
)

// ── Card ──────────────────────────────────────────────────────────────
export const Card = ({ children, style = {}, className = '', noPadding = false }) => (
  <div className={className} style={{
    background:   THEME.bgCard,
    border:       `1px solid ${THEME.border}`,
    borderRadius: 10,
    padding:      noPadding ? 0 : 18,
    ...style,
  }}>
    {children}
  </div>
)

// ── KPI Card ──────────────────────────────────────────────────────────
export const KpiCard = ({ label, value, unit, delta, good, color, sub, icon }) => {
  const accent = color || THEME.primary
  return (
    <div style={{
      background:   THEME.bgCard,
      border:       `1px solid ${THEME.border}`,
      borderRadius: 10,
      padding:      '16px 18px',
      borderTop:    `2px solid ${accent}`,
      transition:   'all .2s',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.background  = THEME.bgCardHover
        e.currentTarget.style.borderColor = THEME.borderHover
        e.currentTarget.style.transform   = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background  = THEME.bgCard
        e.currentTarget.style.borderColor = THEME.border
        e.currentTarget.style.transform   = 'translateY(0)'
      }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div style={{ fontSize:9, color:THEME.textDim, letterSpacing:1.8, textTransform:'uppercase', fontWeight:700, lineHeight:1.4 }}>
          {label}
        </div>
        {icon && <span style={{ opacity:.65 }}>{icon}</span>}
      </div>
      <div style={{ display:'flex', alignItems:'baseline', gap:5 }}>
        <span style={{ fontSize:24, fontWeight:700, color:accent, lineHeight:1 }}>{value}</span>
        {unit && <span style={{ fontSize:11, color:THEME.textMuted, fontWeight:500 }}>{unit}</span>}
      </div>
      {(delta !== undefined || sub) && (
        <div style={{ marginTop:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          {delta !== undefined && (
            <span style={{
              fontSize:11, fontWeight:600,
              color: good
                ? (delta >= 0 ? THEME.green : THEME.red)
                : (delta >= 0 ? THEME.red   : THEME.green),
              display:'inline-flex', alignItems:'center', gap:2,
            }}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span style={{ fontSize:11, color:THEME.textDim }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────
const BADGE_VARIANTS = {
  blue:   { bg:'rgba(47,129,247,.1)',  bd:'rgba(47,129,247,.28)',  fg:'#5B9FFA' },
  green:  { bg:'rgba(63,185,80,.1)',   bd:'rgba(63,185,80,.28)',   fg:'#3FB950' },
  amber:  { bg:'rgba(210,153,34,.1)',  bd:'rgba(210,153,34,.28)',  fg:'#D29922' },
  red:    { bg:'rgba(248,81,73,.1)',   bd:'rgba(248,81,73,.28)',   fg:'#F85149' },
  cyan:   { bg:'rgba(57,197,207,.1)',  bd:'rgba(57,197,207,.28)',  fg:'#39C5CF' },
  purple: { bg:'rgba(137,87,229,.1)',  bd:'rgba(137,87,229,.28)',  fg:'#8957E5' },
  gray:   { bg:'rgba(255,255,255,.05)',bd:'rgba(255,255,255,.12)', fg:'rgba(230,232,240,.6)' },
  orange: { bg:'rgba(225,106,43,.1)',  bd:'rgba(225,106,43,.28)',  fg:'#E16A2B' },
}

export const Badge = ({ children, variant = 'blue' }) => {
  const c = BADGE_VARIANTS[variant] || BADGE_VARIANTS.blue
  return (
    <span style={{
      display:       'inline-block', padding:'3px 9px',
      fontSize:      10, fontWeight:700, letterSpacing:.8,
      textTransform: 'uppercase', borderRadius:4,
      background:    c.bg, border:`1px solid ${c.bd}`, color:c.fg,
    }}>
      {children}
    </span>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────
// FIX: uses THEME.primary (blue) — loading is not an alert state
export const Spinner = ({ size = 32 }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:24, gap:6 }}>
    <style>{`@keyframes _sp{0%,80%,100%{opacity:.25;transform:scale(.75)}40%{opacity:1;transform:scale(1)}}`}</style>
    {[0,1,2].map(i => (
      <div key={i} style={{
        width:size/4, height:size/4, borderRadius:'50%',
        background:THEME.primary,                  // FIX: was THEME.red
        animation:`_sp 1.2s ${i*.2}s infinite ease-in-out`,
      }} />
    ))}
  </div>
)

// ── Empty State ───────────────────────────────────────────────────────
// FIX: removed broken IcoGlobe default — default is now null
export const EmptyState = ({ icon = null, title, desc, action }) => (
  <div style={{
    display:'flex', flexDirection:'column', alignItems:'center',
    justifyContent:'center', padding:'40px 24px', textAlign:'center', minHeight:180,
  }}>
    {icon && (
      <div style={{ marginBottom:14, opacity:.3, display:'flex', justifyContent:'center' }}>
        {typeof icon === 'string'
          ? <span style={{ fontSize:34, lineHeight:1 }}>{icon}</span>
          : icon}
      </div>
    )}
    <div style={{ fontSize:13, fontWeight:600, color:THEME.textMuted, marginBottom:5 }}>{title}</div>
    {desc && (
      <div style={{ fontSize:11, color:THEME.textDim, maxWidth:340, lineHeight:1.6 }}>{desc}</div>
    )}
    {action && <div style={{ marginTop:14 }}>{action}</div>}
  </div>
)

// ── Base chart options ─────────────────────────────────────────────────
export const baseChartOptions = {
  chart: {
    foreColor:  THEME.textMuted,
    fontFamily: "'Inter', system-ui, sans-serif",
    toolbar:    { show:false },
    zoom:       { enabled:false },
    background: 'transparent',
    animations: { enabled:false },
  },
  grid: {
    borderColor:     'rgba(255,255,255,.05)',
    strokeDashArray: 3,
    xaxis: { lines:{ show:false } },
    yaxis: { lines:{ show:true  } },
  },
  legend: {
    fontSize:   '11px',
    labels:     { colors:THEME.textMuted },
    markers:    { radius:2 },
    itemMargin: { horizontal:14 },
  },
  tooltip:  { theme:'dark', style:{ fontSize:'11px' } },
  xaxis: {
    labels:     { style:{ fontSize:'10px', colors:THEME.textMuted } },
    axisBorder: { show:false },
    axisTicks:  { show:false },
  },
  yaxis: {
    labels: { style:{ fontSize:'10px', colors:THEME.textMuted } },
  },
}

// ── Chart Card ────────────────────────────────────────────────────────
export const ChartCard = ({ title, subtitle, children, action, height, style = {} }) => (
  <Card style={style}>
    {(title || subtitle || action) && (
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div>
          {title    && <div style={{ fontSize:13, fontWeight:600, color:THEME.text,    marginBottom:2 }}>{title}</div>}
          {subtitle && <div style={{ fontSize:11, color:THEME.textDim }}>{subtitle}</div>}
        </div>
        {action}
      </div>
    )}
    <div style={height ? { height } : {}}>{children}</div>
  </Card>
)