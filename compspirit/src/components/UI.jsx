// src/components/UI.jsx
// ─────────────────────────────────────────────────────────────────────
// Shared UI components — SpiriComp NOC Dashboard
//
// Exports (alphabetical):
//   Badge · BrandHeader · Card · ChartCard · EmptyState
//   KpiCard · PageHeader · SectionHeader · Spinner · THEME
//   baseChartOptions
//
// FIX: BrandHeader added — was used by Overview.jsx but never exported.
// FIX: baseChartOptions.chart.animations.enabled set to false —
//      prevents charts re-animating on every state update.
// ─────────────────────────────────────────────────────────────────────

export const THEME = {
  bg:          '#0F172A',               // slate-900
  bgCard:      'rgba(255,255,255,.025)',
  bgCardHover: 'rgba(255,255,255,.04)',
  surface:     'rgba(255,255,255,.025)',
  border:      'rgba(255,255,255,.06)',
  borderHover: 'rgba(255,255,255,.12)',
  text:        '#E2E8F0',
  textMuted:   'rgba(226,232,240,.5)',
  textDim:     'rgba(226,232,240,.35)',
  // Colours
  red:         '#CF0A2C',
  redLight:    '#FF4060',
  blue:        '#3B82F6',
  cyan:        '#22D3EE',
  green:       '#22C55E',
  amber:       '#F59E0B',
  orange:      '#F97316',
  purple:      '#A855F7',
  teal:        '#14B8A6',
}

// ── Brand Header ──────────────────────────────────────────────────────
// Used by Overview.jsx for the main NOC dashboard hero.
// Props: title, subtitle, badges[], icon (React component)
export const BrandHeader = ({ title, subtitle, badges = [], icon: Icon }) => (
  <div style={{
    background: `linear-gradient(135deg, ${THEME.red} 0%, #8B0000 50%, #1A1A2E 100%)`,
    padding: '28px 36px',
    borderRadius: 14,
    marginBottom: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(207,10,44,.22)',
  }}>
    {/* decorative radial glow */}
    <div style={{
      position: 'absolute', top: '-50%', right: '-10%',
      width: 320, height: 320,
      background: 'radial-gradient(circle, rgba(255,255,255,.08) 0%, transparent 70%)',
      pointerEvents: 'none',
    }} />

    {/* title + subtitle */}
    <div style={{ position: 'relative', zIndex: 1 }}>
      <h1 style={{
        color: '#fff', fontSize: 24, fontWeight: 800, margin: 0,
        letterSpacing: '-.5px', lineHeight: 1.2,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {Icon && <Icon size={26} color="rgba(255,255,255,.9)" />}
        {title}
      </h1>
      {subtitle && (
        <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 13, margin: '6px 0 0', fontWeight: 400 }}>
          {subtitle}
        </p>
      )}
    </div>

    {/* badges */}
    {badges.length > 0 && (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
        {badges.map((b, i) => (
          <span key={i} style={{
            background: 'rgba(255,255,255,.1)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,.22)',
            padding: '5px 16px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
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
    marginBottom: 28,
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-end', flexWrap: 'wrap', gap: 16,
  }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 4, height: 28, background: THEME.red, borderRadius: 2 }} />
        <h1 style={{ fontSize: 26, fontWeight: 700, color: THEME.text, letterSpacing: '-.5px', margin: 0 }}>
          {title}
        </h1>
      </div>
      <p style={{ fontSize: 13, color: THEME.textMuted, margin: '0 0 0 16px' }}>{subtitle}</p>
    </div>
    {badges.length > 0 && (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {badges.map(b => (
          <span key={b} style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
            padding: '5px 11px', border: `1px solid ${THEME.border}`,
            background: 'rgba(255,255,255,.02)', color: THEME.textMuted, borderRadius: 4,
          }}>
            {b}
          </span>
        ))}
      </div>
    )}
  </div>
)

// ── Section Header ────────────────────────────────────────────────────
export const SectionHeader = ({ children, action }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', margin: '24px 0 14px',
  }}>
    <h2 style={{
      fontSize: 13, fontWeight: 700, color: THEME.text,
      letterSpacing: 1, textTransform: 'uppercase', margin: 0,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ width: 16, height: 1, background: THEME.red, display: 'inline-block' }} />
      {children}
    </h2>
    {action}
  </div>
)

// ── Card ──────────────────────────────────────────────────────────────
export const Card = ({ children, style = {}, className = '', noPadding = false }) => (
  <div className={className} style={{
    background: THEME.bgCard,
    border: `1px solid ${THEME.border}`,
    borderRadius: 12,
    padding: noPadding ? 0 : 20,
    ...style,
  }}>
    {children}
  </div>
)

