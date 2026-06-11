// src/components/Layout.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC Dashboard — Redesigned Layout
// Huawei Brand: Red #EE3A43 · Blue #0093D5 · Dark Navy #001F3F
//
// FIXES vs previous version:
//  FIX-B1  Brand name unified as "SpiriCom" (brief spelling) everywhere
//  FIX-B6  Nav overflow at 1024–1280px: gap reduced, links truncate gracefully
//  FIX-B8  ShiftWidget receives T with null guard
//  FIX-U1  Huawei Red corrected from #CF0A2C → #EE3A43
//  FIX-U2  Huawei Dark Blue #001F3F applied consistently to avatar gradient
//  FIX-U5  Footer localhost links removed, replaced with safe relative paths
//  FIX-U6  Nav gap tightened; links hide at <1100px behind hamburger-ready class
//
// ENHANCEMENTS:
//  - Glassmorphism navbar with Huawei red bottom-glow on scroll
//  - Animated active nav indicator using Huawei Blue gradient
//  - Refined avatar with red ring on admin role
//  - Compact ShiftWidget zone with divider treatment
//  - Footer redesigned: 3-column layout with live API status pill
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect }                from 'react'
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation }                     from 'react-i18next'
import { LogOut, Radio }                      from 'lucide-react'
import { useAuth }                            from '../hooks/useAuth.jsx'
import { useTheme }                           from '../context/ThemeContext'
import FloatingControls                       from './FloatingControls'
import AIChatBubble                           from '../pages/AIChatBubble'
import MessagingWidget                        from './MessagingWidget'
import ShiftWidget                            from './ShiftWidget'
import logoImg                                from '../assets/images/logo_1.png'

// ── Huawei Brand Tokens ───────────────────────────────────────────────
const HW = {
  red:       '#EE3A43',   // FIX-U1: corrected from #CF0A2C
  redHover:  '#D42F38',
  redGlow:   'rgba(238,58,67,.18)',
  blue:      '#0093D5',
  blueGlow:  'rgba(0,147,213,.22)',
  blueLight: '#00C3FF',
  navy:      '#001F3F',   // FIX-U2: consistent dark blue
  navyMid:   '#0C2D4E',
}

