// src/pages/admin/AdminLayout.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom Admin Console — "Grand UI" shell (v2)
//
// The admin area intentionally keeps its own chrome identity (rounded
// corners, gradients, glow) distinct from the sharp NOC pages — that
// stays. What changed:
//
//  AL-1  BRAND REGRESSION: "SpiriComp" → "SpiriCom" (logo text, alt,
//        sidebar divider). Same regression previously fixed in
//        AIChatBubble.
//  AL-2  Tokens imported from components/UI (HW, ALARM, FONT) instead
//        of scattered hex. Status greens (#00E5A0) → ALARM.normal so
//        "live/healthy" means the same color platform-wide; logout
//        destructive red → ALARM.critical.
//  AL-3  <NocBaseStyles/> mounted — the shared MessagingWidget /
//        AIChatBubble / FloatingControls depend on noc-pulse/noc-spin
//        and hover classes; without this they silently no-op inside
//        the admin shell.
//  AL-4  Google Fonts @import removed from the component <style>
//        (it re-parsed on every theme change and blocks rendering).
//        ADD THIS ONCE to index.html <head> instead:
//        <link rel="preconnect" href="https://fonts.googleapis.com">
//        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
//        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Barlow+Condensed:wght@700;800;900&display=swap" rel="stylesheet">
//  AL-5  Dead code removed: NavLink style fn set a '--accent' CSS var
//        nothing consumed. LiveClock uses useTheme() (no T prop).
//  AL-6  OVERLAP BUG: <FloatingControls/> (theme + EN/ZH FABs) floated
//        bottom-left ABOVE the fixed sidebar, covering the Sign Out
//        button. Floating FABs and a fixed sidebar will always fight
//        for that corner, so the admin shell no longer mounts
//        FloatingControls at all — the theme toggle and language
//        toggle now live in the top bar next to the Bell, using the
//        same hw-topbar-btn chrome. The NOC pages keep their floating
//        controls (no sidebar there). The theme-toggle call is
//        resolved defensively (toggleTheme / toggle / setMode) so it
//        works whatever the ThemeContext exposes.
//  AL-7  REAL BUG: <NotificationBell role={currentUser?.role ...}/> —
//        `currentUser` was never declared (useAuth() returns `user`).
//        An undeclared identifier throws ReferenceError even behind
//        `?.`, which crashed the whole sidebar render. Fixed to `user`.
//  AL-8  Unused `Bell` import removed — NotificationBell owns its own
//        icon and aria-label now.
//  AL-9  i18n integration — all hardcoded strings replaced with
//        translation keys from admin namespace.
// ─────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom'
import MessagingWidget  from '../../components/MessagingWidget'
import { useTranslation } from 'react-i18next'
import { useAuth }  from '../../hooks/useAuth.jsx'
import { useTheme } from '../../context/ThemeContext'
import { HW, ALARM, FONT, NocBaseStyles } from '../../components/UI'
import {
  Users, Settings, Activity, FileText,
  LogOut, Shield, ChevronRight,
  Sun, Moon, Languages,
} from 'lucide-react'
import logoImg from '../../assets/images/logo_1.png'
import NotificationBell from '../../components/NotificationBell'

// Navigation items with translation keys
const ADMIN_NAV = [
  { key: 'users',   path: '/admin/users',  Icon: Users,    accent: HW.blue       },
  { key: 'ai',      path: '/admin/ai',     Icon: Settings, accent: HW.blueLight  },
  { key: 'system',  path: '/admin/system', Icon: Activity, accent: ALARM.normal  },
  { key: 'logs',    path: '/admin/logs',   Icon: FileText, accent: '#F59E0B'     },
]

