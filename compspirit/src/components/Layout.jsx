// src/components/Layout.jsx
// FIX: import path corrected from '../routes/routes' → '../routes'
//      (NAV_LINKS lives at src/routes.js, not src/routes/routes.js)
// ADD: /dashboard/about link included in NAV_LINKS via routes.js

import { useState, useEffect }   from 'react'
import { NavLink, Link, Outlet } from 'react-router-dom'
import { NAV_LINKS }             from '../routes'    // ← FIX: was '../routes/routes'
import logoImg                   from '../assets/images/logo_1.png'

const C = {
  primary:      '#CF0A2C',
  primaryHover: '#E8102F',
  dark:         '#0A0A0A',
  darker:       '#050505',
  border:       'rgba(255,255,255,.08)',
  card:         '#111111',
  text:         '#F8FAFC',
  textMuted:    'rgba(248,250,252,.75)',
  textDim:      'rgba(248,250,252,.45)',
}

export default function Layout() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{
      fontFamily: "'Inter','Barlow',system-ui,sans-serif",
      background: C.dark,
      color: C.text,
      minHeight: '100vh',
    }}>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${C.dark}}
        ::-webkit-scrollbar-thumb{background:${C.primary};border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:${C.primaryHover}}

        .nav-link{
          color:${C.textMuted};font-size:12px;font-weight:600;
          letter-spacing:.5px;text-transform:uppercase;
          padding:8px 0;position:relative;
          transition:color .2s ease;text-decoration:none;white-space:nowrap;
        }
        .nav-link::after{
          content:'';position:absolute;bottom:0;left:0;width:100%;height:2px;
          background:${C.primary};transform:scaleX(0);
          transform-origin:left;transition:transform .3s cubic-bezier(.4,0,.2,1);
        }
        .nav-link:hover,.nav-link.active{color:#fff}
        .nav-link:hover::after,.nav-link.active::after{transform:scaleX(1)}
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, height: 72,
        padding: '0 48px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        background: scrolled ? 'rgba(10,10,10,.98)' : 'rgba(10,10,10,.95)',
        borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(16px) saturate(180%)',
        transition: 'all .4s cubic-bezier(.4,0,.2,1)',
      }}>

        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', flexShrink: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(207,10,44,.6)' }}>
            <img src={logoImg} alt="SpiriComp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: '-.8px', lineHeight: 1 }}>
              Spiri<span style={{ color: C.primary }}>Comp</span>
            </div>
            <div style={{ fontSize: 9.5, letterSpacing: 3, color: C.textDim, marginTop: 1 }}>HUAWEI · NOC PLATFORM</div>
          </div>
        </Link>

        {/* Desktop nav */}
        <div style={{ display: 'flex', gap: 32, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          {NAV_LINKS.map(({ label, path }) => (
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

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <Link to="/" style={{
            background: C.primary, color: '#fff', padding: '9px 20px',
            fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            borderRadius: 6, textDecoration: 'none', transition: 'all .2s',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
            onMouseOver={e => e.currentTarget.style.background = C.primaryHover}
            onMouseOut={e  => e.currentTarget.style.background = C.primary}>
            ← Landing
          </Link>

          {/* NOC engineer badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 16, borderLeft: `1px solid ${C.border}` }}>
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>NOC Engineer</div>
              <div style={{ fontSize: 11, color: C.textDim }}>SpiriComp · 2026</div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#CF0A2C,#9F0822)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>
              SC
            </div>
          </div>
        </div>
      </nav>

      {/* ── Content ── */}
      <main style={{ paddingTop: 72 }}>
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer style={{ background: C.darker, borderTop: `1px solid ${C.border}`, padding: '48px 48px 32px', marginTop: 80 }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid rgba(207,10,44,.5)' }}>
              <img src={logoImg} alt="SpiriComp" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 19 }}>
              Spiri<span style={{ color: C.primary }}>Comp</span>
            </div>
          </div>
          <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>
            © 2026 SpiriComp — Huawei Technologies Tunisia · PFE 2026
          </p>
          <div style={{ display: 'flex', gap: 24, fontSize: 13, color: C.textDim }}>
            {[
              { label: 'API Docs', href: 'http://localhost:8000/docs' },
              { label: 'GitHub',   href: 'https://github.com/Ouerghi23' },
              { label: 'About',    href: null, path: '/dashboard/about' },
            ].map(({ label, href, path }) => (
              href
                ? <a key={label} href={href} target="_blank" rel="noreferrer" style={{ color: C.textDim, textDecoration: 'none', transition: 'color .2s', cursor: 'pointer' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = C.textDim}>{label}</a>
                : <Link key={label} to={path} style={{ color: C.textDim, textDecoration: 'none', transition: 'color .2s' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = C.textDim}>{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}