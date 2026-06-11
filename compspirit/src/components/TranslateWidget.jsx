// src/components/TranslateWidget.jsx
// ─────────────────────────────────────────────────────────────────────
// Standalone EN ↔ ZH toggle — fixed bottom-right, fully isolated.
// Uses i18next (no Google Translate, no external redirect).
// Same i18n system as the rest of the app: en.json / zh.json
// ─────────────────────────────────────────────────────────────────────

import { useState }       from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme }       from '../context/ThemeContext'

export default function TranslateWidget() {
  const { i18n }        = useTranslation()
  const { mode }        = useTheme()
  const [open, setOpen] = useState(false)

  const isZH  = i18n.language?.startsWith('zh')
  const isEN  = !isZH

  const switchTo = (code) => {
    i18n.changeLanguage(code)
    localStorage.setItem('spiricomp_lang', code)
    setOpen(false)
  }

  // ── theme tokens ──────────────────────────────────────────────────
  const bg      = mode === 'dark' ? 'rgba(13,14,22,0.93)' : 'rgba(255,255,255,0.96)'
  const border  = mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.11)'
  const textDim = mode === 'dark' ? 'rgba(210,215,235,0.55)' : 'rgba(20,25,40,0.50)'
  const textOn  = mode === 'dark' ? '#ffffff' : '#0D1117'
  const accent  = '#CF0A2C'
  const shadow  = mode === 'dark'
    ? '0 8px 32px rgba(0,0,0,0.55), -2px 0 12px rgba(0,0,0,0.3)'
    : '0 8px 32px rgba(0,0,0,0.13), -2px 0 8px rgba(0,0,0,0.06)'

  return (
    <div style={{ position:'fixed', bottom:80, right:0, zIndex:9997 }}>
      <style>{`
        @keyframes tw_panel {
          from { opacity:0; transform:translateY(6px) scale(.97) }
          to   { opacity:1; transform:translateY(0)   scale(1)   }
        }
        .tw-opt {
          display:flex; align-items:center; gap:10px;
          width:100%; padding:11px 18px;
          background:transparent; border:none;
          font-family:'Inter',system-ui,sans-serif;
          font-size:12px; font-weight:600;
          text-align:left; cursor:pointer;
          transition:all .15s;
          border-bottom:1px solid ${border};
          color:${textDim};
        }
        .tw-opt:last-child { border-bottom:none; }
        .tw-opt:hover, .tw-opt.tw-active {
          background:rgba(207,10,44,.07);
          color:${accent};
          padding-left:22px;
        }
        .tw-opt.tw-active { color:${accent}; font-weight:700; }
      `}</style>

      {/* ── Language panel (slides up from button) ── */}
      {open && (
        <div style={{
          position:     'absolute',
          bottom:       '100%',
          right:        0,
          marginBottom: 6,
          background:   bg,
          border:       `1px solid ${border}`,
          borderRadius: 10,
          overflow:     'hidden',
          minWidth:     178,
          boxShadow:    shadow,
          animation:    'tw_panel .18s ease',
        }}>
          {/* Header */}
          <div style={{
            padding:'8px 18px 6px',
            fontSize:9, fontWeight:800,
            color: mode === 'dark' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.28)',
            letterSpacing:2.5, textTransform:'uppercase',
            borderBottom:`1px solid ${border}`,
          }}>
            Language
          </div>

          {/* English */}
          <button
            className={`tw-opt${isEN ? ' tw-active' : ''}`}
            onClick={() => switchTo('en')}
          >
            <span style={{ fontSize:16 }}>🇬🇧</span>
            <div>
              <div>English</div>
              {isEN && <div style={{ fontSize:9, opacity:.6, marginTop:1 }}>Active</div>}
            </div>
          </button>

          {/* Chinese */}
          <button
            className={`tw-opt${isZH ? ' tw-active' : ''}`}
            onClick={() => switchTo('zh')}
          >
            <span style={{ fontSize:16 }}>🇨🇳</span>
            <div>
              <div>中文</div>
              {isZH && <div style={{ fontSize:9, opacity:.6, marginTop:1 }}>Active · 活跃</div>}
            </div>
          </button>
        </div>
      )}

      {/* ── Trigger button — vertical pill on right edge ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Switch language / 切换语言"
        aria-label="Switch language"
        aria-expanded={open}
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            7,
          width:          44,
          padding:        '14px 0',
          background:     bg,
          border:         `1px solid ${border}`,
          borderRight:    'none',
          borderRadius:   '10px 0 0 10px',
          cursor:         'pointer',
          transition:     'all .2s',
          boxShadow:      shadow,
          color:          open ? accent : textDim,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = accent }}
        onMouseLeave={e => { e.currentTarget.style.color = open ? accent : textDim }}
      >
        {/* Active language flag */}
        <span style={{ fontSize:17, lineHeight:1 }}>{isZH ? '🇨🇳' : '🇬🇧'}</span>

        {/* Rotated label */}
        <span style={{
          fontSize:      9,
          fontWeight:    800,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          writingMode:   'vertical-rl',
          transform:     'rotate(180deg)',
          lineHeight:    1,
          color:         'inherit',
          userSelect:    'none',
        }}>
          {isZH ? 'EN↔ZH' : 'EN↔ZH'}
        </span>

        {/* Active dot when panel open */}
        {open && (
          <div style={{
            position:     'absolute',
            top:          7, right:7,
            width:        7, height:7,
            borderRadius: '50%',
            background:   accent,
            border:       `1.5px solid ${bg}`,
          }}/>
        )}
      </button>
    </div>
  )
}