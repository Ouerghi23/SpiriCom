// src/pages/LoginPage.jsx
// ─────────────────────────────────────────────────────────────────────
// Full-page login experience:
//
//  ┌─ HEADER (64px) ─────────────────────────────────────────────────┐
//  │ Logo + LanguageToggle + Back                                     │
//  ├─ MAIN BODY (100vh - 64px - 48px) ───────────────────────────────┤
//  │  LEFT 44%: Brand zone (floats on bg, no box)                     │
//  │  RIGHT 56%: Large login form zone                                │
//  ├─ FOOTER (48px) ──────────────────────────────────────────────────┤
//  │ Copyright + Live badge                                           │
//  └──────────────────────────────────────────────────────────────────┘
//
//  One background (#080808 + 72px grid) covers the entire page.
//  Visual language: identical to LandingPage (red brand, no border-radius,
//  Barlow Condensed headings, .btn-primary, .btn-ghost, .section-label)
// ─────────────────────────────────────────────────────────────────────

import { useState }          from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth }           from '../hooks/useAuth.jsx'
import { useTranslation }    from 'react-i18next'
import LanguageToggle        from '../components/LanguageToggle'
import logoImg               from '../assets/images/logo_1.png'
import axios                 from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Palette (LandingPage values) ──────────────────────────────────────
const RED    = '#CF0A2C'
const REDL   = '#FF4060'
const BG     = '#080808'
const CARD   = '#0D0D0D'
const BORDER = 'rgba(255,255,255,.055)'
const TEXT   = '#F8FAFC'
const MUTED  = 'rgba(248,250,252,.55)'
const DIM    = 'rgba(248,250,252,.28)'

// ── Demo accounts ──────────────────────────────────────────────────────
const DEMO = [
  { username:'admin',        password:'spiricomp2026', role:'Admin',    flag:'🛡️' },
  { username:'noc_engineer', password:'noc123',        role:'Engineer', flag:'📡' },
  { username:'huawei_cn',    password:'huawei2026',    role:'华为工程师', flag:'🇨🇳' },
]

// ── Features list for left panel ──────────────────────────────────────
const FEATURES = [
  { tag:'GIS',       title:'Spatio-Temporal Hotspots'  },
  { tag:'ML',        title:'Anomaly Detection'          },
  { tag:'AI',        title:'Predictive Forecasting'     },
  { tag:'Analytics', title:'Root Cause Analysis'        },
  { tag:'UX',        title:'Customer Segmentation'      },
  { tag:'NLP',       title:'Multilingual Classification'},
]

