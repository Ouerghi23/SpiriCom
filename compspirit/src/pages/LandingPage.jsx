// src/pages/LandingPage.jsx

import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate }           from 'react-router-dom'
import { useTranslation }              from 'react-i18next'
import { Sun, Moon }                   from 'lucide-react'
import { useTheme }                    from '../context/ThemeContext'
import logoImg   from '../assets/images/logo.png'
import coverImg  from '../assets/images/cover.jpg'
import serverImg from '../assets/images/server.png'
import dashImg   from '../assets/images/dashboard.jpg'
import towerImg  from '../assets/images/tower.jpg'
import av1Img    from '../assets/images/av1.jpg'
import av2Img    from '../assets/images/av2.jpg'
import av3Img    from '../assets/images/av3.jpg'
import av4Img    from '../assets/images/av4.jpg'
import TranslateWidget from '../components/TranslateWidget'

// ── Huawei Brand Tokens ───────────────────────────────────────────────
const HW = {
  red:      '#EE3A43',   // FIX-U1
  redHover: '#D42F38',
  redDim:   'rgba(238,58,67,.1)',
  redBd:    'rgba(238,58,67,.28)',
  blue:     '#0093D5',
  blueDim:  'rgba(0,147,213,.12)',
  blueBd:   'rgba(0,147,213,.3)',
  blueLight:'#00C3FF',
  navy:     '#001F3F',
}

// ── Inline SVG Icons (Lucide-compatible paths) ────────────────────────
const IconSignal = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V4M22 20v-4"/>
  </svg>
)
const IconMap = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/>
    <line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
)
const IconCpu = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <rect x="9" y="9" width="6" height="6"/>
    <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>
  </svg>
)
const IconTrendingUp = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
)
const IconSearch = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const IconUsers = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IconMessageSquare = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)
const IconArrowRight = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
)
const IconArrowUpRight = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7" y1="17" x2="17" y2="7"/>
    <polyline points="7 7 17 7 17 17"/>
  </svg>
)
const IconChevronLeft = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const IconChevronRight = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconChevronDown = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)
const IconQuote = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill={HW.red} opacity="0.2">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
  </svg>
)
const IconStar = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={HW.red}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
)

// ── Static Data ───────────────────────────────────────────────────────
const STATS = [
  { value: 50,  suffix: 'K+', labelKey: 'landing.statsComplaints'  },
  { value: 552, suffix: 'K',  labelKey: 'landing.statsKpi'         },
  { value: 5,   suffix: 'K',  labelKey: 'landing.statsSites'       },
  { value: 24,  suffix: '',   labelKey: 'landing.statsGovernorates' },
]

const MODULES = [
  { icon: IconMap,           titleKey: 'landing.modGisTitle',  descKey: 'landing.modGisDesc',  tag: 'GIS',       path: '/dashboard/map'        },
  { icon: IconCpu,           titleKey: 'landing.modMlTitle',   descKey: 'landing.modMlDesc',   tag: 'ML',        path: '/dashboard'            },
  { icon: IconTrendingUp,    titleKey: 'landing.modAiTitle',   descKey: 'landing.modAiDesc',   tag: 'AI',        path: '/dashboard/forecast'   },
  { icon: IconUsers,         titleKey: 'landing.modUxTitle',   descKey: 'landing.modUxDesc',   tag: 'UX',        path: '/dashboard/segments'   },
  { icon: IconMessageSquare, titleKey: 'landing.modNlpTitle',  descKey: 'landing.modNlpDesc',  tag: 'NLP',       path: '/dashboard/nlp'        },
   { icon: IconSearch,        titleKey: 'landing.modAiAssistantTitle',  descKey: 'landing.modAiAssistantDesc',  tag: 'LLM',   path: '/dashboard/about'     },

]

const TESTIMONIALS = [
  { name: 'Karim Mansouri',  role: 'Senior NOC Engineer',          company: 'Major Telecom Operator',     av: av1Img, textKey: 'landing.testi1' },
  { name: 'Sana Ouerghi',    role: 'Network Quality Manager',      company: 'Leading Telecom Vendor',     av: av2Img, textKey: 'landing.testi2' },
  { name: 'Ahmed Trabelsi',  role: 'Data Science Lead',            company: 'Telecom Analytics Division', av: av3Img, textKey: 'landing.testi3' },
  { name: 'Leila Benmoussa', role: 'Customer Experience Director', company: 'Mobile Operator',            av: av4Img, textKey: 'landing.testi4' },
]

// FIX-B4 + FIX-U3: All French text removed. All ticker items in English.
const TICKER_ITEMS = [
  'QoE Scoring Engine',
  'QoS Degradation Detection',
  'KQI · KPI Correlation',
  'Spatio-Temporal Analysis',
  'ML Anomaly Detection',
  'Random Forest Disengagement Scoring',   // ← remplace "XGBoost Forecasting"
  'SHAP Churn Drivers',                    // ← remplace "SHAP Root Cause Analysis"
  'Subscriber & Complaint Segmentation',   // ← remplace "K-Means Segmentation"
  'Multilingual NLP Classification',       // ← précisé : AR/FR/EN
  '24 Governorates',
  '25K+ Complaints Analyzed',              // ← FIX: 25,727 vérifié (NB03a)
  'Huawei NOC Intelligence',
]

