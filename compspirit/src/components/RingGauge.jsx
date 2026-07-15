// src/components/RingGauge.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom — Circular health/score gauge, CSS-only (conic-gradient)
// Same API as the SVG version — drop-in replacement, no callers change.
//
// Technique: a conic-gradient() circle for the arc, with a smaller
// circle of the card's own background color punched in the center to
// create the "ring" look. This means the ring's hole color must match
// whatever background it sits on (T.bgCard by default) — if you place
// RingGauge on a different background, pass `holeColor` explicitly.
// ─────────────────────────────────────────────────────────────────────

import { useTheme } from '../context/ThemeContext'
import { ALARM, FONT } from './UI'

const autoColor = (pct) =>
  pct >= 80 ? ALARM.normal :
  pct >= 60 ? ALARM.minor  :
  pct >= 40 ? ALARM.major  : ALARM.critical

export default function RingGauge({
  value,
  max = 100,
  label,
  sub,
  severity,
  secondaryValue,
  secondaryLabel,
  size = 96,
  strokeWidth = 8,
  holeColor,          // override if the gauge sits on a non-card background
}) {
  const { theme: T } = useTheme()
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = severity ? ALARM[severity] : autoColor(pct)
  const bg = holeColor || T.bgCard

  const pct2 = secondaryValue != null
    ? Math.max(0, Math.min(100, secondaryValue))
    : null
  const color2 = pct2 != null ? autoColor(pct2) : null
  const innerSize = size - strokeWidth * 2 - 6   // gap between the two rings

  return (
    <div style={{ display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 10 }}>
      <div style={{
        position: 'relative', width: size, height: size, borderRadius: '50%',
        background: `conic-gradient(${color} ${pct}%, ${T.border} 0)`,
        transition: 'background 0.6s ease',
      }}>
        {/* Punch the ring hole */}
        <div style={{
          position: 'absolute', inset: strokeWidth, borderRadius: '50%',
          background: bg, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Secondary (inner) ring, only if provided */}
          {pct2 != null ? (
            <div style={{
              width: innerSize, height: innerSize, borderRadius: '50%',
              background: `conic-gradient(${color2} ${pct2}%, ${T.border} 0)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                position: 'absolute', width: innerSize - strokeWidth * 2,
                height: innerSize - strokeWidth * 2, borderRadius: '50%',
                background: bg, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontFamily: FONT.display, fontSize: size * 0.22,
                  fontWeight: 900, color: T.text, lineHeight: 1 }}>
                  {value}
                </span>
              </div>
            </div>
          ) : (
            <>
              <span style={{ fontFamily: FONT.display, fontSize: size * 0.26,
                fontWeight: 900, color: T.text, lineHeight: 1, letterSpacing: '-1px' }}>
                {value}
              </span>
              {max !== 100 && (
                <span style={{ fontSize: 9, color: T.textDim }}>/ {max}</span>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.textDim,
          letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>{sub}</div>
        )}
        {secondaryLabel && pct2 != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5,
            justifyContent: 'center', marginTop: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%',
              background: color2 }}/>
            <span style={{ fontSize: 9, color: T.textDim }}>{secondaryLabel}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// StatusLegend unchanged from the SVG version — no SVG/CSS dependency there.
export function StatusLegend({ items = [] }) {
  const { theme: T } = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7,
            color: T.textMuted }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%',
              background: ALARM[it.severity] || ALARM.unknown, flexShrink: 0 }}/>
            {it.label}
          </span>
          <span style={{ fontFamily: FONT.display, fontWeight: 700,
            color: T.text }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  )
}