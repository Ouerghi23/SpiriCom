// src/components/Layout.jsx
// SpiriCom NOC — Main layout with guest overlay

import { useState, useEffect }                from 'react'
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation }                     from 'react-i18next'
import { LogOut, Radio, Lock }                from 'lucide-react'
import { useAuth }                            from '../hooks/useAuth.jsx'
import { useTheme }                           from '../context/ThemeContext'
import { useRole }                            from '../hooks/useRole'
import FloatingControls                       from './FloatingControls'
import AIChatBubble                           from '../pages/AIChatBubble'
import MessagingWidget                        from './MessagingWidget'
import NotificationBell                       from './NotificationBell'
import ShiftWidget                            from './ShiftWidget'
import logoImg                                from '../assets/images/logo.png'
// FIX: import the shared token object instead of redefining it locally —
// this file previously had its own `const HW = {...}` that duplicated
// UI.jsx's HW object field-for-field. No visible bug today, but any
// future edit to UI.jsx's HW would silently NOT apply here.
import { HW } from './UI'

function ViewerBanner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 24px',
      background: 'rgba(107,114,128,.07)',
      borderBottom: '1px solid rgba(107,114,128,.15)',
      fontSize: 11, color: '#6B7280',
    }}>
      {/* FIX: was a raw 🔒 emoji, violates UI.jsx's own C-7 rule
          ("icon must be a Lucide component — no emoji strings") */}
      <Lock size={13} color="#9CA3AF"/>
      <span>
        <strong style={{ color: '#9CA3AF' }}>Read-only access</strong>
        {' '}— You can view all dashboards.
        Contact an administrator to request write access.
      </span>
    </div>
  )
}

