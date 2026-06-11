// src/context/ThemeContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

export const DARK = {
  mode:            'dark',
  bg:              '#0C0D12',
  bgCard:          '#13151D',
  bgCardHover:     '#1A1D28',
  surface:         '#13151D',
  surfaceElevated: '#1A1D28',
  border:          'rgba(255,255,255,.08)',
  borderHover:     'rgba(255,255,255,.16)',
  text:            '#E6E8F0',
  textMuted:       'rgba(230,232,240,.55)',
  textDim:         'rgba(230,232,240,.28)',
  primary:         '#2F81F7',
  primaryLight:    '#5B9FFA',
  primaryBg:       'rgba(47,129,247,.1)',
  primaryBorder:   'rgba(47,129,247,.28)',
  red:             '#F85149',
  redBg:           'rgba(248,81,73,.1)',
  redBorder:       'rgba(248,81,73,.28)',
  green:           '#3FB950',
  greenBg:         'rgba(63,185,80,.1)',
  greenBorder:     'rgba(63,185,80,.28)',
  amber:           '#D29922',
  amberBg:         'rgba(210,153,34,.1)',
  amberBorder:     'rgba(210,153,34,.28)',
  cyan:            '#39C5CF',
  purple:          '#8957E5',
  orange:          '#E16A2B',
  navBg:           'rgba(10,11,14,.97)',
  footerBg:        '#060607',
  scrollbarThumb:  '#2F81F7',
}

export const LIGHT = {
  mode:            'light',
  bg:              '#F0F2F8',
  bgCard:          '#FFFFFF',
  bgCardHover:     '#F5F7FF',
  surface:         '#FFFFFF',
  surfaceElevated: '#EEF1FA',
  border:          'rgba(0,0,0,.09)',
  borderHover:     'rgba(0,0,0,.18)',
  text:            '#0D1117',
  textMuted:       'rgba(13,17,23,.6)',
  textDim:         'rgba(13,17,23,.35)',
  primary:         '#1A6FE0',
  primaryLight:    '#3B8EFF',
  primaryBg:       'rgba(26,111,224,.08)',
  primaryBorder:   'rgba(26,111,224,.25)',
  red:             '#D03030',
  redBg:           'rgba(208,48,48,.08)',
  redBorder:       'rgba(208,48,48,.22)',
  green:           '#1E8A3C',
  greenBg:         'rgba(30,138,60,.08)',
  greenBorder:     'rgba(30,138,60,.22)',
  amber:           '#B07A00',
  amberBg:         'rgba(176,122,0,.08)',
  amberBorder:     'rgba(176,122,0,.22)',
  cyan:            '#0E8A96',
  purple:          '#6B3FCB',
  orange:          '#C4520E',
  navBg:           'rgba(255,255,255,.97)',
  footerBg:        '#E8EBF5',
  scrollbarThumb:  '#1A6FE0',
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(
    () => localStorage.getItem('spiricomp_theme') || 'dark'
  )

  const theme = mode === 'dark' ? DARK : LIGHT

  const toggleTheme = () => {
    const next = mode === 'dark' ? 'light' : 'dark'
    setMode(next)
    localStorage.setItem('spiricomp_theme', next)
  }

  // Apply bg color to document root so no white flash on edges
  useEffect(() => {
    document.documentElement.style.background = theme.bg
    document.documentElement.style.color      = theme.text
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}