export default function Layout() {
  const [scrolled, setScrolled] = useState(false)
  const { user, logout }        = useAuth()
  const { t }                   = useTranslation()
  const navigate                = useNavigate()
  const { theme: T }            = useTheme()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  const NAV = [
    { label: t('nav.overview'),  path: '/dashboard'            },
    { label: t('nav.map'),       path: '/dashboard/map'        },
    { label: t('nav.anomalies'), path: '/dashboard/anomalies'  },
    { label: t('nav.forecast'),  path: '/dashboard/forecast'   },
    { label: t('nav.rootcause'), path: '/dashboard/root-cause' },
    { label: t('nav.segments'),  path: '/dashboard/segments'   },
    { label: t('nav.nlp'),       path: '/dashboard/nlp'        },
    { label: t('nav.about'),     path: '/dashboard/about'      },
  ]

  // FIX-B1: unified initials using "SpiriCom" fallback
  const initials = (user?.full_name || user?.username || 'SC')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const isAdmin    = user?.role?.toLowerCase() === 'admin'
  // FIX-U2: admin gets red ring, engineer gets blue ring
  const avatarRing = isAdmin
    ? `2px solid ${HW.red}`
    : `2px solid rgba(0,147,213,.45)`

  return (
    <div style={{
      fontFamily: "'Barlow', 'Inter', 'Roboto', system-ui, sans-serif",
      background: T.bg, color: T.text,
      minHeight: '100vh', transition: 'background .25s, color .25s',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700&family=Barlow+Condensed:wght@700;800;900&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar       { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${HW.blue}55; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${HW.blue}99; }

        @keyframes hw-pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes nav-slide { from{transform:scaleX(0)} to{transform:scaleX(1)} }

        /* ── Nav Links ── */
        .nav-link {
          color: ${T.textMuted};
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: .7px;
          text-transform: uppercase;
          padding: 6px 2px;
          position: relative;
          transition: color .2s ease;
          text-decoration: none;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .nav-link::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, ${HW.blue}, ${HW.blueLight});
          transform: scaleX(0);
          transform-origin: left;
          transition: transform .25s cubic-bezier(.4,0,.2,1);
          border-radius: 1px;
        }
        .nav-link:hover        { color: ${T.text}; }
        .nav-link.active       { color: ${T.text}; }
        .nav-link:hover::after,
        .nav-link.active::after { transform: scaleX(1); }

        /* ── Logout Button ── */
        .logout-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          background: transparent;
          color: ${T.textMuted};
          border: 1px solid ${T.border};
          padding: 5px 12px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .7px;
          text-transform: uppercase;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          transition: all .2s;
          white-space: nowrap;
        }
        .logout-btn:hover {
          background: rgba(238,58,67,.08);
          border-color: rgba(238,58,67,.4);
          color: ${HW.red};
        }

        /* ── Footer Links ── */
        .footer-link {
          color: ${T.textDim};
          text-decoration: none;
          font-size: 11px;
          transition: color .2s;
        }
        .footer-link:hover { color: ${HW.blue}; }

        /* ── Nav overflow: hide extra links at narrow viewports ── */
        @media (max-width: 1100px) {
          .nav-overflow-hide { display: none !important; }
        }
        @media (max-width: 900px) {
          .nav-center        { display: none !important; }
        }
      `}</style>

      {/* ══ NAVBAR ══════════════════════════════════════════════════════ */}
      <nav style={{
        position:       'fixed',
        top:            0,
        left:           0,
        right:          0,
        zIndex:         1000,
        height:         60,
        padding:        '0 24px',
        display:        'flex',
        alignItems:     'center',
        gap:            16,
        // Glassmorphism — lightens on scroll
        background:     scrolled
          ? T.mode === 'dark'
            ? 'rgba(8,10,18,.92)'
            : 'rgba(245,247,252,.94)'
          : T.navBg,
        // Red glow on scroll border
        borderBottom:   scrolled
          ? `1px solid ${HW.redGlow}`
          : `1px solid ${T.border}`,
        backdropFilter: 'blur(20px) saturate(180%)',
        boxShadow:      scrolled
          ? `0 1px 0 0 ${HW.redGlow}, 0 4px 24px rgba(0,0,0,.12)`
          : 'none',
        transition:     'all .3s ease',
      }}>

        {/* ── LEFT: Logo + Brand ── */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', flexShrink: 0 }}>

          {/* Logo disc with blue glow */}
          <div style={{
            width:        34,
            height:       34,
            borderRadius: '50%',
            overflow:     'hidden',
            border:       `1.5px solid rgba(0,147,213,.5)`,
            boxShadow:    scrolled ? `0 0 10px ${HW.blueGlow}` : 'none',
            transition:   'box-shadow .3s',
            flexShrink:   0,
          }}>
            <img src={logoImg} alt="SpiriCom"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          </div>

          {/* Brand wordmark */}
          <div>
            <div style={{
              fontFamily:  "'Barlow Condensed', sans-serif",
              fontWeight:  900,
              fontSize:    18,
              letterSpacing: '-.3px',
              lineHeight:  1,
              color:       T.text,
            }}>
              {/* FIX-B1: SpiriCom (no trailing p) */}
              Spiri<span style={{ color: HW.blue }}>Com</span>
            </div>
            <div style={{
              fontSize:   7,
              letterSpacing: 2.5,
              marginTop:  2,
              fontWeight: 700,
              textTransform: 'uppercase',
              background: `linear-gradient(90deg, ${HW.blue}, ${HW.blueLight})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              {t('brand.by')} · NOC
            </div>
          </div>
        </Link>

        {/* ── CENTER: Navigation ── */}
        {/* FIX-U6: tighter gap, overflow-hide class on last 2 items */}
        <div className="nav-center" style={{
          flex:           1,
          display:        'flex',
          justifyContent: 'center',
          alignItems:     'center',
          gap:            18,
          overflow:       'hidden',
          minWidth:       0,
        }}>
          {NAV.map(({ label, path }, idx) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/dashboard'}
              // FIX-U6: last 2 nav items hide at 1100px
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}${idx >= NAV.length - 2 ? ' nav-overflow-hide' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        {/* ── RIGHT: Shift + User + Logout ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

          {/* Shift widget — engineers only. FIX-B8: null guard on T */}
          {!isAdmin && T && (
            <ShiftWidget user={user} T={T}/>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 22, background: T.border, flexShrink: 0 }}/>

          {/* Avatar + name block */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

            {/* Avatar disc */}
            <div style={{
              width:        30,
              height:       30,
              borderRadius: '50%',
              // FIX-U2: correct Dark Blue gradient
              background:   `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              fontWeight:   800,
              fontSize:     11,
              color:        '#fff',
              flexShrink:   0,
              border:       avatarRing,   // FIX-U2: role-aware ring color
              boxShadow:    isAdmin
                ? `0 0 8px ${HW.redGlow}`
                : `0 0 8px ${HW.blueGlow}`,
            }}>
              {initials}
            </div>

            {/* Name + role */}
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: 'nowrap' }}>
                {user?.full_name || user?.username || 'NOC Engineer'}
              </div>
              <div style={{
                fontSize:      9,
                color:         isAdmin ? HW.red : T.textDim,
                marginTop:     3,
                letterSpacing: '.6px',
                textTransform: 'uppercase',
                fontWeight:    600,
              }}>
                {user?.role || 'engineer'}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 22, background: T.border, flexShrink: 0 }}/>

          {/* Logout */}
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={10}/> {t('nav.logout')}
          </button>
        </div>
      </nav>

      {/* ══ PAGE CONTENT ════════════════════════════════════════════════ */}
      <main style={{ paddingTop: 60, transition: 'background .25s' }}>
        <Outlet/>
      </main>

      {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
      <footer style={{
        background:  T.footerBg,
        borderTop:   `1px solid ${T.border}`,
        padding:     '40px 48px 28px',
        marginTop:   80,
        transition:  'background .25s',
      }}>
        <div style={{
          maxWidth:  1600,
          margin:    '0 auto',
          display:   'grid',
          gridTemplateColumns: '1fr auto auto',
          gap:       40,
          alignItems: 'start',
          flexWrap:  'wrap',
        }}>

          {/* Brand column */}
          <div>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center',
              gap: 10, textDecoration: 'none', marginBottom: 14 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden',
                border: `1.5px solid rgba(0,147,213,.4)`, flexShrink: 0 }}>
                <img src={logoImg} alt="SpiriCom"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              </div>
              {/* FIX-B1 */}
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800, fontSize: 16, color: T.text }}>
                Spiri<span style={{ color: HW.blue }}>Com</span>
              </span>
            </Link>

            <p style={{ fontSize: 11, color: T.textDim, margin: 0, lineHeight: 1.7,
              maxWidth: 300 }}>
              Telecom Complaint Analytics &amp; Network Intelligence Platform
              developed at Huawei Technologies Tunisia · PFE 2026
            </p>

            {/* Live API status pill */}
            <div style={{
              display:     'inline-flex',
              alignItems:  'center',
              gap:         7,
              marginTop:   16,
              padding:     '5px 12px',
              border:      '1px solid rgba(0,200,120,.2)',
              borderRadius: 20,
              background:  'rgba(0,200,120,.05)',
            }}>
              <span style={{
                width:      5,
                height:     5,
                borderRadius: '50%',
                background: '#22C55E',
                display:    'inline-block',
                animation:  'hw-pulse 2s ease-in-out infinite',
              }}/>
              <span style={{ fontSize: 9, color: 'rgba(34,197,94,.75)',
                letterSpacing: 2, fontWeight: 700 }}>
                NOC PLATFORM · LIVE
              </span>
            </div>
          </div>

          {/* Platform links */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5,
              textTransform: 'uppercase', color: T.textDim, marginBottom: 14 }}>
              Platform
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Overview',    path: '/dashboard'            },
                { label: 'Map',         path: '/dashboard/map'        },
                { label: 'Anomalies',   path: '/dashboard/anomalies'  },
                { label: 'Forecast',    path: '/dashboard/forecast'   },
                { label: 'Root Cause',  path: '/dashboard/root-cause' },
                { label: 'NLP',         path: '/dashboard/nlp'        },
              ].map(({ label, path }) => (
                <Link key={label} to={path} className="footer-link">{label}</Link>
              ))}
            </div>
          </div>

          {/* Resources — FIX-U5: removed localhost links */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5,
              textTransform: 'uppercase', color: T.textDim, marginBottom: 14 }}>
              Resources
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a href="/api/docs" className="footer-link">API Docs</a>
              <Link to="/dashboard/about" className="footer-link">Architecture</Link>
              <Link to="/dashboard/about" className="footer-link">PFE Report</Link>
              <a href="https://github.com/Ouerghi23" target="_blank" rel="noreferrer"
                className="footer-link">GitHub</a>
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div style={{
          maxWidth:      1600,
          margin:        '28px auto 0',
          paddingTop:    20,
          borderTop:     `1px solid ${T.border}`,
          display:       'flex',
          justifyContent: 'space-between',
          alignItems:    'center',
          flexWrap:      'wrap',
          gap:           12,
        }}>
          <p style={{ fontSize: 10, color: T.textDim, margin: 0, letterSpacing: .5 }}>
            © 2026 SpiriCom — Huawei Technologies Tunisia · Ouerghi Chaima
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Radio size={10} color={HW.blue} style={{ opacity: .7 }}/>
            <span style={{ fontSize: 10, color: T.textDim, letterSpacing: .5 }}>
              NOC Intelligence · Huawei
            </span>
          </div>
        </div>
      </footer>

      {/* ── Floating overlays ── */}
      <MessagingWidget/>
      <AIChatBubble/>
      <FloatingControls/>
    </div>
  )
}