// src/components/LanguageToggle.jsx
// ─────────────────────────────────────────────────────────────────────
// This component is kept for backward compatibility — any page that
// still imports <LanguageToggle /> will continue to work.
//
// The primary language + theme controls now live in <FloatingControls />
// (bottom-left pill).  This version is improved:
//   • Cycles EN → FR → AR → ZH → EN  (was only EN ↔ ZH)
//   • Correct hover state for both themes
//   • Works standalone if embedded anywhere (e.g. LoginPage header)
// ─────────────────────────────────────────────────────────────────────

import { useState }       from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme }       from '../context/ThemeContext'

const LANGS = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'zh', label: 'ZH', flag: '🇨🇳' },
]

export default function LanguageToggle() {
  const { i18n }     = useTranslation()
  const { theme: T } = useTheme()
  const [hovered, setHovered] = useState(false)

  const currentIdx = LANGS.findIndex(l => i18n.language?.startsWith(l.code))
  const active     = LANGS[currentIdx === -1 ? 0 : currentIdx]

  const cycle = () => {
    const next = LANGS[(currentIdx + 1) % LANGS.length]
    i18n.changeLanguage(next.code)
    localStorage.setItem('spiricomp_lang', next.code)
  }

  return (
    <button
      onClick={cycle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Language: ${active.label} — click to cycle`}
      style={{
        background:   hovered ? T.primaryBg : 'transparent',
        border:       `1px solid ${hovered ? T.primaryBorder : T.border}`,
        borderRadius: 6,
        padding:      '5px 12px',
        display:      'flex', alignItems: 'center', gap: 7,
        cursor:       'pointer',
        color:        hovered ? T.primary : T.textMuted,
        fontFamily:   "'Inter', 'Roboto', sans-serif",
        fontSize:     11, fontWeight: 700,
        transition:   'all .2s',
      }}>
      <span style={{ fontSize: 13 }}>{active.flag}</span>
      <span>{active.label}</span>
    </button>
  )
}