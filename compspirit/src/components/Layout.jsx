// src/components/Layout.jsx
// ──────────────────────────────────────────────────────────────────────────────
// Fix: navbar right section was one undivided flex row — language toggle,
// user info, and logout button were visually merged.
//
// Now split into three clearly separated zones with 1px dividers:
//   [ EN/中文 ]  |  [ Avatar  Name / Role ]  |  [ Logout ]
//
// Also fixed: translation keys now match en.json / zh.json (flat nav.* keys).
// TranslateWidget removed from <main> — it was floating over dashboard content.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect }                    from 'react'
import { NavLink, Link, Outlet, useNavigate }     from 'react-router-dom'
import { useTranslation }                         from 'react-i18next'
import { LogOut }                                 from 'lucide-react'
import { useAuth }                                from '../hooks/useAuth.jsx'
import LanguageToggle                             from './LanguageToggle'
import logoImg                                    from '../assets/images/logo_1.png'

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  primary:   '#CF0A2C',
  bg:        '#0C0D12',
  dark:      '#0A0B0E',
  darker:    '#060607',
  border:    'rgba(255,255,255,.08)',
  text:      '#E6E8F0',
  textMuted: 'rgba(230,232,240,.55)',
  textDim:   'rgba(230,232,240,.28)',
}

// ── Thin vertical divider between navbar zones ────────────────────────────────
const NavDivider = () => (
  <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }}/>
)

