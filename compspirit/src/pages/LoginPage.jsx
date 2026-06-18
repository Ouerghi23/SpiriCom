// src/pages/LoginPage.jsx

import { useState, useMemo, useCallback, useRef } from 'react'
import { Link, useNavigate }                       from 'react-router-dom'
import { useAuth }                                 from '../hooks/useAuth.jsx'
import { useTranslation }                          from 'react-i18next'
import { useTheme }                                from '../context/ThemeContext'
import { Sun, Moon }                               from 'lucide-react'
import FloatingControls                            from '../components/FloatingControls'
import TranslateWidget                             from '../components/TranslateWidget'
import logoImg                                     from '../assets/images/logo_1.png'
import axios                                       from 'axios'

const API          = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 15 * 60 * 1000  // 15 minutes

// ── FIX-5: Centralised token storage helper ───────────────────────────────
function storeSession(tokenData, persistent = false) {
  const store = persistent ? localStorage : sessionStorage
  store.setItem('spiricomp_token', tokenData.access_token ?? tokenData.token ?? '')
  const user = tokenData.user ?? {
    username:  tokenData.username,
    full_name: tokenData.full_name,
    role:      tokenData.role,
  }
  store.setItem('spiricomp_user', JSON.stringify(user))
}

// ── Static data — module-level, never recreated ───────────────────────
const DEMO = [
  { username:'admin',        password:'spiricomp2026', role:'Admin',    flag:'🛡️' },
  { username:'noc_engineer', password:'noc123',        role:'Engineer', flag:'📡' },
  { username:'huawei_cn',    password:'huawei2026',    role:'华为工程师',  flag:'🇨🇳' },
]

const FEATURES = [
  { tag:'GIS',       titleKey:'modGisTitle'       },
  { tag:'ML',        titleKey:'modMlTitle'        },
  { tag:'AI',        titleKey:'modAiTitle'        },
  { tag:'Analytics', titleKey:'modRcaTitle'       },
  { tag:'UX',        titleKey:'modUxTitle'        },
  { tag:'NLP',       titleKey:'modNlpTitle'       },
]

const STATS = [
  { value:'50K+', labelKey:'statsComplaints'   },
  { value:'552K', labelKey:'statsKpi'  },
  { value:'5K',   labelKey:'statsSites'        },
  { value:'24',   labelKey:'statsGovernorates' },
]

// ── Icons ──────────────────────────────────────────────────────────────
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
const IcoGuest    = Ico(<><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></>)
const IcoCheckSm  = Ico(<polyline points="20 6 9 17 4 12"/>)
const IcoMail     = Ico(<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></>)

// ── Huawei flower ──────────────────────────────────────────────────────
const HuaweiFlower = ({ size = 16, red = '#CF0A2C' }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    {[0,60,120,180,240,300].map((a, i) => (
      <ellipse key={i} cx="50" cy="21" rx="9.5" ry="26"
        fill={i < 3 ? red : '#FF4060'} opacity={.7 + (i % 2) * .15}
        transform={`rotate(${a} 50 50)`}/>
    ))}
  </svg>
)

// ── EyeBtn ─────────────────────────────────────────────────────────────
function EyeBtn({ show, set, dim }) {
  return (
    <button type="button" onClick={() => set(v => !v)} style={{
      background:'none', border:'none', color:dim, cursor:'pointer',
      padding:4, display:'flex', transition:'color .15s',
    }}>
      {show ? <IcoEyeOff size={14}/> : <IcoEyeOn size={14}/>}
    </button>
  )
}

// ── LoadingDots ────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <div style={{ width:14, height:14, border:'2.5px solid rgba(255,255,255,.2)',
      borderTopColor:'rgba(255,255,255,.9)', borderRadius:'50%',
      animation:'lp-spin .65s linear infinite' }}/>
  )
}

