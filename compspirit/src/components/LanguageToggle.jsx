// src/components/LanguageToggle.jsx - version simplifiée
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'

export default function LanguageToggle() {
  const { i18n } = useTranslation()
  const isCN = i18n.language === 'zh'

  const toggle = () => {
    const nextLang = isCN ? 'en' : 'zh'
    console.log('Switching to:', nextLang)  // Debug
    i18n.changeLanguage(nextLang)
    localStorage.setItem('spiricomp_lang', nextLang)
    // Force reload to apply all translations
    window.location.reload()
  }

  // Debug: log current language on mount
  useEffect(() => {
    console.log('Current language:', i18n.language)
    console.log('Storage language:', localStorage.getItem('spiricomp_lang'))
  }, [])

  return (
    <button
      onClick={toggle}
      style={{
        background: isCN ? 'rgba(47,129,247,.12)' : 'rgba(255,255,255,.05)',
        border: `1px solid ${isCN ? 'rgba(47,129,247,.3)' : 'rgba(255,255,255,.1)'}`,
        borderRadius: 6,
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        cursor: 'pointer',
        color: 'white',
      }}
    >
      <span>{isCN ? '🇨🇳' : '🇬🇧'}</span>
      <span style={{ fontSize: 11, fontWeight: 700 }}>
        {isCN ? '中文' : 'EN'}
      </span>
    </button>
  )
}