// ════════════════════════════════════════════════════════════════════════════
export default function Layout() {
  const [scrolled, setScrolled] = useState(false)
  const { user, logout }        = useAuth()
  const { t }                   = useTranslation()
  const navigate                = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Nav items — keys match flat nav.* in en.json / zh.json
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

  // Initials for avatar — max 2 chars
  const initials = (user?.full_name || user?.username || 'SC')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div style={{
      fontFamily: "'Inter', 'Barlow', system-ui, sans-serif",
      background: C.dark,
      color:      C.text,
      minHeight:  '100vh',
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        ::-webkit-scrollbar       { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${C.dark}; }
        ::-webkit-scrollbar-thumb { background: ${C.primary}; border-radius: 3px; }

        /* Nav link base */
        .nav-link {
          color:          ${C.textMuted};
          font-size:      11px;
          font-weight:    600;
          letter-spacing: .5px;
          text-transform: uppercase;
          padding:        8px 0;
          position:       relative;
          transition:     color .2s ease;
          text-decoration:none;
          white-space:    nowrap;
        }
        /* Underline slide-in on hover / active */
        .nav-link::after {
          content:          '';
          position:         absolute;
          bottom:           0;
          left:             0;
          width:            100%;
          height:           2px;
          background:       ${C.primary};
          transform:        scaleX(0);
          transform-origin: left;
          transition:       transform .25s cubic-bezier(.4,0,.2,1);
        }
        .nav-link:hover,
        .nav-link.active        { color: #fff; }
        .nav-link:hover::after,
        .nav-link.active::after { transform: scaleX(1); }

        /* Logout button */
        .logout-btn {
          display:        flex;
          align-items:    center;
          gap:            5px;
          background:     transparent;
          color:          ${C.textMuted};
          border:         1px solid rgba(255,255,255,.1);
          padding:        6px 12px;
          font-size:      11px;
          font-weight:    600;
          letter-spacing: .5px;
          text-transform: uppercase;
          border-radius:  6px;
          cursor:         pointer;
          font-family:    inherit;
          transition:     all .2s;
          white-space:    nowrap;
        }
        .logout-btn:hover {
          background:    rgba(248,81,73,.10);
          border-color:  rgba(248,81,73,.30);
          color:         #F85149;
        }
      `}</style>

      {/* ════════════════════════════════════════════════════════════════════
          NAVBAR
      ════════════════════════════════════════════════════════════════════ */}
      <nav style={{
        position:       'fixed',
        top:            0,
        left:           0,
        right:          0,
        zIndex:         1000,
        height:         68,
        padding:        '0 32px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        background:     'rgba(10,11,14,.97)',
        borderBottom:   `1px solid ${scrolled ? C.primary + '33' : C.border}`,
        backdropFilter: 'blur(20px) saturate(180%)',
        transition:     'border-color .3s',
        gap:            16,
      }}>

        {/* ── LEFT: Logo ── */}
        <Link to="/" style={{
          display:        'flex',
          alignItems:     'center',
          gap:            10,
          textDecoration: 'none',
          flexShrink:     0,
        }}>
          <div style={{
            width:        38,
            height:       38,
            borderRadius: '50%',
            overflow:     'hidden',
            border:       '1.5px solid rgba(207,10,44,.5)',
          }}>
            <img src={logoImg} alt="SpiriComp" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          </div>
          <div>
            <div style={{
              fontFamily:    "'Barlow Condensed', sans-serif",
              fontWeight:    900,
              fontSize:      20,
              letterSpacing: '-.5px',
              lineHeight:    1,
              color:         '#fff',
            }}>
              Spiri<span style={{ color: C.primary }}>Comp</span>
            </div>
            <div style={{
              fontSize:      8,
              letterSpacing: 3,
              color:         C.textDim,
              marginTop:     1,
              fontWeight:    700,
              textTransform: 'uppercase',
            }}>
              {t('brand.by')} · NOC
            </div>
          </div>
        </Link>

        {/* ── CENTER: Nav links ── */}
        <div style={{
          display:   'flex',
          gap:       24,
          position:  'absolute',
          left:      '44%',
          transform: 'translateX(-50%)',
        }}>
          {NAV.map(({ label, path }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/dashboard'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </div>

        {/* ── RIGHT: Three distinct zones separated by dividers ── */}
        {/*
          Zone 1: Language toggle  (LanguageToggle component)
          Zone 2: User identity    (avatar + name + role)
          Zone 3: Logout action    (button)
        */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        12,
          flexShrink: 0,
        }}>

          {/* ── Zone 1: Language toggle ── */}
          <LanguageToggle />

          <NavDivider />

          {/* ── Zone 2: User identity ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Avatar circle — initials */}
            <div style={{
              width:          32,
              height:         32,
              borderRadius:   '50%',
              background:     'linear-gradient(135deg, #CF0A2C, #9F0822)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontWeight:     700,
              fontSize:       12,
              color:          '#fff',
              flexShrink:     0,
              letterSpacing:  '.5px',
            }}>
              {initials}
            </div>

            {/* Name + role — stacked */}
            <div style={{ lineHeight: 1 }}>
              <div style={{
                fontSize:   13,
                fontWeight: 600,
                color:      C.text,
                whiteSpace: 'nowrap',
              }}>
                {user?.full_name || user?.username || 'NOC Engineer'}
              </div>
              <div style={{
                fontSize:      10,
                color:         C.textDim,
                marginTop:     3,
                letterSpacing: '.5px',
                textTransform: 'uppercase',
              }}>
                {user?.role || 'engineer'} · SpiriComp
              </div>
            </div>
          </div>

          <NavDivider />

          {/* ── Zone 3: Logout ── */}
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={11}/>
            {t('nav.logout')}
          </button>

        </div>
      </nav>

      {/* ── Content area ── */}
      <main style={{ paddingTop: 68 }}>
        <Outlet />
        {/*
          TranslateWidget removed from here — it was floating over dashboard content.
          If you need a Google Translate fallback, add it as a footer link instead.
        */}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        background:  C.darker,
        borderTop:   `1px solid ${C.border}`,
        padding:     '40px 48px 28px',
        marginTop:   80,
      }}>
        <div style={{
          maxWidth:       1600,
          margin:         '0 auto',
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          flexWrap:       'wrap',
          gap:            20,
        }}>
          {/* Footer logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width:        30,
              height:       30,
              borderRadius: '50%',
              overflow:     'hidden',
              border:       '1.5px solid rgba(207,10,44,.4)',
            }}>
              <img src={logoImg} alt="SpiriComp" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize:   18,
              color:      '#fff',
            }}>
              Spiri<span style={{ color: C.primary }}>Comp</span>
            </div>
          </div>

          <p style={{ fontSize: 12, color: C.textDim, margin: 0 }}>
            © 2026 SpiriComp — Huawei Technologies Tunisia · PFE 2026
          </p>

          <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
            {[
              { label: 'API Docs', href: 'http://localhost:8000/docs' },
              { label: 'GitHub',   href: 'https://github.com/Ouerghi23' },
            ].map(({ label, href }) => (
              <a
                key={label} href={href} target="_blank" rel="noreferrer"
                style={{ color: C.textDim, textDecoration: 'none', transition: 'color .2s' }}
                onMouseOver={e => { e.currentTarget.style.color = '#fff' }}
                onMouseOut={e  => { e.currentTarget.style.color = C.textDim }}
              >
                {label}
              </a>
            ))}
            <Link
              to="/dashboard/about"
              style={{ color: C.textDim, textDecoration: 'none', transition: 'color .2s' }}
              onMouseOver={e => { e.currentTarget.style.color = '#fff' }}
              onMouseOut={e  => { e.currentTarget.style.color = C.textDim }}
            >
              About
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}