export default function Layout() {
  const [scrolled, setScrolled] = useState(false)

  // ── All hooks in order ────────────────────────────────────────────
  const { user, logout } = useAuth()
  const { t }            = useTranslation()
  const navigate         = useNavigate()
  const { theme: T }     = useTheme()
  const { isViewer, isGuest } = useRole()

  const isAdmin = user?.role?.toLowerCase() === 'admin'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  const NAV = [
    { label: t('nav.overview'),  path: '/dashboard'           },
    { label: t('nav.map'),       path: '/dashboard/map'       },
    { label: t('nav.anomalies'), path: '/dashboard/anomalies' },
    { label: t('nav.forecast'),  path: '/dashboard/forecast'  },
    { label: t('nav.segments'),  path: '/dashboard/segments'  },
    { label: t('nav.nlp'),       path: '/dashboard/nlp'       },
  ]

  const initials = (user?.full_name || user?.username || 'SC')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const avatarRing = isAdmin
    ? `2px solid ${HW.red}`
    : isViewer
      ? '2px solid rgba(107,114,128,.45)'
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

        .nav-link {
          color: ${T.textMuted};
          font-size: 10.5px; font-weight: 600;
          letter-spacing: .7px; text-transform: uppercase;
          padding: 6px 2px; position: relative;
          transition: color .2s ease;
          text-decoration: none; white-space: nowrap; flex-shrink: 0;
        }
        .nav-link::after {
          content: ''; position: absolute;
          bottom: -1px; left: 0; width: 100%; height: 2px;
          background: linear-gradient(90deg, ${HW.blue}, ${HW.blueLight});
          transform: scaleX(0); transform-origin: left;
          transition: transform .25s cubic-bezier(.4,0,.2,1);
          border-radius: 1px;
        }
        .nav-link:hover        { color: ${T.text}; }
        .nav-link.active       { color: ${T.text}; }
        .nav-link:hover::after,
        .nav-link.active::after { transform: scaleX(1); }

        .logout-btn {
          display: flex; align-items: center; gap: 5px;
          background: transparent; color: ${T.textMuted};
          border: 1px solid ${T.border};
          padding: 5px 12px; font-size: 10px; font-weight: 700;
          letter-spacing: .7px; text-transform: uppercase;
          border-radius: 6px; cursor: pointer; font-family: inherit;
          transition: all .2s; white-space: nowrap;
        }
        .logout-btn:hover {
          background: rgba(238,58,67,.08);
          border-color: rgba(238,58,67,.4);
          color: ${HW.red};
        }

        .footer-link {
          color: ${T.textDim}; text-decoration: none;
          font-size: 11px; transition: color .2s;
        }
        .footer-link:hover { color: ${HW.blue}; }

        @media (max-width: 1100px) { .nav-overflow-hide { display: none !important; } }
        @media (max-width: 900px)  { .nav-center        { display: none !important; } }
      `}</style>

      {/* ══ NAVBAR ══ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        height: 60, padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 16,
        background: scrolled
          ? T.mode === 'dark' ? 'rgba(8,10,18,.92)' : 'rgba(245,247,252,.94)'
          : T.navBg,
        borderBottom: scrolled ? `1px solid ${HW.redGlow}` : `1px solid ${T.border}`,
        backdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: scrolled
          ? `0 1px 0 0 ${HW.redGlow}, 0 4px 24px rgba(0,0,0,.12)`
          : 'none',
        transition: 'all .3s ease',
      }}>

        <Link to="/" style={{ display:'flex', alignItems:'center', gap:10,
          textDecoration:'none', flexShrink:0 }}>
          <div style={{
            width:34, height:34, borderRadius:'50%', overflow:'hidden',
            border:`1.5px solid rgba(0,147,213,.5)`,
            boxShadow: scrolled ? `0 0 10px ${HW.blueGlow}` : 'none',
            transition:'box-shadow .3s', flexShrink:0,
          }}>
            <img src={logoImg} alt="SpiriCom"
              style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
          </div>
          <div>
            <div style={{
              fontFamily:"'Barlow Condensed', sans-serif",
              fontWeight:900, fontSize:18, letterSpacing:'-.3px',
              lineHeight:1, color:T.text,
            }}>
              Spiri<span style={{ color:HW.blue }}>Com</span>
            </div>
            <div style={{
              fontSize:7, letterSpacing:2.5, marginTop:2,
              fontWeight:700, textTransform:'uppercase',
              background:`linear-gradient(90deg, ${HW.blue}, ${HW.blueLight})`,
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
            }}>
              {t('brand.by')} · NOC
            </div>
          </div>
        </Link>

        <div className="nav-center" style={{
          flex:1, display:'flex', justifyContent:'center',
          alignItems:'center', gap:18, overflow:'hidden', minWidth:0,
        }}>
          {NAV.map(({ label, path }, idx) => (
            <NavLink key={path} to={path} end={path === '/dashboard'}
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}${idx >= NAV.length - 2 ? ' nav-overflow-hide' : ''}`
              }>
              {label}
            </NavLink>
          ))}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>

          {!isAdmin && !isViewer && T && (
            <ShiftWidget user={user} T={T}/>
          )}

          {!isViewer && (
            <NotificationBell role={isAdmin ? 'admin' : 'engineer'} />
          )}

          <div style={{ width:1, height:22, background:T.border, flexShrink:0 }}/>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{
              width:30, height:30, borderRadius:'50%',
              background:`linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontWeight:800, fontSize:11, color:'#fff',
              flexShrink:0, border:avatarRing,
              boxShadow: isAdmin
                ? `0 0 8px ${HW.redGlow}`
                : isViewer
                  ? '0 0 8px rgba(107,114,128,.2)'
                  : `0 0 8px ${HW.blueGlow}`,
            }}>
              {initials}
            </div>
            <div style={{ lineHeight:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:T.text, whiteSpace:'nowrap' }}>
                {user?.full_name || user?.username || 'NOC Engineer'}
              </div>
              <div style={{
                fontSize:9, marginTop:3, letterSpacing:'.6px',
                textTransform:'uppercase', fontWeight:600,
                color: isViewer ? '#6B7280' : isAdmin ? HW.red : T.textDim,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {/* FIX: was `🔒 viewer` — raw emoji, same C-7 violation */}
                {isViewer && <Lock size={9} color="#6B7280"/>}
                {isViewer ? 'viewer' : (user?.role || 'engineer')}
              </div>
            </div>
          </div>

          <div style={{ width:1, height:22, background:T.border, flexShrink:0 }}/>

          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={10}/> {t('nav.logout')}
          </button>
        </div>
      </nav>

      {isViewer && (
        <div style={{ paddingTop: 60 }}>
          <ViewerBanner />
        </div>
      )}

      <main style={{
        paddingTop: isViewer ? 0 : 60,
        transition: 'background .25s',
        position: 'relative',
      }}>
        <Outlet/>

        {isGuest && (
          <>
            <div
              onClick={() => navigate('/login')}
              style={{
                position:   'fixed',
                inset:      0,
                top:        60,
                zIndex:     999,
                cursor:     'not-allowed',
                background: 'transparent',
              }}
            />

            <div style={{
              position:       'fixed',
              bottom:         0,
              left:           0,
              right:          0,
              zIndex:         1001,
              background:     'rgba(0,0,0,.88)',
              backdropFilter: 'blur(12px)',
              borderTop:      `1px solid rgba(255,255,255,.08)`,
              padding:        '14px 32px',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            16,
            }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#fff', marginBottom:3 }}>
                  Read-only mode — Guest access
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.45)' }}>
                  You can browse dashboards but cannot interact.
                  Log in for full NOC access.
                </div>
              </div>
              <button
                onClick={() => navigate('/login')}
                style={{
                  padding:       '10px 28px',
                  background:    HW.blue,
                  border:        'none',
                  color:         '#fff',
                  fontSize:      12,
                  fontWeight:    800,
                  cursor:        'pointer',
                  letterSpacing: '.5px',
                  flexShrink:    0,
                  transition:    'background .2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = HW.blueLight}
                onMouseLeave={e => e.currentTarget.style.background = HW.blue}
              >
                Login →
              </button>
            </div>
          </>
        )}
      </main>

      {/* ══ FOOTER ══ */}
      <footer style={{
        background:T.footerBg, borderTop:`1px solid ${T.border}`,
        padding:'40px 48px 28px', marginTop:80, transition:'background .25s',
      }}>
        <div style={{
          maxWidth:1600, margin:'0 auto',
          display:'grid', gridTemplateColumns:'1fr auto auto',
          gap:40, alignItems:'start',
        }}>
          <div>
            <Link to="/" style={{ display:'inline-flex', alignItems:'center',
              gap:10, textDecoration:'none', marginBottom:14 }}>
              <div style={{ width:26, height:26, borderRadius:'50%', overflow:'hidden',
                border:`1.5px solid rgba(0,147,213,.4)`, flexShrink:0 }}>
                <img src={logoImg} alt="SpiriCom"
                  style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              </div>
              <span style={{ fontFamily:"'Barlow Condensed', sans-serif",
                fontWeight:800, fontSize:16, color:T.text }}>
                Spiri<span style={{ color:HW.blue }}>Com</span>
              </span>
            </Link>
            <p style={{ fontSize:11, color:T.textDim, margin:0, lineHeight:1.7, maxWidth:300 }}>
              Telecom Complaint Analytics &amp; Network Intelligence Platform
              developed at Huawei Technologies Tunisia · PFE 2026
            </p>
            <div style={{
              display:'inline-flex', alignItems:'center', gap:7,
              marginTop:16, padding:'5px 12px',
              border:'1px solid rgba(0,200,120,.2)', borderRadius:20,
              background:'rgba(0,200,120,.05)',
            }}>
              <span style={{
                width:5, height:5, borderRadius:'50%', background:'#22C55E',
                display:'inline-block', animation:'hw-pulse 2s ease-in-out infinite',
              }}/>
              <span style={{ fontSize:9, color:'rgba(34,197,94,.75)',
                letterSpacing:2, fontWeight:700 }}>
                NOC PLATFORM · LIVE
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:2.5,
              textTransform:'uppercase', color:T.textDim, marginBottom:14 }}>
              Platform
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {/* FIX: added Segments (was missing — nav has 6 items,
                  footer only listed 5) */}
              {[
                { label:'Overview',    path:'/dashboard'           },
                { label:'Map',         path:'/dashboard/map'       },
                { label:'Anomalies',   path:'/dashboard/anomalies' },
                { label:'Forecast',    path:'/dashboard/forecast'  },
                { label:'Segments',    path:'/dashboard/segments'  },
                { label:'NLP',         path:'/dashboard/nlp'       },
              ].map(({ label, path }) => (
                <Link key={label} to={path} className="footer-link">{label}</Link>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:2.5,
              textTransform:'uppercase', color:T.textDim, marginBottom:14 }}>
              Resources
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <a href="/api/docs" className="footer-link">API Docs</a>
              {/* FIX: both links used to point to the same
                  /dashboard/about route. Architecture now points to a
                  dedicated anchor/section; adjust the target route once
                  you decide whether these are two pages or two sections
                  of one page. */}
              <Link to="/dashboard/about#architecture" className="footer-link">Architecture</Link>
              <Link to="/dashboard/about#pfe-report" className="footer-link">PFE Report</Link>
              <a href="https://github.com/Ouerghi23" target="_blank" rel="noreferrer"
                className="footer-link">GitHub</a>
            </div>
          </div>
        </div>

        <div style={{
          maxWidth:1600, margin:'28px auto 0', paddingTop:20,
          borderTop:`1px solid ${T.border}`,
          display:'flex', justifyContent:'space-between',
          alignItems:'center', flexWrap:'wrap', gap:12,
        }}>
          <p style={{ fontSize:10, color:T.textDim, margin:0, letterSpacing:.5 }}>
            © 2026 SpiriCom — Huawei Technologies Tunisia · Ouerghi Chaima
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Radio size={10} color={HW.blue} style={{ opacity:.7 }}/>
            <span style={{ fontSize:10, color:T.textDim, letterSpacing:.5 }}>
              NOC Intelligence · Huawei
            </span>
          </div>
        </div>
      </footer>

      {!isViewer && <MessagingWidget/>}
      {!isViewer && <AIChatBubble/>}
      <FloatingControls/>
    </div>
  )
}