// Live clock — AL-5: theme via hook
function LiveClock() {
  const { theme: T } = useTheme()
  const { t } = useTranslation()
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ textAlign: 'center', padding: '10px 8px' }}>
      <div style={{ fontFamily: FONT.display,
        fontSize: 26, fontWeight: 900, color: HW.blue,
        letterSpacing: 2, lineHeight: 1 }}>
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ fontSize: 9, color: T.textDim, letterSpacing: '1.5px',
        textTransform: 'uppercase', marginTop: 4 }}>
        {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const themeCtx         = useTheme()
  const { theme: T }     = themeCtx
  const { t, i18n }      = useTranslation()
  const navigate         = useNavigate()
  const location         = useLocation()

  // AL-6: defensive toggle — works with toggleTheme(), toggle(), or setMode()
  const toggleTheme = () => {
    if (typeof themeCtx.toggleTheme === 'function') themeCtx.toggleTheme()
    else if (typeof themeCtx.toggle === 'function') themeCtx.toggle()
    else if (typeof themeCtx.setMode === 'function')
      themeCtx.setMode(T.mode === 'dark' ? 'light' : 'dark')
  }
  
  const isZh = (i18n.language || 'en').startsWith('zh')
  const toggleLang = () => i18n.changeLanguage(isZh ? 'en' : 'zh')

  const handleLogout = () => { 
    if (window.confirm(t('admin.user.logoutConfirm'))) {
      logout(); 
      navigate('/login')
    }
  }

  const initials = (user?.full_name || user?.username || 'AD')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const activeNav = ADMIN_NAV.find(n => location.pathname.startsWith(n.path))

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: T.bg, color: T.text,
      fontFamily: FONT.body,
      transition: 'background .25s, color .25s',
    }}>
      {/* AL-3: shared widgets depend on these global classes/keyframes */}
      <NocBaseStyles/>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar       { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,147,213,.3); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${HW.blue}; }

        @keyframes hw-glow  { 0%,100%{box-shadow:0 0 6px ${ALARM.normal}}
          50%{box-shadow:0 0 14px ${ALARM.normal}} }
        @keyframes hw-slide { from{transform:translateX(-8px);opacity:0}
          to{transform:translateX(0);opacity:1} }

        .admin-nav-link {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 14px 11px 16px; border-radius: 10px;
          color: ${T.textMuted}; text-decoration: none;
          font-size: 13px; font-weight: 500; letter-spacing: .1px;
          transition: all .2s cubic-bezier(.4,0,.2,1);
          position: relative; overflow: hidden;
        }
        .admin-nav-link::before {
          content: '';
          position: absolute; inset: 0; opacity: 0;
          background: linear-gradient(90deg, rgba(0,147,213,.12), transparent);
          transition: opacity .2s;
        }
        .admin-nav-link:hover { color: ${T.text}; }
        .admin-nav-link:hover::before { opacity: 1; }
        .admin-nav-link .nav-arrow {
          margin-left: auto; opacity: 0; transform: translateX(-4px);
          transition: all .2s;
        }
        .admin-nav-link:hover .nav-arrow { opacity: .5; transform: translateX(0); }

        .admin-nav-link.active {
          background: ${T.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(0,147,213,.18), rgba(0,195,255,.08))'
            : 'linear-gradient(135deg, rgba(0,147,213,.12), rgba(0,195,255,.05))'};
          color: ${HW.blue}; font-weight: 600;
        }
        .admin-nav-link.active::before { opacity: 0; }
        .admin-nav-link.active .nav-arrow { opacity: 1; transform: translateX(0);
          color: ${HW.blue}; }
        .admin-nav-link.active::after {
          content: '';
          position: absolute; left: 0; top: 18%; bottom: 18%;
          width: 3px; border-radius: 0 2px 2px 0;
          background: linear-gradient(180deg, ${HW.blue}, ${HW.blueLight});
          box-shadow: 0 0 8px ${HW.blue};
        }
        .admin-logout-btn {
          display: flex; align-items: center; gap: 9px;
          width: 100%; padding: 10px 14px; border-radius: 10px;
          background: transparent; border: none; cursor: pointer;
          color: ${T.textMuted}; font-size: 13px; font-weight: 500;
          font-family: inherit; transition: all .2s; text-align: left;
          letter-spacing: .1px;
        }
        .admin-logout-btn:hover {
          background: rgba(220,38,38,.1); color: ${ALARM.critical};
        }
        .hw-topbar-btn {
          display: flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: 8px;
          background: ${T.mode === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)'};
          border: 1px solid ${T.border};
          color: ${T.textMuted}; cursor: pointer; transition: all .2s;
        }
        .hw-topbar-btn:hover {
          background: rgba(0,147,213,.12); border-color: rgba(0,147,213,.3);
          color: ${HW.blue};
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════
          SIDEBAR
      ═══════════════════════════════════════════════════════ */}
      <aside style={{
        width: 256, flexShrink: 0,
        background: T.mode === 'dark'
          ? 'linear-gradient(180deg, rgba(0,15,35,.98) 0%, rgba(0,25,50,.96) 100%)'
          : 'linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(248,252,255,.96) 100%)',
        borderRight: T.mode === 'dark'
          ? '1px solid rgba(0,147,213,.15)'
          : '1px solid rgba(0,147,213,.12)',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 100, padding: '0 12px',
        backdropFilter: 'blur(24px) saturate(180%)',
        transition: 'background .25s',
        overflow: 'hidden',
      }}>

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${HW.blue}, ${HW.blueLight}, transparent)` }}/>

        {/* ── Logo — AL-1: SpiriCom ── */}
        <div style={{ padding: '22px 8px 16px', flexShrink: 0,
          borderBottom: `1px solid ${T.mode === 'dark' ? 'rgba(0,147,213,.15)' : T.border}` }}>
          <Link to="/admin" style={{ display: 'flex', alignItems: 'center',
            gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden',
              border: '2px solid rgba(0,147,213,.5)', flexShrink: 0,
              boxShadow: '0 0 12px rgba(0,147,213,.3)' }}>
              <img src={logoImg} alt={t('admin.brand.name')}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            </div>
            <div>
              <div style={{ fontFamily: FONT.display,
                fontWeight: 900, fontSize: 20, letterSpacing: '-.5px',
                color: T.text, lineHeight: 1 }}>
                Spiri<span style={{ color: HW.blue }}>Com</span>
              </div>
              <div style={{ fontSize: 9, letterSpacing: '2.5px', marginTop: 3,
                fontWeight: 700, textTransform: 'uppercase',
                background: `linear-gradient(90deg, ${HW.blue}, ${HW.blueLight})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {t('admin.brand.console')}
              </div>
            </div>
          </Link>
        </div>

        {/* ── Live Clock ── */}
        <div style={{ flexShrink: 0,
          borderBottom: `1px solid ${T.mode === 'dark' ? 'rgba(0,147,213,.1)' : T.border}` }}>
          <LiveClock/>
        </div>

        {/* ── Admin badge ── */}
        <div style={{ padding: '10px 8px 6px', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'linear-gradient(135deg, rgba(0,147,213,.12), rgba(0,195,255,.06))',
            border: '1px solid rgba(0,147,213,.2)', borderRadius: 8,
            padding: '7px 12px',
          }}>
            <Shield size={12} color={HW.blue}/>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px',
              textTransform: 'uppercase', color: HW.blue }}>
              {t('admin.nav.administrator')}
            </span>
            <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%',
              background: ALARM.normal, animation: 'hw-glow 2s infinite' }}/>
          </div>
        </div>

        {/* ── Nav items ── */}
        <nav style={{
          flex: 1, padding: '6px 0',
          display: 'flex', flexDirection: 'column', gap: 3,
          overflowY: 'auto', overflowX: 'hidden',
        }}>
          <div style={{ padding: '6px 8px 4px' }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: T.textDim,
              letterSpacing: '2px', textTransform: 'uppercase' }}>
              {t('admin.nav.navigation')}
            </span>
          </div>
          {ADMIN_NAV.map(({ key, path, Icon, accent }) => (
            <NavLink key={path} to={path}
              className={({ isActive }) =>
                `admin-nav-link${isActive ? ' active' : ''}`}>
              <div style={{ width: 30, height: 30, borderRadius: 8,
                background: `linear-gradient(135deg, ${accent}22, ${accent}11)`,
                border: `1px solid ${accent}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0 }}>
                <Icon size={14} color={accent}/>
              </div>
              {t(`admin.nav.${key}`)}
              <ChevronRight size={12} className="nav-arrow"/>
            </NavLink>
          ))}
        </nav>

        {/* ── Section divider — AL-1 ── */}
        <div style={{ padding: '6px 8px', flexShrink: 0,
          borderTop: `1px solid ${T.mode === 'dark' ? 'rgba(0,147,213,.1)' : T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7,
            padding: '6px 8px' }}>
            <div style={{ flex: 1, height: 1,
              background: 'linear-gradient(90deg, rgba(0,147,213,.4), transparent)' }}/>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2px',
              textTransform: 'uppercase', color: HW.blue, opacity: .7 }}>
              {t('admin.sidebar.huawei')}
            </span>
            <div style={{ flex: 1, height: 1,
              background: 'linear-gradient(270deg, rgba(0,147,213,.4), transparent)' }}/>
          </div>
        </div>

        {/* ── User info + Logout ── */}
        <div style={{
          padding: '10px 8px 18px', flexShrink: 0,
          borderTop: `1px solid ${T.mode === 'dark' ? 'rgba(0,147,213,.1)' : T.border}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
            background: T.mode === 'dark'
              ? 'rgba(0,147,213,.06)' : 'rgba(0,147,213,.04)',
            border: `1px solid ${T.mode === 'dark' ? 'rgba(0,147,213,.12)' : T.border}`,
            borderRadius: 10, marginBottom: 8,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 12, color: '#fff',
              border: '2px solid rgba(0,147,213,.4)',
            }}>
              {initials}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text,
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' }}>
                {user?.full_name || user?.username}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2,
                background: `linear-gradient(90deg, ${HW.blue}, ${HW.blueLight})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent' }}>
                {t('admin.user.admin')}
              </div>
            </div>
          </div>
          {/* Logout — AL-2: destructive = ALARM.critical */}
          <button className="admin-logout-btn" onClick={handleLogout}>
            <div style={{ width: 28, height: 28, borderRadius: 8,
              background: 'rgba(220,38,38,.1)',
              border: '1px solid rgba(220,38,38,.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LogOut size={13} color={ALARM.critical}/>
            </div>
            {t('admin.user.logout')}
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════
          MAIN AREA
      ═══════════════════════════════════════════════════════ */}
      <div style={{ marginLeft: 256, flex: 1, display: 'flex',
        flexDirection: 'column', minHeight: '100vh' }}>

        {/* ── Top bar ── */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          height: 56, padding: '0 28px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: T.mode === 'dark'
            ? 'rgba(0,10,25,.92)' : 'rgba(255,255,255,.92)',
          borderBottom: `1px solid ${T.mode === 'dark'
            ? 'rgba(0,147,213,.12)' : T.border}`,
          backdropFilter: 'blur(20px)',
          transition: 'background .25s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: T.textDim, fontWeight: 500 }}>
              {t('admin.header.console')}
            </span>
            <ChevronRight size={12} color={T.textDim}/>
            <span style={{ fontSize: 13, color: T.text, fontWeight: 600,
              animation: 'hw-slide .25s ease' }}>
              {activeNav ? t(`admin.nav.${activeNav.key}`) : t('admin.nav.dashboard')}
            </span>
          </div>

          <div style={{ flex: 1 }}/>

          {/* Status pill — AL-2: live = ALARM.normal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(22,163,74,.08)',
            border: '1px solid rgba(22,163,74,.25)',
            borderRadius: 20, padding: '4px 12px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%',
              background: ALARM.normal,
              animation: 'noc-pulse 2s infinite' }}/>
            <span style={{ fontSize: 10, fontWeight: 700, color: ALARM.normal,
              letterSpacing: '1px', textTransform: 'uppercase' }}>
              {t('admin.header.systemLive')}
            </span>
          </div>

          {/* AL-6: theme + language moved here from FloatingControls */}
          <button className="hw-topbar-btn" onClick={toggleTheme}
            aria-label={T.mode === 'dark' 
              ? t('admin.header.switchTheme', { mode: t('admin.header.themeLight') })
              : t('admin.header.switchTheme', { mode: t('admin.header.themeDark') })}
            title={T.mode === 'dark' ? t('admin.header.themeLight') : t('admin.header.themeDark')}>
            {T.mode === 'dark' ? <Sun size={15}/> : <Moon size={15}/>}
          </button>
          <button className="hw-topbar-btn" onClick={toggleLang}
            aria-label={isZh 
              ? t('admin.header.switchLang', { lang: t('admin.header.langEn') })
              : t('admin.header.switchLang', { lang: t('admin.header.langZh') })}
            title={isZh ? t('admin.header.langEn') : t('admin.header.langZh')}
            style={{ width: 'auto', padding: '0 10px', gap: 5 }}>
            <Languages size={14}/>
            <span style={{ fontSize: 10, fontWeight: 800,
              letterSpacing: '.5px' }}>{isZh ? 'ZH' : 'EN'}</span>
          </button>

          {/* AL-7: fixed — was `currentUser` (undeclared, ReferenceError) */}
          <NotificationBell role={user?.role === 'admin' ? 'admin' : 'engineer'}/>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 12px 5px 6px',
            background: T.mode === 'dark'
              ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)',
            border: `1px solid ${T.border}`, borderRadius: 20 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%',
              background: `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 800, color: '#fff' }}>
              {initials}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
              {user?.username}
            </span>
          </div>
        </header>

        {/* ── Page content ── */}
        <main style={{ flex: 1, background: T.bg, transition: 'background .25s' }}>
          <Outlet/>
        </main>
      </div>

      <MessagingWidget />
    </div>
  )
}