// ── KPI Card ──────────────────────────────────────────────────────────
export const KpiCard = ({ label, value, unit, delta, good, color, sub, icon }) => {
  const accent = color || THEME.red
  return (
    <div style={{
      background: THEME.bgCard,
      border: `1px solid ${THEME.border}`,
      borderRadius: 12,
      padding: '18px 20px',
      borderTop: `2px solid ${accent}`,
      transition: 'all .25s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = THEME.bgCardHover; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.background = THEME.bgCard;       e.currentTarget.style.transform = 'translateY(0)' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: THEME.textDim, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
          {label}
        </div>
        {icon && <span style={{ fontSize: 14, opacity: .7 }}>{icon}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 11, color: THEME.textMuted, fontWeight: 600 }}>{unit}</span>}
      </div>

      {(delta !== undefined || sub) && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {delta !== undefined && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: good
                ? (delta >= 0 ? THEME.green : THEME.red)
                : (delta >= 0 ? THEME.red   : THEME.green),
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span style={{ fontSize: 11, color: THEME.textDim }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────
const BADGE_COLORS = {
  red:    { bg: 'rgba(207,10,44,.12)',  bd: 'rgba(207,10,44,.3)',  fg: '#FF4060' },
  blue:   { bg: 'rgba(59,130,246,.12)', bd: 'rgba(59,130,246,.3)', fg: '#60A5FA' },
  green:  { bg: 'rgba(34,197,94,.12)',  bd: 'rgba(34,197,94,.3)',  fg: '#4ADE80' },
  amber:  { bg: 'rgba(245,158,11,.12)', bd: 'rgba(245,158,11,.3)', fg: '#FBBF24' },
  purple: { bg: 'rgba(168,85,247,.12)', bd: 'rgba(168,85,247,.3)', fg: '#C084FC' },
  cyan:   { bg: 'rgba(34,211,238,.12)', bd: 'rgba(34,211,238,.3)', fg: '#67E8F9' },
  gray:   { bg: 'rgba(255,255,255,.05)', bd: 'rgba(255,255,255,.1)', fg: '#94A3B8' },
  orange: { bg: 'rgba(249,115,22,.12)', bd: 'rgba(249,115,22,.3)', fg: '#FB923C' },
}

export const Badge = ({ children, variant = 'red' }) => {
  const c = BADGE_COLORS[variant] || BADGE_COLORS.red
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', fontSize: 10, fontWeight: 700,
      letterSpacing: 1, textTransform: 'uppercase', borderRadius: 4,
      background: c.bg, border: `1px solid ${c.bd}`, color: c.fg,
    }}>
      {children}
    </span>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────
export const Spinner = ({ size = 32 }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 }}>
    <style>{`@keyframes _pulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        width: size / 4, height: size / 4, borderRadius: '50%',
        background: THEME.red, animation: `_pulse 1.2s ${i * .2}s infinite ease-in-out`,
      }} />
    ))}
  </div>
)

// ── Empty State ───────────────────────────────────────────────────────
export const EmptyState = ({ icon = '📭', title, desc, action }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: 48, textAlign: 'center', minHeight: 200,
  }}>
    <div style={{ fontSize: 40, marginBottom: 14, opacity: .4 }}>{icon}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: THEME.text, marginBottom: 6 }}>{title}</div>
    {desc && <div style={{ fontSize: 12, color: THEME.textMuted, maxWidth: 360, lineHeight: 1.6 }}>{desc}</div>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>
)

// ── Base chart options ─────────────────────────────────────────────────
// FIX: animations.enabled:false — prevents re-animation on every state update
export const baseChartOptions = {
  chart: {
    foreColor:   THEME.textMuted,
    fontFamily:  'system-ui, sans-serif',
    toolbar:     { show: false },
    zoom:        { enabled: false },
    background:  'transparent',
    animations:  { enabled: false },          // ← FIX: was missing / true
  },
  grid: {
    borderColor:    'rgba(255,255,255,.05)',
    strokeDashArray: 3,
  },
  legend: {
    fontSize: '11px',
    labels:   { colors: THEME.textMuted },
    markers:  { radius: 3 },
  },
  tooltip:  { theme: 'dark', style: { fontSize: '11px' } },
  xaxis: {
    labels:     { style: { fontSize: '10px', colors: THEME.textMuted } },
    axisBorder: { show: false },
    axisTicks:  { show: false },
  },
  yaxis: {
    labels: { style: { fontSize: '10px', colors: THEME.textMuted } },
  },
}

// ── Chart card wrapper ────────────────────────────────────────────────
export const ChartCard = ({ title, subtitle, children, action, height, style = {} }) => (
  <Card style={style}>
    {(title || subtitle || action) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          {title    && <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 2 }}>{title}</div>}
          {subtitle && <div style={{ fontSize: 11, color: THEME.textMuted }}>{subtitle}</div>}
        </div>
        {action}
      </div>
    )}
    <div style={height ? { height } : {}}>{children}</div>
  </Card>
)