// ── Animated Counter ──────────────────────────────────────────────────
// FIX-B5: intervalRef always cleared on unmount
function Counter({ target, suffix }) {
  const [val, setVal]  = useState(0)
  const ref            = useRef(null)
  const done           = useRef(false)
  const intervalRef    = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !done.current) {
        done.current = true
        let current  = 0
        const step   = target / 65
        intervalRef.current = setInterval(() => {
          current += step
          if (current >= target) {
            setVal(target)
            clearInterval(intervalRef.current)
          } else {
            setVal(Math.round(current))
          }
        }, 16)
      }
    }, { threshold: 0.4 })

    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      if (intervalRef.current) clearInterval(intervalRef.current) // FIX-B5
    }
  }, [target])

  return <span ref={ref}>{val}{suffix}</span>
}

// ── Scroll Reveal ─────────────────────────────────────────────────────
function Reveal({ children, delay = 0 }) {
  const ref                 = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} style={{
      opacity:    visible ? 1 : 0,
      transform:  visible ? 'translateY(0)' : 'translateY(28px)',
      transition: `all .75s ${delay}s cubic-bezier(0.25,0.1,0.25,1)`,
    }}>
      {children}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate                        = useNavigate()
  const { t }                           = useTranslation()
  const { theme: T, mode, toggleTheme } = useTheme()

  const [scrolled,     setScrolled]     = useState(false)
  const [activeModule, setActiveModule] = useState(0)
  const [testiIdx,     setTestiIdx]     = useState(0)

  // ── Mode-adaptive palette ──
  const BG       = mode === 'dark' ? '#080A12' : '#F0F2F8'
  const BG2      = mode === 'dark' ? '#0A0C14' : '#E8EBF5'
  const BG3      = mode === 'dark' ? '#0C0E16' : '#FFFFFF'
  const CARD_BG  = mode === 'dark' ? '#0E1020' : '#FFFFFF'
  const TEXT     = mode === 'dark' ? '#FFFFFF'              : '#0D1117'
  const MUTED    = mode === 'dark' ? 'rgba(255,255,255,.45)': 'rgba(13,17,23,.55)'
  const DIM      = mode === 'dark' ? 'rgba(255,255,255,.2)' : 'rgba(13,17,23,.35)'
  const BORDER   = mode === 'dark' ? 'rgba(255,255,255,.06)': 'rgba(0,0,0,.08)'
  const GAP_COLOR = mode === 'dark' ? 'rgba(255,255,255,.07)': 'rgba(0,0,0,.1)'
  const RED      = HW.red   // FIX-U1
  const BLUE     = HW.blue

  const goToDashboard = () => navigate('/dashboard')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setActiveModule(prev => (prev + 1) % MODULES.length)
    }, 4200)
    return () => clearInterval(id)
  }, [])

  const navBg = scrolled
    ? mode === 'dark' ? 'rgba(8,10,18,.95)' : 'rgba(240,242,248,.97)'
    : 'transparent'

  // FIX-B2: ticker bg reacts to scroll
  const tickerBg = scrolled
    ? mode === 'dark' ? 'rgba(8,10,18,.97)' : 'rgba(232,235,245,.97)'
    : mode === 'dark' ? '#050710'           : '#E4E7F2'

  // Mode-aware split section overlays
  const imgOverlayR = mode === 'dark'
    ? 'linear-gradient(to right, transparent 55%, rgba(8,10,18,.78) 100%)'
    : 'linear-gradient(to right, transparent 55%, rgba(240,242,248,.88) 100%)'
  const imgOverlayL = mode === 'dark'
    ? 'linear-gradient(to left, transparent 55%, rgba(8,10,18,.65) 100%)'
    : 'linear-gradient(to left, transparent 55%, rgba(240,242,248,.72) 100%)'

  return (
    <div style={{
      fontFamily:   "'Barlow', 'Inter', system-ui, sans-serif",
      background:   BG,
      color:        TEXT,
      overflowX:    'hidden',
      transition:   'background .3s, color .3s',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400;1,700&family=Barlow+Condensed:ital,wght@0,700;0,800;0,900;1,300;1,700;1,900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
        ::-webkit-scrollbar        { width: 3px }
        ::-webkit-scrollbar-track  { background: ${BG} }
        ::-webkit-scrollbar-thumb  { background: ${RED}; border-radius: 3px }

        @keyframes kenburns   { 0%{transform:scale(1) translate(0,0)} 100%{transform:scale(1.06) translate(-1%,.8%)} }
        @keyframes pulse-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        @keyframes slide-in   { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ticker     { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes bounce-y   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(8px)} }

        /* ── Landing Nav Links ── */
        .lp-nav-link {
          color: ${MUTED};
          font-size: 11px;
          font-weight: 600;
          letter-spacing: .8px;
          text-transform: uppercase;
          cursor: pointer;
          transition: color .2s;
          white-space: nowrap;
          position: relative;
          padding-bottom: 2px;
          text-decoration: none;
        }
        .lp-nav-link::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          right: 0;
          height: 1.5px;
          background: ${RED};
          transform: scaleX(0);
          transform-origin: left;
          transition: transform .25s;
        }
        .lp-nav-link:hover           { color: ${TEXT}; }
        .lp-nav-link:hover::after    { transform: scaleX(1); }

        /* ── Buttons ── */
        .btn-primary {
          background: ${RED};
          color: white;
          border: none;
          padding: 14px 32px;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all .2s;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          border-radius: 2px;
        }
        .btn-primary:hover {
          background: ${HW.redHover};
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(238,58,67,.35);
        }

        .btn-ghost {
          background: transparent;
          color: ${MUTED};
          border: 1px solid ${BORDER};
          padding: 14px 32px;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all .2s;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          border-radius: 2px;
          text-decoration: none;
        }
        .btn-ghost:hover {
          border-color: ${mode === 'dark' ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.3)'};
          color: ${TEXT};
          background: ${mode === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'};
        }

        /* ── Module Cards ── */
        .module-card {
          padding: 30px 24px;
          border: 1px solid ${BORDER};
          background: ${CARD_BG};
          transition: all .35s cubic-bezier(.22,1,.36,1);
          position: relative;
          cursor: pointer;
          overflow: hidden;
          outline: none;
        }
        .module-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1.5px;
          background: linear-gradient(90deg, transparent, ${BLUE}, transparent);
          transform: scaleX(0);
          transform-origin: center;
          transition: transform .4s;
        }
        .module-card:hover,
        .module-card.active {
          border-color: ${HW.blueBd};
          background: ${mode === 'dark' ? HW.blueDim : 'rgba(0,147,213,.04)'};
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,147,213,.1);
        }
        .module-card:hover::before,
        .module-card.active::before { transform: scaleX(1); }
        .module-card:focus-visible  { outline: 2px solid ${BLUE}; outline-offset: 2px; }

        /* ── Testimonial Cards ── */
        .testi-card {
          background: ${BG3};
          border: 1px solid ${BORDER};
          padding: 38px;
          position: relative;
          overflow: hidden;
          transition: all .3s;
        }
        .testi-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1.5px;
          background: linear-gradient(90deg, transparent, ${RED}, transparent);
          transform: scaleX(0);
          transform-origin: center;
          transition: transform .5s;
        }
        .testi-card:hover::before   { transform: scaleX(1); }
        .testi-card:hover           { border-color: rgba(238,58,67,.2); }

        /* ── Image wrapper ── */
        .img-wrap { overflow: hidden; position: relative; }
        .img-wrap img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .8s cubic-bezier(.22,1,.36,1); }
        .img-wrap:hover img { transform: scale(1.04); }

        /* ── Tag pill ── */
        .tag {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 2px;
          padding: 3px 9px;
          border: 1px solid ${HW.blueBd};
          color: ${BLUE};
          text-transform: uppercase;
          background: ${HW.blueDim};
          border-radius: 2px;
        }

        /* ── Section label ── */
        .section-label {
          font-size: 10px;
          font-weight: 800;
          color: ${RED};
          letter-spacing: 4px;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }
        .section-label::before { content: ''; width: 20px; height: 1px; background: ${RED}; }

        /* ── Ticker ── */
        .ticker-wrap {
          overflow: hidden;
          border-top: 1px solid ${BORDER};
          border-bottom: 1px solid ${BORDER};
          padding: 9px 0;
          transition: background .4s;
        }
        .ticker-track {
          display: flex;
          animation: ticker 42s linear infinite;
          width: max-content;
        }
        .ticker-item {
          font-size: 10px;
          color: ${MUTED};
          letter-spacing: 2.5px;
          text-transform: uppercase;
          padding: 0 42px;
          display: flex;
          align-items: center;
          gap: 14px;
          white-space: nowrap;
        }
        .ticker-dot { width: 3px; height: 3px; border-radius: 50%; background: ${BLUE}; flex-shrink: 0; }

        /* ── Stats blocks ── */
        .stat-block {
          text-align: center;
          padding: 36px 24px;
          border: 1px solid ${BORDER};
          background: ${mode === 'dark' ? '#0A0C14' : '#FFFFFF'};
          transition: all .3s;
          position: relative;
          overflow: hidden;
        }
        .stat-block::before {
          content: '';
          position: absolute;
          top: 0; left: 15%; right: 15%;
          height: 1px;
          background: linear-gradient(90deg, transparent, ${BLUE}, transparent);
        }
        .stat-block:hover {
          border-color: ${HW.blueBd};
          background: ${mode === 'dark' ? HW.blueDim : 'rgba(0,147,213,.04)'};
          transform: translateY(-2px);
        }

        /* ── Theme toggle ── */
        .theme-btn-lp {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${mode === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'};
          border: 1px solid ${BORDER};
          color: ${MUTED};
          cursor: pointer;
          transition: all .2s;
          flex-shrink: 0;
        }
        .theme-btn-lp:hover {
          background: ${HW.redDim};
          border-color: ${HW.redBd};
          color: ${RED};
        }

        /* ── Scroll bounce ── */
        .scroll-bounce { animation: bounce-y 1.8s ease-in-out infinite; }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .split-grid    { grid-template-columns: 1fr !important; }
          .modules-grid  { grid-template-columns: 1fr !important; }
          .testi-grid    { grid-template-columns: 1fr !important; }
          .stats-grid    { grid-template-columns: repeat(2,1fr) !important; }
          .nav-links-lp, .nav-actions-lp { display: none !important; }
        }
      `}</style>

      {/* ══ NAVBAR ══════════════════════════════════════════════════════ */}
      <nav style={{
        position:       'fixed',
        top:            0,
        left:           0,
        right:          0,
        zIndex:         200,
        height:         64,
        padding:        '0 44px',
        display:        'flex',
        alignItems:     'center',
        gap:            22,
        background:     navBg,
        borderBottom:   scrolled ? `1px solid ${BORDER}` : 'none',
        backdropFilter: scrolled ? 'blur(20px) saturate(1.8)' : 'none',
        transition:     'all .4s',
      }}>

        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, textDecoration: 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
            border: `1.5px solid rgba(238,58,67,.55)`, flexShrink: 0 }}>
            <img src={logoImg} alt="SpiriCom" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          </div>
          <div style={{ lineHeight: 1 }}>
            {/* FIX-B1: SpiriCom */}
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900,
              fontSize: 20, letterSpacing: '-.4px', color: TEXT }}>
              Spiri<span style={{ color: RED }}>Com</span>
            </div>
            <div style={{ fontSize: 8, color: DIM, letterSpacing: 3.5, marginTop: 2, fontWeight: 700 }}>
              NOC INTELLIGENCE
            </div>
          </div>
        </Link>

        {/* Center nav links */}
        <div className="nav-links-lp" style={{ flex: 1, display: 'flex',
          justifyContent: 'center', gap: 26, overflow: 'hidden' }}>
          {[
            { label: t('nav.overview'),  path: '/dashboard'            },
            { label: t('nav.map'),       path: '/dashboard/map'        },
            { label: t('nav.anomalies'), path: '/dashboard/anomalies'  },
            { label: t('nav.forecast'),  path: '/dashboard/forecast'   },
            { label: t('nav.segments'),  path: '/dashboard/segments'   },
            { label: t('nav.nlp'),       path: '/dashboard/nlp'        },
          ].map(({ label, path }) => (
            <Link key={path} to={path} className="lp-nav-link">{label}</Link>
          ))}
        </div>

        {/* Right actions */}
        <div className="nav-actions-lp" style={{ display: 'flex', gap: 8,
          alignItems: 'center', flexShrink: 0 }}>

          {/* Theme toggle */}
          <button className="theme-btn-lp" onClick={toggleTheme}
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {mode === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
          </button>

        

          {/* Launch Dashboard */}
          <button className="btn-primary" style={{ padding: '9px 22px', fontSize: 11 }}
            onClick={goToDashboard}>
            {t('landing.launch') || 'Launch Dashboard'}
            <IconArrowUpRight size={12} color="white"/>
          </button>
        </div>
      </nav>

      {/* ══ TICKER ══════════════════════════════════════════════════════ */}
      {/* FIX-B2: background reacts to scroll state */}
      <div className="ticker-wrap" style={{
        position:   'fixed',
        top:        64,
        left:       0,
        right:      0,
        zIndex:     199,
        background: tickerBg,
      }}>
        <div className="ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <div key={i} className="ticker-item">
              <div className="ticker-dot"/>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* ══ HERO ════════════════════════════════════════════════════════ */}
      <section style={{ height: '100vh', minHeight: 680, position: 'relative',
        overflow: 'hidden', display: 'flex', alignItems: 'center', paddingTop: 106 }}>

        {/* Background image */}
        <img src={coverImg} alt="" aria-hidden="true" style={{
          position:  'absolute', inset: 0,
          width:     '100%', height: '100%',
          objectFit: 'cover',
          animation: 'kenburns 25s ease alternate infinite',
          opacity:   mode === 'dark' ? .4 : .2,
          filter:    'contrast(1.1) saturate(.7)',
          zIndex:    0,
        }}/>

        {/* Primary overlay */}
        <div style={{ position: 'absolute', inset: 0, background:
          mode === 'dark'
            ? 'linear-gradient(110deg, rgba(8,10,18,.97) 35%, rgba(8,10,18,.6) 68%, rgba(8,10,18,.28) 100%)'
            : 'linear-gradient(110deg, rgba(240,242,248,.97) 35%, rgba(240,242,248,.72) 68%, rgba(240,242,248,.32) 100%)'
        }}/>

        {/* Bottom fade */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '36%',
          background: `linear-gradient(to top, ${BG}, transparent)` }}/>

        {/* Subtle grid */}
        <div style={{ position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(rgba(0,147,213,.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,147,213,.025) 1px, transparent 1px)`,
          backgroundSize: '72px 72px',
          pointerEvents: 'none',
        }}/>

        {/* Accent radial — Huawei Blue */}
        <div style={{ position: 'absolute', right: '4%', top: '50%',
          transform: 'translateY(-50%)',
          width: 520, height: 520,
          background: `radial-gradient(circle, rgba(0,147,213,.1) 0%, transparent 68%)`,
          pointerEvents: 'none',
        }}/>

        {/* Content */}
        <div style={{ position: 'relative', width: '100%', padding: '0 7%', zIndex: 1 }}>

          {/* Live badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10,
            marginBottom: 30, animation: 'slide-in .55s .05s ease both' }}>
            <div style={{
              display:     'flex',
              alignItems:  'center',
              gap:         7,
              background:  HW.redDim,
              border:      `1px solid ${HW.redBd}`,
              padding:     '5px 14px',
              borderRadius: 2,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: RED,
                display: 'inline-block', animation: 'pulse-dot 2s ease-in-out infinite' }}/>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.5,
                textTransform: 'uppercase', color: RED }}>
                Live Platform
              </span>
            </div>
            <span style={{ fontSize: 11, color: DIM, letterSpacing: 1.5 }}>
              Huawei Technologies Tunisia
            </span>
          </div>

          {/* H1 — FIX-B7: letterSpacing via clamp to prevent overflow at small sizes */}
          <h1 style={{
            fontFamily:    "'Barlow Condensed', sans-serif",
            fontSize:      'clamp(30px, 5vw, 64px)',
            fontWeight:    900,
            lineHeight:    .95,
            letterSpacing: 'clamp(-1px, -0.03em, -2px)',
            marginBottom:  26,
            animation:     'slide-in .62s .12s ease both',
            color:         TEXT,
          }}>
            {t('landing.heroTitle1')}{' '}
            <span style={{ color: RED, fontStyle: 'italic' }}>{t('landing.heroTitle2')}</span>
          </h1>

          <h2 style={{
            fontFamily:    "'Barlow Condensed', sans-serif",
            fontSize:      'clamp(22px, 3.8vw, 50px)',
            fontWeight:    300,
            color:         MUTED,
            letterSpacing: 'clamp(-.5px, -0.02em, -1px)',
            marginBottom:  28,
            animation:     'slide-in .62s .18s ease both',
          }}>
            {t('landing.heroSubtitle')}
          </h2>

          <p style={{ fontSize: 15, lineHeight: 1.8, color: MUTED, maxWidth: 500,
            marginBottom: 42, animation: 'slide-in .62s .24s ease both', fontWeight: 300 }}>
            {t('landing.heroDesc')}
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap',
            animation: 'slide-in .62s .32s ease both' }}>
            <button className="btn-primary" style={{ fontSize: 13, padding: '15px 38px' }}
              onClick={goToDashboard}>
              {t('landing.accessDashboard') || 'Access Dashboard'}
              <IconArrowRight size={15} color="white"/>
            </button>
            <Link to="/dashboard/about" className="btn-ghost"
              style={{ fontSize: 13, padding: '15px 38px' }}>
              {t('landing.explorePlatform') || 'Explore Platform'}
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{ position: 'absolute', bottom: 22, left: '50%',
          transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 4, zIndex: 1, opacity: .45 }}>
          <span style={{ fontSize: 9, color: DIM, letterSpacing: 4, textTransform: 'uppercase' }}>
            {t('landing.scrollExplore') || 'Scroll'}
          </span>
          <div className="scroll-bounce" style={{ color: DIM }}>
            <IconChevronDown size={18} color="currentColor"/>
          </div>
        </div>
      </section>

      {/* ══ STATS ════════════════════════════════════════════════════════ */}
      <section style={{ background: BG, padding: '0', borderTop: `1px solid ${BORDER}` }}>
        <div className="stats-grid" style={{ display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: GAP_COLOR }}>
          {STATS.map((s, i) => (
            <Reveal key={s.labelKey} delay={i * .06}>
              <div className="stat-block">
                {/* Stats number color: Huawei Blue (not red) for a trustworthy data feel */}
                <div style={{
                  fontFamily:    "'Barlow Condensed', sans-serif",
                  fontSize:      'clamp(38px, 5vw, 60px)',
                  fontWeight:    900,
                  lineHeight:    1,
                  color:         BLUE,
                  letterSpacing: '-2px',
                }}>
                  <Counter target={s.value} suffix={s.suffix}/>
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 10,
                  letterSpacing: 2, textTransform: 'uppercase',
                  whiteSpace: 'pre-line', lineHeight: 1.6, fontWeight: 500 }}>
                  {t(s.labelKey)}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ SPLIT 1 — Infrastructure ════════════════════════════════════ */}
      <section style={{ background: BG, borderTop: `1px solid ${BORDER}` }}>
        <div className="split-grid" style={{ display: 'grid',
          gridTemplateColumns: '1fr 1fr', minHeight: 520 }}>

          {/* Image side */}
          <div style={{ position: 'relative', minHeight: 380 }}>
            <div className="img-wrap" style={{ position: 'absolute', inset: 0 }}>
              <img src={serverImg} alt="Server infrastructure"/>
              <div style={{ position: 'absolute', inset: 0, background: imgOverlayR }}/>
            </div>
            {/* Status badge — outside img-wrap so overflow:hidden doesn't clip it */}
            <div style={{ position: 'absolute', bottom: 26, left: 26, zIndex: 2 }}>
              <div style={{ background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,.1)', padding: '9px 16px',
                display: 'inline-flex', alignItems: 'center', gap: 9, borderRadius: 2 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E',
                  animation: 'pulse-dot 1.8s infinite' }}/>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.7)',
                  letterSpacing: 2, fontWeight: 700 }}>
                  {t('landing.statsSites') || '5K'} Active Sites
                </span>
              </div>
            </div>
          </div>

          {/* Text side */}
          <div style={{ background: BG3, padding: '68px 52px', display: 'flex',
            flexDirection: 'column', justifyContent: 'center',
            borderLeft: `1px solid ${BORDER}` }}>
            <Reveal>
              <div className="section-label">
                {t('landing.infraSection') || 'Network Infrastructure'}
              </div>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 'clamp(26px, 3.5vw, 46px)', fontWeight: 900,
                letterSpacing: '-1px', lineHeight: 1.0, marginBottom: 20, color: TEXT }}>
                {t('landing.infraH2')}<br/>
                <span style={{ color: MUTED, fontWeight: 400, fontStyle: 'italic' }}>
                  {t('landing.infraH2b')}
                </span>
              </h2>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.9,
                fontWeight: 300, maxWidth: 400 }}>
                {t('landing.infraDesc')}
              </p>
              <button className="btn-primary" style={{ marginTop: 34, alignSelf: 'flex-start' }}
                onClick={() => navigate('/dashboard/map')}>
                {t('landing.viewMap') || 'View Network Map'}
                <IconArrowRight size={14} color="white"/>
              </button>
            </Reveal>
          </div>
        </div>

        {/* ── SPLIT 2 — Forecasting ── */}
        <div className="split-grid" style={{ display: 'grid',
          gridTemplateColumns: '1fr 1fr', minHeight: 520,
          borderTop: `1px solid ${BORDER}` }}>

          {/* Text side */}
          <div style={{ background: mode === 'dark' ? '#0E1020' : '#F5F7FF',
            padding: '68px 52px', display: 'flex', flexDirection: 'column',
            justifyContent: 'center', borderRight: `1px solid ${BORDER}` }}>
            <Reveal>
              <div className="section-label">
                {t('landing.predictSection') || 'Predictive Intelligence'}
              </div>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 'clamp(26px, 3.5vw, 46px)', fontWeight: 900,
                letterSpacing: '-1px', lineHeight: 1.0, marginBottom: 20, color: TEXT }}>
                {t('landing.predictH2')}<br/>
                <span style={{ color: RED, fontStyle: 'italic' }}>
                  {t('landing.predictH2b')}
                </span>
              </h2>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.9,
                fontWeight: 300, maxWidth: 400 }}>
                {t('landing.predictDesc')}
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 26, flexWrap: 'wrap' }}>
                {['modelAdvanced', 'modelTemporal', 'modelAccuracy'].map(key => (
                  <div key={key} style={{ border: `1px solid ${BORDER}`, padding: '8px 14px',
                    background: mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)',
                    borderRadius: 2 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 14, fontWeight: 800, color: TEXT }}>
                      {t(`landing.${key}`)}
                    </div>
                    <div style={{ fontSize: 9, color: MUTED, marginTop: 2,
                      letterSpacing: 2, textTransform: 'uppercase' }}>
                      {t(`landing.${key}Sub`)}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-primary" style={{ marginTop: 30, alignSelf: 'flex-start' }}
                onClick={() => navigate('/dashboard/forecast')}>
                {t('landing.openForecast') || 'Open Forecast'}
                <IconArrowRight size={14} color="white"/>
              </button>
            </Reveal>
          </div>

          {/* Image side */}
          <div style={{ position: 'relative', minHeight: 380 }}>
            <div className="img-wrap" style={{ position: 'absolute', inset: 0 }}>
              <img src={dashImg} alt="Analytics dashboard"/>
              <div style={{ position: 'absolute', inset: 0, background: imgOverlayL }}/>
            </div>
            <div style={{ position: 'absolute', top: 26, right: 26, zIndex: 2 }}>
              <div style={{ background: HW.redDim, backdropFilter: 'blur(12px)',
                border: `1px solid ${HW.redBd}`, padding: '9px 16px',
                display: 'inline-flex', alignItems: 'center', gap: 9, borderRadius: 2 }}>
                <span style={{ fontSize: 10, color: RED, letterSpacing: 2, fontWeight: 800 }}>
                  7-DAY FORECAST · ACTIVE
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ MODULES ══════════════════════════════════════════════════════ */}
      <section style={{ background: BG2, padding: '96px 44px',
        borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-end', marginBottom: 52, flexWrap: 'wrap', gap: 20 }}>
              <div>
                <div className="section-label">
                  {t('landing.platformSection') || 'Platform Modules'}
                </div>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 'clamp(28px, 4.5vw, 56px)', fontWeight: 900,
                  letterSpacing: '-1.5px', lineHeight: .96, color: TEXT }}>
                  {t('landing.sixPillars') || 'Six Pillars of'}<br/>
                  <span style={{ color: MUTED, fontWeight: 400, fontStyle: 'italic' }}>
                    {t('landing.networkIntel') || 'Network Intelligence'}
                  </span>
                </h2>
              </div>
              <button className="btn-ghost" style={{ flexShrink: 0, fontSize: 11 }}
                onClick={goToDashboard}>
                {t('landing.accessModules') || 'Access All Modules'}
                <IconArrowUpRight size={12}/>
              </button>
            </div>
          </Reveal>

          <div className="modules-grid" style={{ display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: GAP_COLOR }}>
            {MODULES.map((m, i) => {
              const Icon     = m.icon
              const isActive = activeModule === i
              return (
                <Reveal key={m.titleKey} delay={i * .06}>
                  <div
                    className={`module-card${isActive ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => setActiveModule(i)}
                    onClick={() => navigate(m.path)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate(m.path)}
                    style={{ height: '100%' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: 20 }}>
                      {/* Icon box — Huawei Blue on active */}
                      <div style={{
                        width:      48,
                        height:     48,
                        transition: 'all .35s',
                        background: isActive ? HW.blueDim
                          : mode === 'dark' ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.04)',
                        border:     `1px solid ${isActive ? HW.blueBd : BORDER}`,
                        display:    'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color:      isActive ? BLUE : MUTED,
                        borderRadius: 2,
                      }}>
                        <Icon size={22} color="currentColor"/>
                      </div>
                      <span className="tag">{m.tag}</span>
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3,
                      marginBottom: 10, whiteSpace: 'pre-line',
                      color: isActive ? TEXT : MUTED }}>
                      {t(m.titleKey)}
                    </h3>
                    <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.8, fontWeight: 300 }}>
                      {t(m.descKey)}
                    </p>
                    <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase',
                      color: isActive ? BLUE : DIM, transition: 'color .3s' }}>
                      {t('landing.explore') || 'Explore'}
                      <IconArrowUpRight size={10} color="currentColor"/>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ══ PHOTO BANNER ═════════════════════════════════════════════════ */}
      {/* FIX-B9: mode-aware overlay; navy from HW.navy */}
      <section style={{ position: 'relative', height: 420, overflow: 'hidden' }}>
        <img src={towerImg} alt="Telecom infrastructure" aria-hidden="true" style={{
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: mode === 'dark' ? .3 : .16, filter: 'saturate(.35)',
        }}/>
        {/* FIX-B9: uses HW.navy instead of hardcoded #080808 */}
        <div style={{ position: 'absolute', inset: 0, background:
          mode === 'dark'
            ? `linear-gradient(135deg, rgba(238,58,67,.7) 0%, rgba(0,31,63,.92) 55%)`
            : `linear-gradient(135deg, rgba(238,58,67,.65) 0%, rgba(0,31,63,.88) 55%)`
        }}/>
        <div style={{ position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', padding: '0 44px' }}>
          <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <Reveal>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 4.5, textTransform: 'uppercase',
                  color: 'rgba(255,255,255,.45)', marginBottom: 12, fontWeight: 800 }}>
                  QoE Intelligence
                </div>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 'clamp(24px, 4vw, 54px)', fontWeight: 900,
                  letterSpacing: '-1.5px', lineHeight: .95, color: '#fff' }}>
                  {t('landing.bannerH2a')}<br/>
                  {t('landing.bannerH2b')}<br/>
                  <span style={{ color: 'rgba(255,255,255,.4)', fontWeight: 400, fontStyle: 'italic' }}>
                    {t('landing.bannerH2c')}
                  </span>
                </h2>
                <p style={{ marginTop: 14, fontSize: 14, color: 'rgba(255,255,255,.5)',
                  fontWeight: 300, maxWidth: 420, lineHeight: 1.75 }}>
                  {t('landing.bannerDesc')}
                </p>
              </div>
            </Reveal>
            <button onClick={goToDashboard} style={{
              background:    '#fff', color: '#0D1117', border: 'none',
              padding:       '16px 44px', fontSize: 13, fontWeight: 900,
              cursor:        'pointer', letterSpacing: 1.5, textTransform: 'uppercase',
              flexShrink:    0, fontFamily: "'Barlow Condensed', sans-serif",
              transition:    'all .2s', display: 'inline-flex', alignItems: 'center', gap: 10,
              borderRadius:  2,
            }}
              onMouseOver={e => { e.currentTarget.style.background = RED; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e  => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#0D1117'; }}>
              {t('landing.launchBtn') || 'Launch NOC Platform'}
              <IconArrowRight size={14} color="currentColor"/>
            </button>
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ═════════════════════════════════════════════════ */}
      <section style={{ background: mode === 'dark' ? '#050710' : '#E8EBF5',
        padding: '96px 44px', borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-end', marginBottom: 56, flexWrap: 'wrap', gap: 20 }}>
              <div>
                <div className="section-label">
                  {t('landing.trustedSection') || 'Trusted By Engineers'}
                </div>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 'clamp(26px, 4vw, 52px)', fontWeight: 900,
                  letterSpacing: '-1.5px', lineHeight: .96, color: TEXT }}>
                  {t('landing.whatEngineers') || 'What NOC Engineers'}<br/>
                  <span style={{ color: MUTED, fontWeight: 400, fontStyle: 'italic' }}>
                    {t('landing.sayAbout') || 'Say About SpiriCom'}
                  </span>
                </h2>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setTestiIdx(idx => (idx - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
                  style={{ width: 42, height: 42, background: 'transparent',
                    border: `1px solid ${BORDER}`, color: MUTED, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .2s', borderRadius: 2 }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED; }}
                  onMouseOut={e  => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED; }}
                  aria-label="Previous testimonial">
                  <IconChevronLeft/>
                </button>
                <button
                  onClick={() => setTestiIdx(idx => (idx + 1) % TESTIMONIALS.length)}
                  style={{ width: 42, height: 42, background: RED, border: 'none',
                    color: 'white', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    transition: 'background .2s', borderRadius: 2 }}
                  onMouseOver={e => e.currentTarget.style.background = HW.redHover}
                  onMouseOut={e  => e.currentTarget.style.background = RED}
                  aria-label="Next testimonial">
                  <IconChevronRight/>
                </button>
              </div>
            </div>
          </Reveal>

          {/* Active pair logic: 2-col shows pair (testiIdx, testiIdx+1), 1-col shows only testiIdx */}
          <div className="testi-grid" style={{ display: 'grid',
            gridTemplateColumns: 'repeat(2,1fr)', gap: 1, background: GAP_COLOR }}>
            {TESTIMONIALS.map((tItem, i) => {
              const activePair = [testiIdx, (testiIdx + 1) % TESTIMONIALS.length]
              return (
                <Reveal key={tItem.name} delay={i * .07}>
                  <div className="testi-card" style={{
                    opacity:    activePair.includes(i) ? 1 : .28,
                    transition: 'opacity .45s',
                  }}>
                    <div style={{ marginBottom: 18 }}><IconQuote/></div>
                    <div style={{ display: 'flex', gap: 3, marginBottom: 18 }}>
                      {[...Array(5)].map((_, j) => <span key={j}><IconStar/></span>)}
                    </div>
                    <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.85,
                      fontWeight: 300, marginBottom: 30, fontStyle: 'italic' }}>
                      "{t(tItem.textKey)}"
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 50, height: 50, overflow: 'hidden',
                        border: `1.5px solid ${HW.redBd}`, flexShrink: 0, borderRadius: 2 }}>
                        <img src={tItem.av} alt={tItem.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
                          {tItem.name}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                          {tItem.role}
                        </div>
                        <div style={{ fontSize: 10, color: RED, marginTop: 3,
                          fontWeight: 700, letterSpacing: .5 }}>
                          {tItem.company}
                        </div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>

          {/* Pagination dots */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 34 }}>
            {TESTIMONIALS.map((_, i) => (
              <div key={i} onClick={() => setTestiIdx(i)} style={{
                height:     3,
                width:      testiIdx === i ? 32 : 8,
                background: testiIdx === i ? RED : BORDER,
                cursor:     'pointer',
                transition: 'all .3s',
                borderRadius: 1,
              }} role="button" tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setTestiIdx(i)}
                aria-label={`Testimonial ${i + 1}`}/>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════ */}
      {/* FIX-U5: localhost links removed */}
      <footer style={{ background: mode === 'dark' ? '#060810' : '#E4E7F2',
        borderTop: `1px solid ${BORDER}`, padding: '52px 44px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 40, marginBottom: 44 }}>

            {/* Brand block */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
                  border: `1.5px solid rgba(238,58,67,.45)` }}>
                  <img src={logoImg} alt="SpiriCom"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                </div>
                {/* FIX-B1 */}
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 900, fontSize: 20, letterSpacing: '-.4px', color: TEXT }}>
                  Spiri<span style={{ color: RED }}>Com</span>
                </span>
              </div>
              <p style={{ fontSize: 12, color: MUTED, maxWidth: 230, lineHeight: 1.8,
                fontWeight: 300 }}>
                Telecom Complaint Analytics &amp; Network Intelligence — Huawei Technologies Tunisia
              </p>

              {/* Live status pill */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 18,
                padding: '5px 12px', border: '1px solid rgba(34,197,94,.18)',
                background: 'rgba(34,197,94,.04)', borderRadius: 20 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E',
                  animation: 'pulse-dot 2s infinite' }}/>
                <span style={{ fontSize: 9, color: 'rgba(34,197,94,.75)', letterSpacing: 2,
                  fontWeight: 700 }}>
                  PLATFORM · LIVE
                </span>
              </div>
            </div>

            {/* Links columns */}
            <div style={{ display: 'flex', gap: 52, flexWrap: 'wrap' }}>

              {/* Platform */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 3.5, color: DIM,
                  textTransform: 'uppercase', marginBottom: 16 }}>Platform</div>
                {[
                  { label: 'Overview',   path: '/dashboard'            },
                  { label: 'Map',        path: '/dashboard/map'        },
                  { label: 'Anomalies',  path: '/dashboard/anomalies'  },
                  { label: 'Forecast',   path: '/dashboard/forecast'   },
                 // { label: 'Root Cause', path: '/dashboard/root-cause' },
                  { label: 'Segments',   path: '/dashboard/segments'   },
                  { label: 'NLP',        path: '/dashboard/nlp'        },
                ].map(({ label, path }) => (
                  <Link key={label} to={path} className="lp-nav-link"
                    style={{ display: 'block', marginBottom: 11, fontSize: 12,
                      textTransform: 'none', letterSpacing: '.3px' }}>
                    {label}
                  </Link>
                ))}
              </div>

              {/* Resources — FIX-U5: no localhost, FIX-B8: PFE Report → /dashboard/about */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 3.5, color: DIM,
                  textTransform: 'uppercase', marginBottom: 16 }}>Resources</div>
                {[
                  { label: 'API Docs',     href: '/api/docs',             external: false },
                  { label: 'PFE Report',   href: '/dashboard/about',      external: false },
                  { label: 'Architecture', href: '/dashboard/about',      external: false },
                  { label: 'GitHub',       href: 'https://github.com/Ouerghi23', external: true },
                  { label: 'NOC Guide',    href: '/dashboard/about',      external: false },
                ].map(({ label, href, external }) => (
                  external ? (
                    <a key={label} href={href} target="_blank" rel="noreferrer"
                      className="lp-nav-link"
                      style={{ display: 'block', marginBottom: 11, fontSize: 12,
                        textTransform: 'none', letterSpacing: '.3px' }}>
                      {label}
                    </a>
                  ) : (
                    <Link key={label} to={href} className="lp-nav-link"
                      style={{ display: 'block', marginBottom: 11, fontSize: 12,
                        textTransform: 'none', letterSpacing: '.3px' }}>
                      {label}
                    </Link>
                  )
                ))}
              </div>
            </div>
          </div>

          {/* Bottom strip */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 22,
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <p style={{ fontSize: 10, color: DIM, fontWeight: 400, letterSpacing: .5 }}>
              © 2026 SpiriCom — Huawei Technologies Tunisia · PFE Engineering · Ouerghi Chaima
            </p>
            <div style={{ display: 'flex', gap: 22 }}>
              <Link to="/dashboard/about" className="lp-nav-link"
                style={{ fontSize: 11, color: DIM }}>Privacy</Link>
              <Link to="/dashboard/about" className="lp-nav-link"
                style={{ fontSize: 11, color: DIM }}>Terms</Link>
              <a href="mailto:chaima.ouerghi@etudiant.u-tunis.tn" className="lp-nav-link"
                style={{ fontSize: 11, color: DIM }}>Contact</a>
            </div>
          </div>
        </div>
      </footer>
      {/* Translate widget — fixed bottom-right */}
      <TranslateWidget/>
      
    </div>
     
  )
}