// ── Icons — Feather/Lucide open-source paths (no external deps) ───────
const Ico = d => ({ size=14, color='currentColor', sw=2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const IcoUser     = Ico(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>)
const IcoUserPlus = Ico(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></>)
const IcoLock     = Ico(<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>)
const IcoBadge    = Ico(<><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 12h4M14 16h4"/></>)
const IcoEyeOn    = Ico(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>)
const IcoEyeOff   = Ico(<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>)
const IcoArrow    = Ico(<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>)
const IcoWarn     = Ico(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>)
const IcoCheck    = Ico(<polyline points="20 6 9 17 4 12"/>)
const IcoShield   = Ico(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>)
const IcoSignal   = Ico(<path d="M2 20h.01M7 20v-4M12 20v-8M17 20V4M22 20v-4"/>)
const IcoGuest    = Ico(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>)
const IcoCheckSm  = Ico(<polyline points="20 6 9 17 4 12"/>)

// Huawei 6-petal flower (official symbol)
const HuaweiFlower = ({ size=16 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    {[0,60,120,180,240,300].map((a,i) => (
      <ellipse key={i} cx="50" cy="21" rx="9.5" ry="26"
        fill={i<3 ? RED : REDL} opacity={.7+(i%2)*.15}
        transform={`rotate(${a} 50 50)`}/>
    ))}
  </svg>
)

// ── EyeBtn — defined at module level (avoids "already declared" error) ─
function EyeBtn({ show, set }) {
  return (
    <button type="button" onClick={() => set(v => !v)} style={{
      background:'none', border:'none', color:DIM, cursor:'pointer',
      padding:4, display:'flex', transition:'color .15s',
    }}
      onMouseEnter={e => e.currentTarget.style.color = MUTED}
      onMouseLeave={e => e.currentTarget.style.color = DIM}>
      {show ? <IcoEyeOff size={14}/> : <IcoEyeOn size={14}/>}
    </button>
  )
}

// ── Input with left icon + optional right slot ────────────────────────
function NocInput({ left:L, right, value, onChange, type='text',
  placeholder, autoComplete, autoFocus, required, extraBorder }) {
  const [focus, setFocus] = useState(false)
  return (
    <div style={{ position:'relative' }}>
      {L && (
        <div style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)',
          color: focus ? `${RED}CC` : DIM, pointerEvents:'none', display:'flex',
          transition:'color .2s' }}>
          <L size={14}/>
        </div>
      )}
      <input type={type} value={value} onChange={onChange}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        placeholder={placeholder} autoComplete={autoComplete}
        autoFocus={autoFocus} required={required}
        style={{
          width:        '100%',
          padding:      L ? '14px 14px 14px 44px' : '14px 14px',
          paddingRight: right ? '46px' : '14px',
          background:   focus ? '#060609' : '#04050A',
          border:       `1.5px solid ${extraBorder || (focus ? `rgba(207,10,44,.65)` : 'rgba(255,255,255,.07)')}`,
          boxShadow:    focus
            ? `0 0 0 3px rgba(207,10,44,.09), 0 2px 12px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.02)`
            : `0 2px 8px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.015)`,
          color:        TEXT, fontSize:13.5, outline:'none',
          fontFamily:   'inherit', borderRadius:0,
          transition:   'border-color .2s, box-shadow .2s, background .2s',
          letterSpacing: '.01em',
        }}/>
      {right && (
        <div style={{ position:'absolute', right:0, top:0, bottom:0,
          display:'flex', alignItems:'center', paddingRight:12 }}>
          {right}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { login, loading:signInLoad, error:signInErr } = useAuth()
  const navigate = useNavigate()
  const { t }    = useTranslation()

  const [tab,      setTab]      = useState('signin')
  const [siUser,   setSiUser]   = useState('')
  const [siPass,   setSiPass]   = useState('')
  const [siShowPw, setSiShowPw] = useState(false)
  const [remember, setRemember] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [suUser,   setSuUser]   = useState('')
  const [suName,   setSuName]   = useState('')
  const [suPass,   setSuPass]   = useState('')
  const [suConf,   setSuConf]   = useState('')
  const [suShowPw, setSuShowPw] = useState(false)
  const [suShowCf, setSuShowCf] = useState(false)
  const [suErr,    setSuErr]    = useState(null)
  const [suLoad,   setSuLoad]   = useState(false)
  const [suOk,     setSuOk]     = useState(false)

  const handleSignIn = async e => {
    e.preventDefault()
    const ok = await login(siUser.trim(), siPass)
    if (ok) navigate('/dashboard')
  }

  const validate = () => {
    if (!suUser.trim()||!suName.trim()||!suPass||!suConf) return t('signup.errorRequired')
    if (!/^[a-zA-Z0-9_]{3,}$/.test(suUser.trim()))       return t('signup.errorUsername')
    if (suPass.length < 8)                                 return t('signup.errorPasswordShort')
    if (suPass !== suConf)                                 return t('signup.errorPasswordMatch')
    return null
  }
  const handleSignUp = async e => {
    e.preventDefault()
    const err = validate(); if (err) { setSuErr(err); return }
    setSuLoad(true); setSuErr(null)
    try {
      const res = await axios.post(`${API}/api/auth/register`,
        { username:suUser.trim(), full_name:suName.trim(), password:suPass })
      const { access_token, ...info } = res.data
      sessionStorage.setItem('spiricomp_token', access_token)
      sessionStorage.setItem('spiricomp_user', JSON.stringify(info))
      setSuOk(true)
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (err) {
      setSuErr(err.response?.data?.detail || t('login.error'))
    } finally { setSuLoad(false) }
  }

  const str = (() => {
    let s=0
    if(suPass.length>=8) s++; if(/[A-Z]/.test(suPass)) s++
    if(/[0-9]/.test(suPass)) s++; if(/[^a-zA-Z0-9]/.test(suPass)) s++
    return s
  })()
  const strMeta = [null,
    {l:'Weak',c:'#F85149'},{l:'Fair',c:'#D29922'},
    {l:'Good',c:'#3FB950'},{l:'Strong',c:'#22C55E'}
  ][str]

  const Spinner = () => (
    <div style={{ width:14,height:14,border:'2.5px solid rgba(255,255,255,.2)',
      borderTopColor:'rgba(255,255,255,.9)',borderRadius:'50%',animation:'lp-spin .65s linear infinite' }}/>
  )

  const FieldLabel = ({ children }) => (
    <label style={{ display:'block', fontSize:9.5, fontWeight:700,
      color:'rgba(248,250,252,.38)', letterSpacing:2.4, textTransform:'uppercase', marginBottom:8 }}>
      {children}
    </label>
  )

  const AlertBar = ({ msg, ok }) => !msg ? null : (
    <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:14,
      background: ok?'rgba(34,197,94,.06)':'rgba(207,10,44,.06)',
      border:`1px solid ${ok?'rgba(34,197,94,.22)':'rgba(207,10,44,.22)'}`,
      borderLeft:`3px solid ${ok?'#22C55E':RED}`,
      padding:'10px 14px', fontSize:12,
      color: ok?'#4ADE80':REDL,
      boxShadow: ok?'0 2px 12px rgba(34,197,94,.05)':'0 2px 12px rgba(207,10,44,.05)',
    }}>
      {ok ? <IcoCheck size={13} color="#4ADE80"/> : <IcoWarn size={13} color={REDL}/>}
      {msg}
    </div>
  )

  return (
    <div style={{
      minHeight:       '100vh',
      background:      '#050507',
      backgroundImage: [
        'radial-gradient(ellipse 80% 60% at 18% 28%, rgba(207,10,44,.06) 0%, transparent 60%)',
        'radial-gradient(ellipse 55% 45% at 88% 78%, rgba(207,10,44,.04) 0%, transparent 55%)',
        'radial-gradient(ellipse 50% 35% at 50% 0%, rgba(255,255,255,.018) 0%, transparent 50%)',
        'linear-gradient(rgba(255,255,255,.016) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(255,255,255,.016) 1px, transparent 1px)',
      ].join(','),
      backgroundSize: 'auto, auto, auto, 72px 72px, 72px 72px',
      display:         'flex',
      flexDirection:   'column',
      fontFamily:      "'Inter','Barlow',system-ui,sans-serif",
      color:           TEXT,
      position:        'relative',
      overflow:        'hidden',
    }}>
      <style>{`
        @keyframes lp-spin    { to { transform:rotate(360deg) } }
        @keyframes pulse-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.7)} }
        @keyframes slide-in   { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer    { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes slide-r    { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        @keyframes scan-line  { 0%{top:-2px} 100%{top:100vh} }

        .lp-scanline {
          position:fixed; left:0; right:0; height:140px; pointer-events:none; z-index:0;
          background:linear-gradient(180deg, transparent 0%, rgba(207,10,44,.04) 50%, transparent 100%);
          animation:scan-line 10s linear infinite;
        }

        .btn-primary {
          background:linear-gradient(135deg, #D90B2E 0%, #CF0A2C 55%, #B50826 100%);
          color:white; border:none;
          border-top:1px solid rgba(255,255,255,.13);
          padding:14px 32px; font-size:11.5px; font-weight:800;
          letter-spacing:1.8px; text-transform:uppercase; cursor:pointer;
          transition:all .22s cubic-bezier(.4,0,.2,1); font-family:inherit;
          display:inline-flex; align-items:center; gap:9px;
          position:relative; overflow:hidden;
          box-shadow:0 4px 20px rgba(207,10,44,.28), 0 1px 0 rgba(255,255,255,.08) inset;
        }
        .btn-primary::before {
          content:''; position:absolute; inset:0;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.13),transparent);
          background-size:200% 100%; opacity:0; transition:opacity .25s;
        }
        .btn-primary:hover:not(:disabled) {
          background:linear-gradient(135deg, #E8102F 0%, #D90B2E 55%, #C00926 100%);
          transform:translateY(-1.5px);
          box-shadow:0 10px 34px rgba(207,10,44,.48), 0 4px 16px rgba(207,10,44,.22), 0 1px 0 rgba(255,255,255,.1) inset;
        }
        .btn-primary:hover::before { opacity:1; animation:shimmer .75s linear; }
        .btn-primary:active:not(:disabled) { transform:translateY(0); box-shadow:0 4px 16px rgba(207,10,44,.32); }
        .btn-primary:disabled {
          background:rgba(207,10,44,.18); cursor:not-allowed; transform:none;
          box-shadow:none; border-top-color:transparent; opacity:.55;
        }

        .btn-ghost {
          background:transparent; color:rgba(255,255,255,.52);
          border:1px solid rgba(255,255,255,.12);
          padding:10px 22px; font-size:10.5px; font-weight:600;
          letter-spacing:1.6px; text-transform:uppercase; cursor:pointer;
          transition:all .2s; font-family:inherit;
          display:inline-flex; align-items:center; gap:8px; text-decoration:none;
          box-shadow:0 2px 8px rgba(0,0,0,.22);
        }
        .btn-ghost:hover {
          border-color:rgba(255,255,255,.3); color:#fff;
          background:rgba(255,255,255,.05);
          box-shadow:0 4px 16px rgba(0,0,0,.32);
        }

        .section-label {
          font-size:10px; font-weight:800; color:#CF0A2C;
          letter-spacing:4.5px; text-transform:uppercase;
          display:flex; align-items:center; gap:12px; margin-bottom:20px;
        }
        .section-label::before {
          content:''; width:22px; height:1px; background:#CF0A2C;
          box-shadow:0 0 8px rgba(207,10,44,.55);
        }

        .tag {
          font-size:8px; font-weight:800; letter-spacing:2px;
          padding:2px 8px; border:1px solid rgba(207,10,44,.28);
          color:rgba(207,10,44,.9); text-transform:uppercase;
          background:rgba(207,10,44,.07);
        }

        .lp-tab {
          flex:1; padding:13px 10px; background:transparent; border:none;
          border-bottom:2px solid transparent;
          color:rgba(255,255,255,.28); font-size:10px; font-weight:800;
          letter-spacing:2px; text-transform:uppercase; cursor:pointer;
          transition:all .2s; font-family:inherit;
          display:flex; align-items:center; justify-content:center; gap:8px;
        }
        .lp-tab.active {
          color:#fff; border-bottom-color:#CF0A2C;
          background:linear-gradient(180deg, rgba(207,10,44,.07) 0%, transparent 100%);
        }
        .lp-tab:hover:not(.active) { color:rgba(255,255,255,.58); background:rgba(255,255,255,.02); }

        .demo-card {
          width:100%; display:flex; align-items:center; gap:12px;
          padding:11px 14px; background:rgba(4,5,9,.95);
          border:1px solid rgba(255,255,255,.06); cursor:pointer; transition:all .25s;
          font-family:inherit; text-align:left; position:relative; overflow:hidden;
          box-shadow:0 2px 8px rgba(0,0,0,.32);
        }
        .demo-card::before {
          content:''; position:absolute; top:0; left:0; right:0; height:1.5px;
          background:linear-gradient(90deg,transparent,#CF0A2C,transparent);
          transform:scaleX(0); transform-origin:center; transition:transform .35s ease;
        }
        .demo-card:hover {
          border-color:rgba(207,10,44,.24); background:rgba(207,10,44,.03);
          box-shadow:0 4px 20px rgba(0,0,0,.42), 0 0 0 1px rgba(207,10,44,.08);
          transform:translateX(2px);
        }
        .demo-card:hover::before { transform:scaleX(1); }

        .btn-sso {
          flex:1; padding:11px 12px; background:rgba(255,255,255,.015);
          border:1px solid rgba(255,255,255,.08); color:${MUTED}; font-size:11px; font-weight:600;
          cursor:pointer; transition:all .2s; font-family:inherit;
          display:flex; align-items:center; justify-content:center; gap:8px;
          box-shadow:0 2px 8px rgba(0,0,0,.25);
        }
        .btn-sso:hover {
          border-color:rgba(207,10,44,.32); color:#fff;
          background:rgba(207,10,44,.05);
          box-shadow:0 4px 16px rgba(207,10,44,.08);
        }

        .feature-row {
          display:flex; align-items:center; gap:12px;
          padding:8px 0; border-bottom:1px solid rgba(255,255,255,.035);
          transition:all .2s;
        }
        .feature-row:last-child { border-bottom:none; }
        .feature-row:hover { padding-left:4px; }

        .lp-check { width:14px; height:14px; accent-color:#CF0A2C; cursor:pointer; flex-shrink:0; }

        input:-webkit-autofill {
          -webkit-box-shadow:0 0 0 100px #04050A inset !important;
          -webkit-text-fill-color:${TEXT} !important;
        }

        @media(max-width:900px) {
          .lp-left { display:none !important; }
          .lp-divider { display:none !important; }
          .lp-right { padding:24px 20px !important; }
        }
      `}</style>

      {/* ── Atmospheric depth scan ──────────────────────────────────── */}
      <div className="lp-scanline"/>

      {/* ── Corner vignettes ────────────────────────────────────────── */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0,
        background:'radial-gradient(ellipse 100% 100% at 0% 0%, rgba(0,0,0,.38) 0%, transparent 48%)' }}/>
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0,
        background:'radial-gradient(ellipse 100% 100% at 100% 100%, rgba(0,0,0,.32) 0%, transparent 48%)' }}/>

      {/* ══════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════ */}
      <header style={{
        position:   'sticky', top:0, zIndex:100,
        height:     64,
        padding:    '0 48px',
        display:    'flex', alignItems:'center', justifyContent:'space-between',
        background: 'rgba(5,5,7,.98)',
        borderBottom:`1px solid rgba(255,255,255,.06)`,
        backdropFilter:'blur(24px) saturate(1.4)',
        flexShrink: 0,
        boxShadow:'0 1px 0 rgba(207,10,44,.07), 0 4px 28px rgba(0,0,0,.5)',
      }}>
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:11, textDecoration:'none' }}>
          <div style={{ width:36, height:36, borderRadius:'50%', overflow:'hidden',
            border:`1.5px solid rgba(207,10,44,.55)`,
            boxShadow:'0 0 14px rgba(207,10,44,.22), 0 0 0 3px rgba(207,10,44,.06)',
            flexShrink:0 }}>
            <img src={logoImg} alt="SpiriComp" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
          </div>
          <div style={{ lineHeight:1 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:'-.5px', color:'#fff' }}>
              Spiri<span style={{ color:RED }}>Comp</span>
            </div>
            <div style={{ fontSize:8, color:DIM, letterSpacing:4, marginTop:2, fontWeight:700 }}>
              {t('brand.by')}
            </div>
          </div>
        </Link>

        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <LanguageToggle/>
          <Link to="/" className="btn-ghost" style={{ padding:'8px 18px', fontSize:10 }}>
            {t('login.back')}
          </Link>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════
          MAIN BODY
      ══════════════════════════════════════════════════════════════ */}
      <main style={{
        flex:     1,
        display:  'flex',
        position: 'relative',
        zIndex:   1,
        minHeight:0,
      }}>

        {/* ── LEFT — Brand zone (no box, floats on background) ──────── */}
        <div className="lp-left" style={{
          flex:           '0 0 44%',
          padding:        '52px 56px 40px 56px',
          display:        'flex',
          flexDirection:  'column',
          justifyContent: 'space-between',
          overflowY:      'auto',
        }}>
          <div>
            {/* Live badge */}
            <div style={{ display:'inline-flex', alignItems:'center', gap:7,
              background:'rgba(207,10,44,.08)', border:'1px solid rgba(207,10,44,.24)',
              padding:'5px 13px', marginBottom:28,
              boxShadow:'0 2px 14px rgba(207,10,44,.09)' }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:RED,
                display:'inline-block', animation:'pulse-dot 2s ease-in-out infinite',
                boxShadow:`0 0 6px ${RED}` }}/>
              <span style={{ fontSize:9, fontWeight:800, letterSpacing:'2.5px',
                textTransform:'uppercase', color:REDL }}>
                {t('landing.liveBadge')}
              </span>
            </div>

            {/* Section label */}
            <div className="section-label">{t('login.secureAccess')}</div>

            {/* Hero title */}
            <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif",
              fontSize:'clamp(32px,3.8vw,58px)', fontWeight:900,
              letterSpacing:'-2px', lineHeight:.96, marginBottom:20 }}>
              NOC{' '}
              <span style={{ color:RED, fontStyle:'italic', textShadow:`0 0 40px rgba(207,10,44,.3)` }}>INTELLIGENCE</span>
              <br/>
              <span style={{ color:DIM, fontWeight:300, fontStyle:'italic' }}>
                Dashboard
              </span>
            </h1>

            <p style={{ fontSize:13, lineHeight:1.9, color:'rgba(248,250,252,.38)',
              fontWeight:300, maxWidth:380, marginBottom:36 }}>
              {t('landing.heroDesc')}
            </p>

            {/* Stats grid — stat-block from LandingPage */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)',
              gap:1, background:'rgba(255,255,255,.04)', marginBottom:32,
              boxShadow:'0 4px 24px rgba(0,0,0,.32)' }}>
              {[
          
              ].map(s => (
                <div key={s.label} style={{
                  textAlign:'center', padding:'22px 16px',
                  border:`1px solid rgba(255,255,255,.05)`, background:'#0A0A0A',
                  position:'relative', overflow:'hidden',
                }}>
                  <div style={{ position:'absolute', top:0, left:'15%', right:'15%',
                    height:1, background:`linear-gradient(90deg,transparent,${RED},transparent)`,
                    boxShadow:`0 0 8px rgba(207,10,44,.5)` }}/>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif",
                    fontSize:'clamp(30px,3vw,46px)', fontWeight:900,
                    color:RED, lineHeight:1, letterSpacing:'-1.5px',
                    textShadow:`0 0 30px rgba(207,10,44,.35)` }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize:9, color:DIM, marginTop:7,
                    letterSpacing:2, textTransform:'uppercase', fontWeight:600 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Feature list */}
            <div>
              <div style={{ fontSize:9, fontWeight:800, color:DIM,
                letterSpacing:3, textTransform:'uppercase', marginBottom:12 }}>
                Platform Capabilities
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 24px' }}>
                {FEATURES.map(f => (
                  <div key={f.tag} className="feature-row">
                    <IcoCheckSm size={11} color={RED}/>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:12, color:'rgba(248,250,252,.75)', fontWeight:500 }}>
                        {f.title}
                      </span>
                    </div>
                    <span className="tag">{f.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Huawei partnership */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:32,
            padding:'10px 16px', border:`1px solid rgba(207,10,44,.14)`,
            background:'rgba(207,10,44,.03)',
            boxShadow:'0 2px 16px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.02)' }}>
            <HuaweiFlower size={18}/>
            <div>
              <div style={{ fontSize:10, color:MUTED, fontWeight:600 }}>
                Huawei Technologies Tunisia
              </div>
              <div style={{ fontSize:8, color:DIM, letterSpacing:2,
                textTransform:'uppercase', marginTop:1 }}>
                PFE Engineering · 2026
              </div>
            </div>
          </div>
        </div>

        {/* ── Vertical divider ──────────────────────────────────────── */}
        <div className="lp-divider" style={{
          width:1,
          background:'linear-gradient(180deg, transparent 0%, rgba(255,255,255,.07) 12%, rgba(255,255,255,.05) 88%, transparent 100%)',
          flexShrink:0, alignSelf:'stretch',
        }}/>

        {/* ── RIGHT — Login form zone ───────────────────────────────── */}
        <div className="lp-right" style={{
          flex:           1,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '40px 56px',
          overflowY:      'auto',
        }}>
          <div style={{
            width:   '100%',
            maxWidth:500,
            animation:'slide-in .45s cubic-bezier(.22,.68,0,1.2) both',
          }}>

            {/* Form card */}
            <div style={{
              background:  'linear-gradient(180deg, #0F0F12 0%, #0B0B0F 100%)',
              border:      `1px solid rgba(255,255,255,.07)`,
              boxShadow: [
                '0 0 0 1px rgba(207,10,44,.07)',
                '0 28px 72px rgba(0,0,0,.7)',
                '0 8px 28px rgba(0,0,0,.45)',
                'inset 0 1px 0 rgba(255,255,255,.045)',
                'inset 0 -1px 0 rgba(0,0,0,.35)',
              ].join(', '),
              position:    'relative',
              overflow:    'hidden',
            }}>
              {/* Red gradient top stripe */}
              <div style={{
                height:3,
                background:`linear-gradient(90deg, ${RED} 0%, rgba(207,10,44,.55) 45%, rgba(207,10,44,.12) 80%, transparent 100%)`,
                boxShadow:`0 0 22px rgba(207,10,44,.45), 0 2px 10px rgba(207,10,44,.22)`,
              }}/>

              {/* Card header */}
              <div style={{
                padding:'22px 28px 18px',
                borderBottom:`1px solid rgba(255,255,255,.05)`,
                background:'linear-gradient(180deg, rgba(255,255,255,.018) 0%, transparent 100%)',
              }}>
                <div style={{ fontSize:9.5, fontWeight:800, color:RED,
                  letterSpacing:'4px', textTransform:'uppercase',
                  display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:20, height:1, background:RED, boxShadow:`0 0 6px rgba(207,10,44,.6)` }}/>
                  {t('login.secureAccess')}
                </div>
                <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif",
                  fontSize:28, fontWeight:900, letterSpacing:'-1px', lineHeight:1,
                  color:TEXT, marginBottom:5 }}>
                  {tab==='signin' ? t('login.title').toUpperCase() : t('signup.title').toUpperCase()}
                  {' — '}
                  <span style={{ color:DIM, fontWeight:300, fontStyle:'italic' }}>
                    SpiriComp
                  </span>
                </h2>
                <p style={{ fontSize:11, color:'rgba(248,250,252,.3)', lineHeight:1.6 }}>
                  {tab==='signin' ? t('login.subtitle') : t('signup.subtitle')}
                </p>
              </div>

              {/* Tabs */}
              <div style={{ display:'flex', borderBottom:`1px solid rgba(255,255,255,.05)`, background:'rgba(0,0,0,.22)' }}>
                <button className={`lp-tab${tab==='signin'?' active':''}`} onClick={() => setTab('signin')}>
                  <IcoUser size={12} color={tab==='signin' ? RED : DIM}/>
                  {t('login.tab')}
                </button>
                <button className={`lp-tab${tab==='signup'?' active':''}`} onClick={() => setTab('signup')}>
                  <IcoUserPlus size={12} color={tab==='signup' ? RED : DIM}/>
                  {t('signup.tab')}
                </button>
              </div>

              {/* Form body */}
              <div style={{ padding:'26px 28px 24px' }}>

                {/* ── SIGN IN ── */}
                {tab === 'signin' && (
                  <div style={{ animation:'slide-r .2s ease both' }}>
                    <form onSubmit={handleSignIn}>
                      <div style={{ marginBottom:18 }}>
                        <FieldLabel>{t('login.username')}</FieldLabel>
                        <NocInput left={IcoUser} value={siUser}
                          onChange={e => setSiUser(e.target.value)}
                          autoComplete="username" autoFocus required
                          placeholder="e.g. noc_engineer"/>
                      </div>
                      <div style={{ marginBottom:18 }}>
                        <FieldLabel>{t('login.password')}</FieldLabel>
                        <NocInput left={IcoLock} value={siPass}
                          type={siShowPw ? 'text' : 'password'}
                          onChange={e => setSiPass(e.target.value)}
                          autoComplete="current-password" required placeholder="••••••••"
                          right={<EyeBtn show={siShowPw} set={setSiShowPw}/>}/>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
                        <input type="checkbox" className="lp-check" id="rm"
                          checked={remember} onChange={e => setRemember(e.target.checked)}/>
                        <label htmlFor="rm" style={{ fontSize:11, color:MUTED, cursor:'pointer' }}>
                          Remember me for 8 hours
                        </label>
                      </div>
                      {signInErr && <AlertBar msg={t('login.error')}/>}
                      <button type="submit" className="btn-primary"
                        disabled={signInLoad || !siUser || !siPass}
                        style={{ width:'100%', justifyContent:'center', padding:'15px' }}>
                        {signInLoad
                          ? <><Spinner/>{t('login.submitting')}</>
                          : <><IcoShield size={14} color="#fff"/>{t('login.submit')}<IcoArrow size={14}/></>}
                      </button>
                    </form>

                    {/* SSO divider */}
                    <div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0 16px' }}>
                      <div style={{ flex:1, height:1, background:'rgba(255,255,255,.06)' }}/>
                      <span style={{ fontSize:9, color:DIM, letterSpacing:2, textTransform:'uppercase', flexShrink:0, fontWeight:700 }}>
                        or continue with
                      </span>
                      <div style={{ flex:1, height:1, background:'rgba(255,255,255,.06)' }}/>
                    </div>

                    <div style={{ display:'flex', gap:8, marginBottom:18 }}>
                      <button className="btn-sso" onClick={() => alert('Huawei SSO — configure OAuth2')}>
                        <HuaweiFlower size={15}/>Huawei Account
                      </button>
                      <button className="btn-sso" style={{ flex:'0 0 auto', padding:'11px 16px' }}
                        onClick={() => navigate('/dashboard')}>
                        <IcoGuest size={13} color={DIM}/>Guest
                      </button>
                    </div>

                    {/* Demo toggle */}
                    <button onClick={() => setDemoOpen(v => !v)} style={{
                      width:'100%', background:'rgba(255,255,255,.012)', border:`1px solid rgba(255,255,255,.07)`,
                      color:DIM, fontSize:9, fontWeight:800, letterSpacing:2.5,
                      textTransform:'uppercase', padding:'9px', cursor:'pointer',
                      fontFamily:'inherit', transition:'all .2s',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                      marginBottom: demoOpen ? 8 : 0,
                      boxShadow:'0 2px 8px rgba(0,0,0,.22)',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor=`rgba(207,10,44,.28)`; e.currentTarget.style.color=MUTED; e.currentTarget.style.background='rgba(207,10,44,.04)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,.07)'; e.currentTarget.style.color=DIM; e.currentTarget.style.background='rgba(255,255,255,.012)' }}>
                      <IcoUser size={10} color="currentColor"/>
                      {t('login.demo')} {demoOpen ? '▲' : '▼'}
                    </button>

                    {demoOpen && (
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        {DEMO.map(u => (
                          <button key={u.username} className="demo-card"
                            onClick={() => { setSiUser(u.username); setSiPass(u.password) }}>
                            <span style={{ fontSize:18, flexShrink:0 }}>{u.flag}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, color:TEXT, fontFamily:'monospace', fontWeight:600 }}>{u.username}</div>
                              <div style={{ fontSize:10, color:DIM, marginTop:1 }}>{u.password}</div>
                            </div>
                            <span className="tag">{u.role}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── SIGN UP ── */}
                {tab === 'signup' && (
                  <div style={{ animation:'slide-r .2s ease both' }}>
                    {suOk ? (
                      <AlertBar msg={`${t('signup.success')} — ${t('signup.successDesc')}`} ok/>
                    ) : (
                      <form onSubmit={handleSignUp}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:0 }}>
                          <div>
                            <FieldLabel>{t('signup.username')}</FieldLabel>
                            <NocInput left={IcoUser} value={suUser}
                              onChange={e=>{setSuUser(e.target.value);setSuErr(null)}}
                              autoComplete="username" autoFocus required
                              placeholder="letters, numbers, _"/>
                          </div>
                          <div>
                            <FieldLabel>{t('signup.fullName')}</FieldLabel>
                            <NocInput left={IcoBadge} value={suName}
                              onChange={e=>{setSuName(e.target.value);setSuErr(null)}}
                              autoComplete="name" required placeholder="Full name"/>
                          </div>
                        </div>
                        <div style={{ marginTop:14 }}>
                          <FieldLabel>{t('signup.password')}</FieldLabel>
                          <NocInput left={IcoLock} value={suPass}
                            type={suShowPw?'text':'password'}
                            onChange={e=>{setSuPass(e.target.value);setSuErr(null)}}
                            autoComplete="new-password" required placeholder="Min. 8 characters"
                            right={<EyeBtn show={suShowPw} set={setSuShowPw}/>}/>
                          {suPass.length > 0 && (
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                              <div style={{ flex:1, height:2, background:'rgba(255,255,255,.06)', display:'flex', gap:2 }}>
                                {[1,2,3,4].map(i => (
                                  <div key={i} style={{ flex:1, height:'100%',
                                    background:i<=str?(strMeta?.c||'transparent'):'transparent',
                                    transition:'background .3s',
                                    boxShadow:i<=str&&strMeta?`0 0 6px ${strMeta.c}55`:'none',
                                  }}/>
                                ))}
                              </div>
                              {strMeta && <span style={{ fontSize:8, color:strMeta.c, fontWeight:800, letterSpacing:1, textTransform:'uppercase', minWidth:30 }}>{strMeta.l}</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ marginTop:14, marginBottom:18 }}>
                          <FieldLabel>{t('signup.confirmPassword')}</FieldLabel>
                          <NocInput left={IcoLock} value={suConf}
                            type={suShowCf?'text':'password'}
                            onChange={e=>{setSuConf(e.target.value);setSuErr(null)}}
                            autoComplete="new-password" required placeholder="Repeat password"
                            right={<EyeBtn show={suShowCf} set={setSuShowCf}/>}
                            extraBorder={suConf?(suPass!==suConf?'rgba(248,81,73,.5)':'rgba(63,185,80,.5)'):undefined}/>
                        </div>
                        {suErr && <AlertBar msg={suErr}/>}
                        <button type="submit" className="btn-primary"
                          disabled={suLoad||!suUser||!suName||!suPass||!suConf}
                          style={{ width:'100%', justifyContent:'center', padding:'15px' }}>
                          {suLoad
                            ? <><Spinner/>{t('signup.submitting')}</>
                            : <><IcoUserPlus size={14} color="#fff"/>{t('signup.submit')}<IcoArrow size={14}/></>}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* Card footer */}
              <div style={{
                padding:'12px 28px 14px',
                borderTop:`1px solid rgba(255,255,255,.05)`,
                background:'rgba(0,0,0,.25)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                fontSize:11, color:DIM }}>
                {tab==='signin'
                  ? <>{t('signup.noAccount')}{' '}
                    <button onClick={() => setTab('signup')} style={{ background:'none',border:'none',color:RED,cursor:'pointer',fontWeight:700,fontFamily:'inherit',fontSize:11 }}>{t('signup.tab')}</button>
                  </>
                  : <>{t('signup.haveAccount')}{' '}
                    <button onClick={() => setTab('signin')} style={{ background:'none',border:'none',color:RED,cursor:'pointer',fontWeight:700,fontFamily:'inherit',fontSize:11 }}>{t('login.tab')}</button>
                  </>
                }
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════════ */}
      <footer style={{
        height:      48,
        padding:     '0 48px',
        display:     'flex',
        alignItems:  'center',
        justifyContent:'space-between',
        borderTop:   `1px solid rgba(255,255,255,.055)`,
        background:  'rgba(5,5,7,.98)',
        flexShrink:  0,
        zIndex:      1,
        position:    'relative',
        boxShadow:   '0 -1px 0 rgba(207,10,44,.06)',
      }}>
        <p style={{ fontSize:10, color:DIM, letterSpacing:.4 }}>
          © 2026 SpiriComp — Huawei Technologies Tunisia · PFE Engineering · Ouerghi Chaima
        </p>
        <div style={{ display:'inline-flex', alignItems:'center', gap:7,
          border:'1px solid rgba(34,197,94,.16)', background:'rgba(34,197,94,.04)',
          padding:'4px 12px',
          boxShadow:'0 0 14px rgba(34,197,94,.07)' }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'#22C55E',
            animation:'pulse-dot 2s infinite',
            boxShadow:'0 0 6px rgba(34,197,94,.65)' }}/>
          <span style={{ fontSize:8.5, color:'rgba(34,197,94,.7)', letterSpacing:2, fontWeight:700 }}>
            API · PORT 8000 · LIVE
          </span>
        </div>
      </footer>
    </div>
  )
}