// ── NocInput ──────────────────────────────────────────────────────────
function NocInput({ left:L, right, value, onChange, type='text',
  placeholder, autoComplete, autoFocus, required, extraBorder,
  mode, BORDER, TEXT, RED, DIM }) {
  const [focus, setFocus] = useState(false)
  const inputBg     = mode==='dark' ? (focus?'#060609':'#04050A') : (focus?'#FFFFFF':'#F5F7FF')
  const inputBorder = extraBorder || (focus ? 'rgba(207,10,44,.65)' : BORDER)
  return (
    <div style={{ position:'relative' }}>
      {L && (
        <div style={{ position:'absolute', left:14, top:'50%',
          transform:'translateY(-50%)', color:focus?`${RED}CC`:DIM,
          pointerEvents:'none', display:'flex', transition:'color .2s' }}>
          <L size={14}/>
        </div>
      )}
      <input type={type} value={value} onChange={onChange}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        placeholder={placeholder} autoComplete={autoComplete}
        autoFocus={autoFocus} required={required}
        style={{
          width:'100%', padding:L?'14px 14px 14px 44px':'14px',
          paddingRight:right?'46px':'14px', background:inputBg,
          border:`1.5px solid ${inputBorder}`,
          boxShadow:focus
            ?'0 0 0 3px rgba(207,10,44,.09), 0 2px 12px rgba(0,0,0,.2)'
            :'0 2px 8px rgba(0,0,0,.1)',
          color:TEXT, fontSize:13.5, outline:'none', fontFamily:'inherit',
          borderRadius:0, transition:'border-color .2s, box-shadow .2s, background .2s',
          letterSpacing:'.01em',
          cursor: 'text',
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

function TInput({ theme, ...rest }) {
  const { mode, BORDER, TEXT, RED, DIM } = theme
  return <NocInput {...rest} mode={mode} BORDER={BORDER} TEXT={TEXT} RED={RED} DIM={DIM}/>
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function LoginPage() {
  const { login, loading:signInLoad, error:signInErr } = useAuth()
  const navigate              = useNavigate()
  const { t }                 = useTranslation()
  const { mode, toggleTheme } = useTheme()

  // ── FIX-2 / FIX-1: palette memoised ──────────────────────────────────
  const { RED, REDL, BG, BORDER, TEXT, MUTED, DIM } = useMemo(() => ({
    RED:    '#CF0A2C',
    REDL:   '#FF4060',
    BG:     mode==='dark' ? '#050507'  : '#F0F2F8',
    BORDER: mode==='dark' ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.08)',
    TEXT:   mode==='dark' ? '#F8FAFC'  : '#0D1117',
    MUTED:  mode==='dark' ? 'rgba(248,250,252,.55)'  : 'rgba(13,17,23,.6)',
    DIM:    mode==='dark' ? 'rgba(248,250,252,.28)'  : 'rgba(13,17,23,.32)',
  }), [mode])

  // ── Tab ───────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('signin')

  // ── Sign-in state ─────────────────────────────────────────────────────
  const [siUser,   setSiUser]   = useState('')
  const [siPass,   setSiPass]   = useState('')
  const [siShowPw, setSiShowPw] = useState(false)
  const [remember, setRemember] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)

  const [attempts,    setAttempts]    = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)

  const lockedUntilRef = useRef(lockedUntil)
  lockedUntilRef.current = lockedUntil

  // ── Sign-up state ─────────────────────────────────────────────────────
  const [suUser,   setSuUser]   = useState('')
  const [suName,   setSuName]   = useState('')
  const [suEmail,  setSuEmail]  = useState('')
  const [suPass,   setSuPass]   = useState('')
  const [suConf,   setSuConf]   = useState('')
  const [suShowPw, setSuShowPw] = useState(false)
  const [suShowCf, setSuShowCf] = useState(false)
  const [suErr,    setSuErr]    = useState(null)
  const [suLoad,   setSuLoad]   = useState(false)
  const [suOk,     setSuOk]     = useState(false)

  // ── Forgot password state ─────────────────────────────────────────────
  const [fpEmail, setFpEmail] = useState('')
  const [fpSent,  setFpSent]  = useState(false)
  const [fpLoad,  setFpLoad]  = useState(false)
  const [fpErr,   setFpErr]   = useState(null)

  // ── Derived lockout values ─────────────────────────────────────────────
  const isLocked     = !!(lockedUntil && Date.now() < lockedUntil)
  const minutesLeft  = isLocked ? Math.ceil((lockedUntil - Date.now()) / 60000) : 0
  const attemptsLeft = MAX_ATTEMPTS - attempts

  // ── Handlers ──────────────────────────────────────────────────────────

  const roleDestination = () => {
    try {
      const raw = localStorage.getItem('spiricomp_user') || sessionStorage.getItem('spiricomp_user')
      if (raw) {
        const u = JSON.parse(raw)
        if (u?.role) return u.role.toLowerCase() === 'admin' ? '/admin' : '/dashboard'
      }
      const token = localStorage.getItem('spiricomp_token') || sessionStorage.getItem('spiricomp_token')
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
        if (payload?.role) return payload.role.toLowerCase() === 'admin' ? '/admin' : '/dashboard'
      }
    } catch { /* ignore */ }
    return '/dashboard'
  }

  const handleSignIn = useCallback(async e => {
    e.preventDefault()
    if (lockedUntilRef.current && Date.now() < lockedUntilRef.current) return

    const ok = await login(siUser.trim(), siPass, remember)
    if (ok) {
      setAttempts(0)
      navigate(roleDestination())
    } else {
      setAttempts(prev => {
        const next = prev + 1
        if (next >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_MS)
        }
        return next
      })
    }
  }, [siUser, siPass, remember, login, navigate])

  const handleSignUp = async e => {
    e.preventDefault()
    const errs = []
    if (!suUser.trim()||!suName.trim()||!suPass||!suConf) errs.push(t('signup.errorRequired'))
    else if (!/^[a-zA-Z0-9_]{3,}$/.test(suUser.trim()))  errs.push(t('signup.errorUsername'))
    else if (suPass.length < 8)                            errs.push(t('signup.errorPasswordShort'))
    else if (suPass !== suConf)                            errs.push(t('signup.errorPasswordMatch'))
    if (errs.length) { setSuErr(errs[0]); return }

    setSuLoad(true); setSuErr(null)
    try {
      const res = await axios.post(`${API}/api/auth/register`, {
        username:  suUser.trim(),
        full_name: suName.trim(),
        password:  suPass,
        email:     suEmail.trim() || undefined,
      })
      storeSession(res.data, remember)
      setSuOk(true)
      setTimeout(() => navigate(roleDestination()), 2000)
    } catch (err) {
      setSuErr(err.response?.data?.detail || t('login.error'))
    } finally { setSuLoad(false) }
  }

  const handleGuest = useCallback(async () => {
    try {
      const res = await axios.post(`${API}/api/auth/guest`)
      storeSession(res.data, false)
      navigate(roleDestination())
    } catch { alert(t('login.guestUnavailable')) }
  }, [navigate, t])

  const handleForgotPassword = async e => {
    e.preventDefault()
    if (!fpEmail.trim()) { setFpErr(t('forgot.emailRequired')); return }
    setFpLoad(true); setFpErr(null)
    try {
      await axios.post(`${API}/api/auth/forgot-password`, { email: fpEmail.trim() })
      setFpSent(true)
    } catch (err) {
     
  const raw = err.response?.data?.detail
  const msg = Array.isArray(raw)
    ? (raw[0]?.msg || t('forgot.connectionError'))   // erreur Pydantic 422
    : (typeof raw === 'string' ? raw                 // erreur applicative
    : t('forgot.connectionError'))                   // fallback
  setFpErr(msg)
    } finally { setFpLoad(false) }
  }

  // ── Password strength ──────────────────────────────────────────────────
  const str = useMemo(() => {
    let s = 0
    if (suPass.length >= 8)           s++
    if (/[A-Z]/.test(suPass))         s++
    if (/[0-9]/.test(suPass))         s++
    if (/[^a-zA-Z0-9]/.test(suPass))  s++
    return s
  }, [suPass])

  const strMeta = [null,
    {l:'Weak',  c:'#F85149'},{l:'Fair',  c:'#D29922'},
    {l:'Good',  c:'#3FB950'},{l:'Strong',c:'#22C55E'},
  ][str]

  const confMatch    = suConf.length > 0 && suPass === suConf
  const confMismatch = suConf.length > 0 && suPass !== suConf

  // ── Inline components ──────────────────────────────────────────────────
  const FieldLabel = ({ children }) => (
    <label style={{ display:'block', fontSize:9.5, fontWeight:700,
      color:DIM, letterSpacing:2.4, textTransform:'uppercase', marginBottom:8 }}>
      {children}
    </label>
  )

  const AlertBar = ({ msg, ok }) => !msg ? null : (
    <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:14,
      background:ok?'rgba(34,197,94,.06)':'rgba(207,10,44,.06)',
      border:`1px solid ${ok?'rgba(34,197,94,.22)':'rgba(207,10,44,.22)'}`,
      borderLeft:`3px solid ${ok?'#22C55E':RED}`,
      padding:'10px 14px', fontSize:12, color:ok?'#4ADE80':REDL,
    }}>
      {ok ? <IcoCheck size={13} color="#4ADE80"/> : <IcoWarn size={13} color={REDL}/>}
      {msg}
    </div>
  )

  // ── Stable theme object ───────────────────────────────────────────────
  const th = useMemo(() => ({ mode, BORDER, TEXT, RED, DIM }), [mode, BORDER, TEXT, RED, DIM])

  // ── Tab titles ─────────────────────────────────────────────────────────
  const cardTitle = {
    signin: t('login.title'),
    signup: t('signup.title'),
    forgot: t('forgot.cardTitle'),
  }[tab] || ''

  const cardSub = {
    signin: t('login.subtitle'),
    signup: t('signup.subtitle'),
    forgot: t('forgot.cardSub'),
  }[tab] || ''

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight:'100vh', background:BG,
      backgroundImage: mode==='dark' ? [
        'radial-gradient(ellipse 80% 60% at 18% 28%, rgba(207,10,44,.06) 0%, transparent 60%)',
        'radial-gradient(ellipse 55% 45% at 88% 78%, rgba(207,10,44,.04) 0%, transparent 55%)',
        'linear-gradient(rgba(255,255,255,.016) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(255,255,255,.016) 1px, transparent 1px)',
      ].join(',') : [
        'radial-gradient(ellipse 80% 60% at 18% 28%, rgba(207,10,44,.04) 0%, transparent 60%)',
        'linear-gradient(rgba(0,0,0,.025) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(0,0,0,.025) 1px, transparent 1px)',
      ].join(','),
      backgroundSize:'auto, auto, 72px 72px, 72px 72px',
      display:'flex', flexDirection:'column',
      fontFamily:"'Inter','Barlow',system-ui,sans-serif",
      color:TEXT, position:'relative', overflow:'hidden',
      transition:'background .3s, color .3s',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Barlow+Condensed:ital,wght@0,700;0,800;0,900;1,300;1,400&display=swap');
        @keyframes lp-spin   { to{transform:rotate(360deg)} }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.7)} }
        @keyframes slide-in  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slide-r   { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        @keyframes scan-line { 0%{top:-2px} 100%{top:100vh} }
        .lp-scanline{position:fixed;left:0;right:0;height:140px;pointer-events:none;z-index:0;
          background:linear-gradient(180deg,transparent 0%,rgba(207,10,44,.03) 50%,transparent 100%);
          animation:scan-line 10s linear infinite}
        .btn-primary{background:linear-gradient(135deg,#D90B2E 0%,#CF0A2C 55%,#B50826 100%);
          color:white;border:none;border-top:1px solid rgba(255,255,255,.13);
          padding:14px 32px;font-size:11.5px;font-weight:800;letter-spacing:1.8px;
          text-transform:uppercase;cursor:pointer;transition:all .22s;font-family:inherit;
          display:inline-flex;align-items:center;gap:9px;position:relative;overflow:hidden;
          box-shadow:0 4px 20px rgba(207,10,44,.28)}
        .btn-primary:hover:not(:disabled){background:linear-gradient(135deg,#E8102F 0%,#D90B2E 55%,#C00926 100%);
          transform:translateY(-1.5px);box-shadow:0 10px 34px rgba(207,10,44,.48)}
        .btn-primary:disabled{background:rgba(207,10,44,.18);cursor:not-allowed;transform:none;box-shadow:none;opacity:.55}
        .btn-ghost{background:transparent;color:${MUTED};border:1px solid ${BORDER};
          padding:10px 22px;font-size:10.5px;font-weight:600;letter-spacing:1.6px;
          text-transform:uppercase;cursor:pointer;transition:all .2s;font-family:inherit;
          display:inline-flex;align-items:center;gap:8px;text-decoration:none}
        .btn-ghost:hover{border-color:${mode==='dark'?'rgba(255,255,255,.3)':'rgba(0,0,0,.25)'};
          color:${TEXT};background:${mode==='dark'?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)'}}
        .section-label{font-size:10px;font-weight:800;color:#CF0A2C;letter-spacing:4.5px;
          text-transform:uppercase;display:flex;align-items:center;gap:12px;margin-bottom:20px}
        .section-label::before{content:'';width:22px;height:1px;background:#CF0A2C}
        .tag{font-size:8px;font-weight:800;letter-spacing:2px;padding:2px 8px;
          border:1px solid rgba(207,10,44,.28);color:rgba(207,10,44,.9);
          text-transform:uppercase;background:rgba(207,10,44,.07)}
        .lp-tab{flex:1;padding:13px 10px;background:transparent;border:none;
          border-bottom:2px solid transparent;color:${DIM};font-size:10px;font-weight:800;
          letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all .2s;
          font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px}
        .lp-tab.active{color:${TEXT};border-bottom-color:#CF0A2C;
          background:linear-gradient(180deg,rgba(207,10,44,.07) 0%,transparent 100%)}
        .lp-tab:hover:not(.active){color:${MUTED};background:${mode==='dark'?'rgba(255,255,255,.02)':'rgba(0,0,0,.02)'}}
        .demo-card{width:100%;display:flex;align-items:center;gap:12px;padding:11px 14px;
          background:${mode==='dark'?'rgba(4,5,9,.95)':'#FFFFFF'};
          border:1px solid ${BORDER};cursor:pointer;transition:all .25s;
          font-family:inherit;text-align:left;position:relative;overflow:hidden}
        .demo-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1.5px;
          background:linear-gradient(90deg,transparent,#CF0A2C,transparent);
          transform:scaleX(0);transform-origin:center;transition:transform .35s}
        .demo-card:hover{border-color:rgba(207,10,44,.24);
          background:${mode==='dark'?'rgba(207,10,44,.03)':'rgba(207,10,44,.04)'};
          transform:translateX(2px)}
        .demo-card:hover::before{transform:scaleX(1)}
        .btn-sso{flex:1;padding:11px 12px;
          background:${mode==='dark'?'rgba(255,255,255,.015)':'rgba(0,0,0,.03)'};
          border:1px solid ${BORDER};color:${MUTED};font-size:11px;font-weight:600;
          cursor:pointer;transition:all .2s;font-family:inherit;
          display:flex;align-items:center;justify-content:center;gap:8px}
        .btn-sso:hover{border-color:rgba(207,10,44,.32);color:${TEXT};background:rgba(207,10,44,.05)}
        .feature-row{display:flex;align-items:center;gap:12px;padding:8px 0;
          border-bottom:1px solid ${BORDER};transition:all .2s}
        .feature-row:last-child{border-bottom:none}
        .feature-row:hover{padding-left:4px}
        .lp-check{width:14px;height:14px;accent-color:#CF0A2C;cursor:pointer;flex-shrink:0}
        .theme-btn-lp{width:34px;height:34px;border-radius:8px;border:1px solid ${BORDER};
          background:${mode==='dark'?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)'};
          color:${MUTED};cursor:pointer;display:flex;align-items:center;
          justify-content:center;transition:all .2s;flex-shrink:0}
        .theme-btn-lp:hover{background:rgba(207,10,44,.08);border-color:rgba(207,10,44,.3);color:#CF0A2C}
        input:-webkit-autofill{
          -webkit-box-shadow:0 0 0 100px ${mode==='dark'?'#04050A':'#FFFFFF'} inset !important;
          -webkit-text-fill-color:${TEXT} !important}
        @media(max-width:900px){
          .lp-left{display:none !important}
          .lp-divider{display:none !important}
          .lp-right{padding:24px 20px !important}}
      `}</style>

      {mode==='dark' && <div className="lp-scanline"/>}

      {/* ── HEADER ── */}
      <header style={{
        position:'sticky', top:0, zIndex:100, height:64, padding:'0 48px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        background:mode==='dark'?'rgba(5,5,7,.98)':'rgba(240,242,248,.98)',
        borderBottom:`1px solid ${BORDER}`,
        backdropFilter:'blur(24px) saturate(1.4)', flexShrink:0,
        boxShadow:`0 1px 0 rgba(207,10,44,.07), 0 4px 28px rgba(0,0,0,${mode==='dark'?'.5':'.08'})`,
        transition:'background .3s',
      }}>
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:11, textDecoration:'none' }}>
          <div style={{ width:36, height:36, borderRadius:'50%', overflow:'hidden',
            border:'1.5px solid rgba(207,10,44,.55)', flexShrink:0,
            boxShadow:'0 0 14px rgba(207,10,44,.22), 0 0 0 3px rgba(207,10,44,.06)' }}>
            <img src={logoImg} alt="SpiriComp" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
          </div>
          <div style={{ lineHeight:1 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:20, letterSpacing:'-.5px', color:TEXT }}>
              Spiri<span style={{ color:RED }}>Comp</span>
            </div>
            <div style={{ fontSize:8, color:DIM, letterSpacing:4, marginTop:2, fontWeight:700 }}>
              {t('brand.by')}
            </div>
          </div>
        </Link>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>

          <Link to="/" className="btn-ghost" style={{ padding:'8px 18px', fontSize:10 }}>
            {t('login.back')}
          </Link>
        </div>
      </header>

      {/* ── MAIN BODY ── */}
      <main style={{ flex:1, display:'flex', position:'relative', zIndex:1, minHeight:0 }}>

        {/* LEFT — Brand zone */}
        <div className="lp-left" style={{
          flex:'0 0 44%', padding:'52px 56px 40px',
          display:'flex', flexDirection:'column', justifyContent:'space-between',
          overflowY:'auto',
        }}>
          <div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:7,
              background:'rgba(207,10,44,.08)', border:'1px solid rgba(207,10,44,.24)',
              padding:'5px 13px', marginBottom:28 }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:RED,
                display:'inline-block', animation:'pulse-dot 2s ease-in-out infinite' }}/>
              <span style={{ fontSize:9, fontWeight:800, letterSpacing:'2.5px',
                textTransform:'uppercase', color:REDL }}>
                {t('landing.liveBadge')}
              </span>
            </div>
            <div className="section-label">{t('login.secureAccess')}</div>
            <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif",
              fontSize:'clamp(32px,3.8vw,58px)', fontWeight:900,
              letterSpacing:'-2px', lineHeight:.96, marginBottom:20, color:TEXT }}>
              NOC <span style={{ color:RED, fontStyle:'italic' }}>INTELLIGENCE</span>
              <br/>
              <span style={{ color:MUTED, fontWeight:300, fontStyle:'italic' }}>
                {t('brand.subtitle')}
              </span>
            </h1>
            <p style={{ fontSize:13, lineHeight:1.9, color:MUTED,
              fontWeight:300, maxWidth:380, marginBottom:36 }}>
              {t('landing.heroDesc')}
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)',
              gap:1, background:BORDER, marginBottom:32 }}>
              {STATS.map(s => (
                <div key={s.labelKey} style={{ textAlign:'center', padding:'22px 16px',
                  border:`1px solid ${BORDER}`,
                  background:mode==='dark'?'#0A0A0A':'#FFFFFF',
                  position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, left:'15%', right:'15%',
                    height:1, background:`linear-gradient(90deg,transparent,${RED},transparent)` }}/>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif",
                    fontSize:'clamp(28px,3vw,44px)', fontWeight:900,
                    color:RED, lineHeight:1, letterSpacing:'-1.5px' }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize:9, color:DIM, marginTop:7,
                    letterSpacing:2, textTransform:'uppercase', fontWeight:600 }}>
                    {t(`landing.${s.labelKey}`)}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize:9, fontWeight:800, color:DIM,
                letterSpacing:3, textTransform:'uppercase', marginBottom:12 }}>
                {t('landing.platformSection')}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 24px' }}>
                {FEATURES.map(f => (
                  <div key={f.tag} className="feature-row">
                    <IcoCheckSm size={11} color={RED}/>
                    <span style={{ flex:1, fontSize:12, color:MUTED, fontWeight:500 }}>
                      {t(`landing.${f.titleKey}`)}
                    </span>
                    <span className="tag">{f.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:32,
            padding:'10px 16px', border:'1px solid rgba(207,10,44,.14)',
            background:'rgba(207,10,44,.03)' }}>
            <HuaweiFlower size={18} red={RED}/>
            <div>
              <div style={{ fontSize:10, color:MUTED, fontWeight:600 }}>Huawei Technologies Tunisia</div>
              <div style={{ fontSize:8, color:DIM, letterSpacing:2, textTransform:'uppercase', marginTop:1 }}>
                PFE Engineering · 2026
              </div>
            </div>
          </div>
        </div>

        <div className="lp-divider" style={{ width:1, flexShrink:0, alignSelf:'stretch',
          background:`linear-gradient(180deg,transparent 0%,${BORDER} 12%,${BORDER} 88%,transparent 100%)` }}/>

        {/* RIGHT — Form zone */}
        <div className="lp-right" style={{
          flex:1, display:'flex', alignItems:'center', justifyContent:'center',
          padding:'40px 56px', overflowY:'auto',
        }}>
          <div style={{ width:'100%', maxWidth:500, animation:'slide-in .45s cubic-bezier(.22,.68,0,1.2) both' }}>
            <div style={{
              background:mode==='dark'
                ?'linear-gradient(180deg,#0F0F12 0%,#0B0B0F 100%)'
                :'#FFFFFF',
              border:`1px solid ${BORDER}`,
              boxShadow:mode==='dark'
                ?'0 0 0 1px rgba(207,10,44,.07), 0 28px 72px rgba(0,0,0,.7)'
                :'0 4px 32px rgba(0,0,0,.1)',
              position:'relative', overflow:'hidden', transition:'background .3s',
            }}>
              {/* Red accent stripe */}
              <div style={{ height:3,
                background:`linear-gradient(90deg,${RED} 0%,rgba(207,10,44,.55) 45%,rgba(207,10,44,.12) 80%,transparent 100%)`,
                boxShadow:'0 0 22px rgba(207,10,44,.45)' }}/>

              {/* Card header */}
              <div style={{ padding:'22px 28px 18px', borderBottom:`1px solid ${BORDER}`,
                background:mode==='dark'?'linear-gradient(180deg,rgba(255,255,255,.018) 0%,transparent 100%)':'transparent' }}>
                <div style={{ fontSize:9.5, fontWeight:800, color:RED, letterSpacing:'4px',
                  textTransform:'uppercase', display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:20, height:1, background:RED }}/>
                  {t('login.secureAccess')}
                </div>
                <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28,
                  fontWeight:900, letterSpacing:'-1px', lineHeight:1, color:TEXT, marginBottom:5 }}>
                  {cardTitle}{' — '}
                  <span style={{ color:MUTED, fontWeight:300, fontStyle:'italic' }}>SpiriComp</span>
                </h2>
                <p style={{ fontSize:11, color:DIM, lineHeight:1.6 }}>{cardSub}</p>
              </div>

              {/* Tabs — signin + signup only */}
              {tab !== 'forgot' && (
                <div style={{ display:'flex', borderBottom:`1px solid ${BORDER}`,
                  background:mode==='dark'?'rgba(0,0,0,.22)':'rgba(0,0,0,.02)' }}>
                  <button className={`lp-tab${tab==='signin'?' active':''}`} onClick={() => setTab('signin')}>
                    <IcoUser size={12} color={tab==='signin'?RED:DIM}/>
                    {t('login.tab')}
                  </button>
                  <button className={`lp-tab${tab==='signup'?' active':''}`} onClick={() => setTab('signup')}>
                    <IcoUserPlus size={12} color={tab==='signup'?RED:DIM}/>
                    {t('signup.tab')}
                  </button>
                </div>
              )}

              {/* Form body */}
              <div style={{ padding:'26px 28px 24px' }}>

                {/* ── SIGN IN ── */}
                {tab === 'signin' && (
                  <div style={{ animation:'slide-r .2s ease both' }}>
                    <form onSubmit={handleSignIn}>
                      {isLocked && (
                        <AlertBar msg={`${t('login.lockout')} ${minutesLeft} ${t('login.lockoutMinutes')}`}/>
                      )}
                      <div style={{ marginBottom:18 }}>
                        <FieldLabel>{t('login.username')}</FieldLabel>
                        <TInput theme={th} left={IcoUser} value={siUser}
                          onChange={e => setSiUser(e.target.value)}
                          autoComplete="username" autoFocus required
                          placeholder="e.g. noc_engineer"/>
                      </div>
                      <div style={{ marginBottom:6 }}>
                        <FieldLabel>{t('login.password')}</FieldLabel>
                        <TInput theme={th} left={IcoLock} value={siPass}
                          type={siShowPw?'text':'password'}
                          onChange={e => setSiPass(e.target.value)}
                          autoComplete="current-password" required placeholder="••••••••"
                          right={<EyeBtn show={siShowPw} set={setSiShowPw} dim={DIM}/>}/>
                      </div>

                      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
                        <button type="button" onClick={() => setTab('forgot')} style={{
                          background:'none', border:'none', color:RED, fontSize:11,
                          cursor:'pointer', fontFamily:'inherit', fontWeight:600, letterSpacing:'.3px',
                        }}>
                          {t('login.forgotPassword')}
                        </button>
                      </div>

                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
                        <input type="checkbox" className="lp-check" id="rm"
                          checked={remember} onChange={e => setRemember(e.target.checked)}/>
                        <label htmlFor="rm" style={{ fontSize:11, color:MUTED, cursor:'pointer' }}>
                          {remember ? t('login.sessionPersistent') : t('login.sessionEphemeral')}
                        </label>
                      </div>

                      {signInErr && !isLocked && <AlertBar msg={t('login.error')}/>}

                      {attempts > 0 && !isLocked && (
                        <div style={{ display:'flex', alignItems:'center', gap:6,
                          fontSize:10, color:'#F59E0B', marginBottom:12 }}>
                          <IcoWarn size={11} color="#F59E0B"/>
                          {attemptsLeft} {t('login.attemptsLeft')}
                        </div>
                      )}

                      <button type="submit" className="btn-primary"
                        disabled={signInLoad||!siUser||!siPass||!!isLocked}
                        style={{ width:'100%', justifyContent:'center', padding:'15px' }}>
                        {signInLoad
                          ?<><LoadingDots/>{t('login.submitting')}</>
                          :<><IcoShield size={14} color="#fff"/>{t('login.submit')}<IcoArrow size={14}/></>}
                      </button>
                    </form>

                    <div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0 16px' }}>
                      <div style={{ flex:1, height:1, background:BORDER }}/>
                      <span style={{ fontSize:9, color:DIM, letterSpacing:2,
                        textTransform:'uppercase', flexShrink:0, fontWeight:700 }}>
                        {t('login.orContinueWith')}
                      </span>
                      <div style={{ flex:1, height:1, background:BORDER }}/>
                    </div>

                    <div style={{ display:'flex', gap:8, marginBottom:18 }}>
                      <button className="btn-sso"
                        onClick={() => alert(t('login.huaweiAccount') + ' — configure OAuth2 endpoint')}>
                        <HuaweiFlower size={15} red={RED}/>{t('login.huaweiAccount')}
                      </button>
                      <button className="btn-sso" style={{ flex:'0 0 auto', padding:'11px 16px' }}
                        onClick={handleGuest}>
                        <IcoGuest size={13} color={DIM}/>{t('login.guestAccess')}
                      </button>
                    </div>

                    <button onClick={() => setDemoOpen(v=>!v)} style={{
                      width:'100%',
                      background:mode==='dark'?'rgba(255,255,255,.012)':'rgba(0,0,0,.03)',
                      border:`1px solid ${BORDER}`, color:DIM, fontSize:9, fontWeight:800,
                      letterSpacing:2.5, textTransform:'uppercase', padding:'9px', cursor:'pointer',
                      fontFamily:'inherit', transition:'all .2s',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                      marginBottom:demoOpen?8:0,
                    }}>
                      <IcoUser size={10} color="currentColor"/>
                      {t('login.demo')} {demoOpen?'▲':'▼'}
                    </button>

                    {demoOpen && (
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        {DEMO.map(u => (
                          <button key={u.username} className="demo-card"
                            onClick={() => { setSiUser(u.username); setSiPass(u.password) }}>
                            <span style={{ fontSize:18, flexShrink:0 }}>{u.flag}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, color:TEXT, fontFamily:'monospace', fontWeight:600 }}>
                                {u.username}
                              </div>
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
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                          <div>
                            <FieldLabel>{t('signup.username')}</FieldLabel>
                            <TInput theme={th} left={IcoUser} value={suUser}
                              onChange={e=>{setSuUser(e.target.value);setSuErr(null)}}
                              autoComplete="username" autoFocus required
                              placeholder="letters, numbers, _"/>
                          </div>
                          <div>
                            <FieldLabel>{t('signup.fullName')}</FieldLabel>
                            <TInput theme={th} left={IcoBadge} value={suName}
                              onChange={e=>{setSuName(e.target.value);setSuErr(null)}}
                              autoComplete="name" required placeholder="Full name"/>
                          </div>
                        </div>

                        <div style={{ marginTop:14 }}>
                          <FieldLabel>
                            {t('signup.emailLabel')}{' '}
                            <span style={{ color:DIM, fontWeight:400 }}>
                              ({t('signup.emailOptional')})
                            </span>
                          </FieldLabel>
                          <TInput
                            theme={th}
                            left={IcoMail}
                            value={suEmail}
                            onChange={e => { setSuEmail(e.target.value); setSuErr(null) }}
                            type="email"
                            placeholder={t('signup.emailPlaceholder')}
                            autoComplete="email"
                          />
                        </div>

                        <div style={{ marginTop:14 }}>
                          <FieldLabel>{t('signup.password')}</FieldLabel>
                          <TInput theme={th} left={IcoLock} value={suPass}
                            type={suShowPw?'text':'password'}
                            onChange={e=>{setSuPass(e.target.value);setSuErr(null)}}
                            autoComplete="new-password" required placeholder="Min. 8 characters"
                            right={<EyeBtn show={suShowPw} set={setSuShowPw} dim={DIM}/>}/>
                          {suPass.length > 0 && (
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                              <div style={{ flex:1, height:2, background:BORDER, display:'flex', gap:2 }}>
                                {[1,2,3,4].map(i => (
                                  <div key={i} style={{ flex:1, height:'100%',
                                    background:i<=str?(strMeta?.c||'transparent'):'transparent',
                                    transition:'background .3s' }}/>
                                ))}
                              </div>
                              {strMeta && (
                                <span style={{ fontSize:8, color:strMeta.c, fontWeight:800,
                                  letterSpacing:1, textTransform:'uppercase', minWidth:30 }}>
                                  {strMeta.l}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div style={{ marginTop:14, marginBottom:confMatch||confMismatch?4:18 }}>
                          <FieldLabel>{t('signup.confirmPassword')}</FieldLabel>
                          <TInput theme={th} left={IcoLock} value={suConf}
                            type={suShowCf?'text':'password'}
                            onChange={e=>{setSuConf(e.target.value);setSuErr(null)}}
                            autoComplete="new-password" required placeholder="Repeat password"
                            right={<EyeBtn show={suShowCf} set={setSuShowCf} dim={DIM}/>}
                            extraBorder={suConf
                              ?(suPass!==suConf?'rgba(248,81,73,.5)':'rgba(63,185,80,.5)')
                              :undefined}/>
                          {confMismatch && (
                            <div style={{ display:'flex', alignItems:'center', gap:5,
                              marginTop:5, fontSize:11, color:'#F85149', marginBottom:14 }}>
                              <IcoWarn size={11} color="#F85149"/>
                              {t('signup.errorPasswordMatch')}
                            </div>
                          )}
                          {confMatch && (
                            <div style={{ display:'flex', alignItems:'center', gap:5,
                              marginTop:5, fontSize:11, color:'#3FB950', marginBottom:14 }}>
                              <IcoCheck size={11} color="#3FB950"/>
                              {t('signup.passwordsMatch')} ✓
                            </div>
                          )}
                          {!suConf && <div style={{ marginBottom:14 }}/>}
                        </div>

                        {suErr && <AlertBar msg={suErr}/>}
                        <button type="submit" className="btn-primary"
                          disabled={suLoad||!suUser||!suName||!suPass||!suConf||confMismatch}
                          style={{ width:'100%', justifyContent:'center', padding:'15px' }}>
                          {suLoad
                            ?<><LoadingDots/>{t('signup.submitting')}</>
                            :<><IcoUserPlus size={14} color="#fff"/>{t('signup.submit')}<IcoArrow size={14}/></>}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* ── FORGOT PASSWORD ── */}
                {tab === 'forgot' && (
                  <div style={{ animation:'slide-r .2s ease both' }}>
                    {fpSent ? (
                      <div style={{ textAlign:'center', padding:'24px 0' }}>
                        <div style={{ width:52, height:52, borderRadius:'50%',
                          background:'rgba(63,185,80,.1)', border:'1px solid rgba(63,185,80,.3)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          margin:'0 auto 16px' }}>
                          <IcoCheck size={22} color="#3FB950"/>
                        </div>
                        <div style={{ fontFamily:"'Barlow Condensed',sans-serif",
                          fontSize:20, fontWeight:800, color:TEXT, marginBottom:8 }}>
                          {t('forgot.sent')}
                        </div>
                        <p style={{ fontSize:12, color:MUTED, lineHeight:1.7, marginBottom:20 }}>
                          {(() => {
                            const parts = t('forgot.sentDesc').split('{email}')
                            const before = parts[0]
                            const after  = parts.length > 1 ? parts[1] : ''
                            return (
                              <>
                                {before}
                                <strong style={{ color:TEXT }}>{fpEmail}</strong>
                                {after}
                              </>
                            )
                          })()}
                        </p>
                        <button
                          onClick={() => { setTab('signin'); setFpSent(false); setFpEmail('') }}
                          className="btn-primary"
                          style={{ justifyContent:'center', padding:'12px 32px' }}>
                          {t('forgot.backToLogin')}
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleForgotPassword}>
                        <div style={{ marginBottom:20 }}>
                          <div style={{ fontFamily:"'Barlow Condensed',sans-serif",
                            fontSize:18, fontWeight:800, color:TEXT, marginBottom:6 }}>
                            {t('forgot.title')}
                          </div>
                          <p style={{ fontSize:12, color:MUTED, lineHeight:1.6 }}>
                            {t('forgot.subtitle')}
                          </p>
                        </div>
                        <div style={{ marginBottom:18 }}>
                          <FieldLabel>{t('forgot.emailLabel')}</FieldLabel>
                          <TInput theme={th} left={IcoMail} value={fpEmail}
                            onChange={e=>{setFpEmail(e.target.value);setFpErr(null)}}
                            type="email" autoFocus required
                            placeholder={t('forgot.emailPlaceholder')}
                            autoComplete="email"/>
                        </div>
                        {fpErr && <AlertBar msg={fpErr}/>}
                        <button type="submit" className="btn-primary"
                          disabled={fpLoad||!fpEmail.trim()}
                          style={{ width:'100%', justifyContent:'center', padding:'15px' }}>
                          {fpLoad
                            ?<><LoadingDots/>{t('forgot.submitting')}</>
                            :<><IcoShield size={14} color="#fff"/>{t('forgot.submit')}<IcoArrow size={14}/></>}
                        </button>
                        <div style={{ textAlign:'center', marginTop:16 }}>
                          <button type="button" onClick={() => setTab('signin')} style={{
                            background:'none', border:'none', color:MUTED,
                            fontSize:11, cursor:'pointer', fontFamily:'inherit',
                          }}>
                            ← {t('forgot.backToLogin')}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* ── Card footer ── */}
              <div style={{ padding:'12px 28px 14px', borderTop:`1px solid ${BORDER}`,
                background:mode==='dark'?'rgba(0,0,0,.25)':'rgba(0,0,0,.02)',
                display:'flex', alignItems:'center', justifyContent:'center',
                gap:6, fontSize:11, color:DIM }}>
                {tab === 'signin' && (
                  <>{t('signup.noAccount')}{' '}
                    <button onClick={() => setTab('signup')} style={{
                      background:'none', border:'none', color:RED, cursor:'pointer',
                      fontWeight:700, fontFamily:'inherit', fontSize:11 }}>
                      {t('signup.tab')}
                    </button>
                  </>
                )}
                {tab === 'signup' && (
                  <>{t('signup.haveAccount')}{' '}
                    <button onClick={() => setTab('signin')} style={{
                      background:'none', border:'none', color:RED, cursor:'pointer',
                      fontWeight:700, fontFamily:'inherit', fontSize:11 }}>
                      {t('login.tab')}
                    </button>
                  </>
                )}
                {tab === 'forgot' && (
                  <>{t('forgot.remember')}{' '}
                    <button onClick={() => setTab('signin')} style={{
                      background:'none', border:'none', color:RED, cursor:'pointer',
                      fontWeight:700, fontFamily:'inherit', fontSize:11 }}>
                      {t('login.tab')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer style={{
        height:48, padding:'0 48px', display:'flex',
        alignItems:'center', justifyContent:'space-between',
        borderTop:`1px solid ${BORDER}`,
        background:mode==='dark'?'rgba(5,5,7,.98)':'rgba(240,242,248,.98)',
        flexShrink:0, zIndex:1, position:'relative', transition:'background .3s',
      }}>
        <p style={{ fontSize:10, color:DIM, letterSpacing:.4 }}>
          © 2026 SpiriComp — Huawei Technologies Tunisia · PFE Engineering · Ouerghi Chaima
        </p>
        <div style={{ display:'inline-flex', alignItems:'center', gap:7,
          border:'1px solid rgba(34,197,94,.16)', background:'rgba(34,197,94,.04)', padding:'4px 12px' }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'#22C55E',
            animation:'pulse-dot 2s infinite' }}/>
          <span style={{ fontSize:8.5, color:'rgba(34,197,94,.7)', letterSpacing:2, fontWeight:700 }}>
            API · PORT 8000 · LIVE
          </span>
        </div>
      </footer>

      {/* FloatingControls: bottom-left pill — theme + EN↔ZH */}
      <FloatingControls />
      {/* TranslateWidget: bottom-right i18n button */}
     
    </div>
  )
}