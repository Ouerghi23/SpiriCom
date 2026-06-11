// src/components/FloatingControls.jsx
// ─────────────────────────────────────────────────────────────────────
// Bottom-left floating pill: [☀️/🌙 theme] | [🇬🇧/🇨🇳 EN↔ZH]
//
// Translate is now a separate standalone component: TranslateWidget.jsx
// positioned independently at bottom-right.
// ─────────────────────────────────────────────────────────────────────

import { useState }       from 'react'
import { Sun, Moon }      from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme }       from '../context/ThemeContext'

const LANGS = [
  { code: 'en', label: 'EN', flag: '🇬🇧', full: 'English' },
  { code: 'zh', label: 'ZH', flag: '🇨🇳', full: '中文'    },
]

export default function FloatingControls() {
  const { i18n }                        = useTranslation()
  const { toggleTheme, mode, theme: T } = useTheme()

  const currentIdx = LANGS.findIndex(l => i18n.language?.startsWith(l.code))
  const activeLang = LANGS[currentIdx === -1 ? 0 : currentIdx]

  const cycleLanguage = () => {
    const next = LANGS[(currentIdx + 1) % LANGS.length]
    i18n.changeLanguage(next.code)
    localStorage.setItem('spiricomp_lang', next.code)
  }

  const pillBg      = mode === 'dark' ? 'rgba(10,11,20,0.88)' : 'rgba(255,255,255,0.92)'
  const pillBorder  = mode === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.10)'
  const divider     = mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const btnColor    = T.textMuted
  const btnHoverBg  = mode === 'dark' ? 'rgba(207,10,44,0.12)' : 'rgba(207,10,44,0.08)'

  return (
    <>
      <style>{`
        @keyframes fc_in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .fc-btn {
          display:flex; align-items:center; justify-content:center; gap:6px;
          background:transparent; border:none; cursor:pointer;
          font-family:'Inter',system-ui,sans-serif; font-size:11px; font-weight:700;
          letter-spacing:.5px; padding:0 14px; height:100%;
          color:${btnColor}; transition:background .18s, color .18s; white-space:nowrap;
        }
        .fc-btn:hover { background:${btnHoverBg}; color:#CF0A2C; }
        .fc-btn:first-child { border-radius:22px 0 0 22px; }
        .fc-btn:last-child  { border-radius:0 22px 22px 0; }
      `}</style>

      <div style={{
        position:       'fixed',
        bottom:         24,
        left:           24,
        zIndex:         9998,
        display:        'flex',
        alignItems:     'stretch',
        height:         40,
        background:     pillBg,
        border:         `1px solid ${pillBorder}`,
        borderRadius:   22,
        backdropFilter: 'blur(16px) saturate(1.6)',
        boxShadow:      mode === 'dark'
          ? '0 4px 24px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04)'
          : '0 4px 24px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04)',
        overflow:       'hidden',
        animation:      'fc_in .3s ease',
      }}>
        {/* Theme toggle */}
        <button className="fc-btn" onClick={toggleTheme}
          title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {mode === 'dark'
            ? <Sun  size={14} strokeWidth={2.2}/>
            : <Moon size={14} strokeWidth={2.2}/>
          }
          <span style={{ fontSize:10 }}>{mode === 'dark' ? 'Light' : 'Dark'}</span>
        </button>

        <div style={{ width:1, background:divider, margin:'8px 0', flexShrink:0 }}/>

        {/* EN ↔ ZH toggle */}
        <button className="fc-btn" onClick={cycleLanguage}
          title={`Language: ${activeLang.full} — click to switch`}>
          <span style={{ fontSize:13 }}>{activeLang.flag}</span>
          <span>{activeLang.label}</span>
        </button>
      </div>
    </>
  )
}