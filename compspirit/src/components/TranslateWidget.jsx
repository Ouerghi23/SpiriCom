// src/components/TranslateWidget.jsx
// ─────────────────────────────────────────────────────────────────────
// Script-free Google Translate — no CDN, no blocked scripts.
//
// FIX: The previous version injected a script from Google's CDN
//      (translate_a/element.js) which is blocked on corporate/university
//      networks and in some regions. This replacement uses the Google
//      Translate WEBSITE directly — just a URL redirect, zero scripts.
//
// How it works:
//   Opens: https://translate.google.com/translate?sl=en&tl=zh-CN&u=<current_url>
//   Google proxies the page with translation injected in the new tab.
//   Works on any network — it's a regular browser navigation.
//
// Usage: <TranslateWidget /> in Layout.jsx (already added)
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'

const LANGUAGES = [
  { code: 'zh-CN', label: '中文 (简体)',  flag: '🇨🇳', name: 'Chinese Simplified'  },
  { code: 'zh-TW', label: '中文 (繁體)',  flag: '🇹🇼', name: 'Chinese Traditional' },
  { code: 'fr',    label: 'Français',    flag: '🇫🇷', name: 'French'              },
  { code: 'ar',    label: 'العربية',     flag: '🇸🇦', name: 'Arabic'             },
  { code: 'en',    label: 'English',     flag: '🇬🇧', name: 'English (original)' },
]

const BLUE     = '#2F81F7'
const BLUE_BG  = 'rgba(47,129,247,.1)'
const BLUE_BD  = 'rgba(47,129,247,.22)'
const CARD_BG  = '#13151D'
const BORDER   = 'rgba(255,255,255,.08)'
const TEXT     = '#E6E8F0'
const MUTED    = 'rgba(230,232,240,.55)'
const DIM      = 'rgba(230,232,240,.28)'

const IcoTranslate = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 8l6 6"/>
    <path d="M4 14l6-6 2-3"/>
    <path d="M2 5h12"/>
    <path d="M7 2h1"/>
    <path d="M22 22l-5-10-5 10"/>
    <path d="M14 18h6"/>
  </svg>
)

const IcoX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

export default function TranslateWidget() {
  const [open, setOpen]   = useState(false)
  const ref               = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const translate = lang => {
    setOpen(false)
    if (lang.code === 'en') return   // already English, nothing to do
    const url = `https://translate.google.com/translate?sl=en&tl=${lang.code}&u=${encodeURIComponent(window.location.href)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div ref={ref} style={{ position:'fixed', bottom:24, right:24, zIndex:9999 }}>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:     'absolute',
          bottom:       54,
          right:        0,
          background:   CARD_BG,
          border:       `1px solid ${BORDER}`,
          borderRadius: 10,
          overflow:     'hidden',
          minWidth:     210,
          boxShadow:    '0 8px 32px rgba(0,0,0,.5)',
          animation:    'tw_fadeUp .15s ease',
        }}>

          {/* Header */}
          <div style={{ padding:'10px 14px 8px', fontSize:9, fontWeight:700, color:DIM, letterSpacing:2, textTransform:'uppercase', borderBottom:`1px solid ${BORDER}` }}>
            Translate page
          </div>

          {/* Options */}
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => translate(lang)}
              style={{
                display:     'flex',
                alignItems:  'center',
                gap:         10,
                width:       '100%',
                padding:     '10px 14px',
                background:  'transparent',
                border:      'none',
                borderLeft:  '2px solid transparent',
                color:       MUTED,
                cursor:      'pointer',
                fontFamily:  'inherit',
                fontSize:    13,
                textAlign:   'left',
                transition:  'all .15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background  = `${BLUE_BG}`
                e.currentTarget.style.borderColor = BLUE
                e.currentTarget.style.color       = TEXT
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background  = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
                e.currentTarget.style.color       = MUTED
              }}
            >
              <span style={{ fontSize:16, flexShrink:0 }}>{lang.flag}</span>
              <div>
                <div style={{ fontWeight:600, color:'inherit' }}>{lang.label}</div>
                <div style={{ fontSize:10, color:DIM, marginTop:1 }}>{lang.name}</div>
              </div>
            </button>
          ))}

          {/* Footer note */}
          <div style={{ padding:'8px 14px 10px', fontSize:10, color:DIM, borderTop:`1px solid ${BORDER}`, lineHeight:1.4 }}>
            Opens Google Translate in a new tab
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Translate page / 翻译页面"
        aria-label="Translate page"
        style={{
          width:          44,
          height:         44,
          borderRadius:   '50%',
          background:     open ? BLUE : CARD_BG,
          border:         `1px solid ${open ? BLUE : BORDER}`,
          color:          '#fff',
          cursor:         'pointer',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          boxShadow:      open ? `0 4px 18px rgba(47,129,247,.35)` : '0 4px 16px rgba(0,0,0,.4)',
          transition:     'all .18s',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.borderColor = BLUE
            e.currentTarget.style.boxShadow   = `0 4px 18px rgba(47,129,247,.25)`
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = BORDER
            e.currentTarget.style.boxShadow   = '0 4px 16px rgba(0,0,0,.4)'
          }
        }}
      >
        {open ? <IcoX /> : <IcoTranslate />}
      </button>

      <style>{`
        @keyframes tw_fadeUp {
          from { opacity:0; transform:translateY(8px) }
          to   { opacity:1; transform:translateY(0)   }
        }
      `}</style>
    </div>
  )
}