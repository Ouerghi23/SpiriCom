// src/pages/ResetPasswordPage.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom — Reset Password page (LP-RESET-2/3 fix)
// Reached via: /reset-password?token=<JWT>
// Calls: POST /api/auth/reset-password  { token, new_password }
// Matches LoginPage visual identity exactly (same palette, font, layout).
// ─────────────────────────────────────────────────────────────────────
import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTheme }  from '../context/ThemeContext'
import { useTranslation } from 'react-i18next'
import { Sun, Moon }  from 'lucide-react'
import axios from 'axios'
import logoImg from '../assets/images/logo.png'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Inline icon builder (same as LoginPage) ──────────────────────────
const Ico = d => ({ size=14, color='currentColor', sw=2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const IcoLock    = Ico(<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>)
const IcoShield  = Ico(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>)
const IcoArrow   = Ico(<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>)
const IcoWarn    = Ico(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>)
const IcoCheck   = Ico(<polyline points="20 6 9 17 4 12"/>)
const IcoEyeOn   = Ico(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>)
const IcoEyeOff  = Ico(<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>)

function LoadingDots() {
  return (
    <div style={{ width:14, height:14, border:'2.5px solid rgba(255,255,255,.2)',
      borderTopColor:'rgba(255,255,255,.9)', borderRadius:'50%',
      animation:'rp-spin .65s linear infinite' }}/>
  )
}

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

// ── Password strength (same logic as LoginPage) ───────────────────────
function useStrength(pw) {
  return useMemo(() => {
    let s = 0
    if (pw.length >= 8)          s++
    if (/[A-Z]/.test(pw))        s++
    if (/[0-9]/.test(pw))        s++
    if (/[^a-zA-Z0-9]/.test(pw)) s++
    return s
  }, [pw])
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function ResetPasswordPage() {
  const { mode, toggleTheme } = useTheme()
  const { t }                 = useTranslation()
  const navigate              = useNavigate()
  const [params]              = useSearchParams()

  // LP-RESET-2 fix: read the token from the URL
  const token = params.get('token') || ''

  const { RED, REDL, BG, BORDER, TEXT, MUTED, DIM } = useMemo(() => ({
    RED:    '#CF0A2C',
    REDL:   '#FF4060',
    BG:     mode==='dark' ? '#050507'  : '#F0F2F8',
    BORDER: mode==='dark' ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.08)',
    TEXT:   mode==='dark' ? '#F8FAFC'  : '#0D1117',
    MUTED:  mode==='dark' ? 'rgba(248,250,252,.55)'  : 'rgba(13,17,23,.6)',
    DIM:    mode==='dark' ? 'rgba(248,250,252,.28)'  : 'rgba(13,17,23,.32)',
  }), [mode])

  const [newPw,   setNewPw]   = useState('')
  const [confPw,  setConfPw]  = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showCnf, setShowCnf] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [done,    setDone]    = useState(false)

  const str     = useStrength(newPw)
  const strMeta = [null,
    { l:'Weak',   c:'#F85149' }, { l:'Fair',   c:'#D29922' },
    { l:'Good',   c:'#3FB950' }, { l:'Strong', c:'#22C55E' },
  ][str]

  const confMatch    = confPw.length > 0 && newPw === confPw
  const confMismatch = confPw.length > 0 && newPw !== confPw

  // ── LP-RESET-3 fix: call the actual reset endpoint ─────────────────
  const handleSubmit = async e => {
    e.preventDefault()
    if (!token) { setError('Invalid or expired reset link — please request a new one.'); return }
    if (newPw.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPw !== confPw)  { setError('Passwords do not match.'); return }

    setLoading(true); setError(null)
    try {
      await axios.post(`${API}/api/auth/reset-password`, {
        token,
        new_password: newPw,
      })
      setDone(true)
      // Auto-redirect to login after 3 s
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      const msg = err.response?.data?.detail
      setError(
        msg === 'TOKEN_EXPIRED'   ? 'Reset link has expired. Please request a new one.' :
        msg === 'TOKEN_INVALID'   ? 'Invalid reset link. Please request a new one.'     :
        msg === 'USER_NOT_FOUND'  ? 'Account not found.'                                :
        msg || 'Unable to reset password — please try again.'
      )
    } finally { setLoading(false) }
  }

  const FieldLabel = ({ children }) => (
    <label style={{ display:'block', fontSize:9.5, fontWeight:700, color:DIM,
      letterSpacing:2.4, textTransform:'uppercase', marginBottom:8 }}>
      {children}
    </label>
  )

  // ── Shared input shell (mirrors NocInput from LoginPage) ───────────
const PwInput = ({ value, onChange, show, setShow, placeholder, autoFocus, otherValue }) => {
    const [focus, setFocus] = useState(false)
    // Utilise otherValue au lieu de référencer directement newPw/confPw
    const match    = otherValue !== undefined && value.length > 0 && value === otherValue
    const mismatch = otherValue !== undefined && value.length > 0 && otherValue.length > 0 && value !== otherValue
    const xBorder  = otherValue !== undefined && otherValue.length > 0
      ? (value !== otherValue ? 'rgba(248,81,73,.5)' : 'rgba(63,185,80,.5)')
      : undefined

    return (
      <div style={{ position:'relative' }}>
        <div style={{ position:'absolute', left:14, top:'50%',
          transform:'translateY(-50%)', color:focus?`${RED}CC`:DIM,
          pointerEvents:'none', display:'flex', transition:'color .2s' }}>
          <IcoLock size={14}/>
        </div>
        <input type={show?'text':'password'} value={value} onChange={onChange}
          onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
          placeholder={placeholder} required autoFocus={autoFocus}
          style={{
            width:'100%', padding:'14px 46px 14px 44px',
            background:mode==='dark'?(focus?'#060609':'#04050A'):(focus?'#FFF':'#F5F7FF'),
            border:`1.5px solid ${xBorder||(focus?'rgba(207,10,44,.65)':BORDER)}`,
            boxShadow:focus
              ?'0 0 0 3px rgba(207,10,44,.09),0 2px 12px rgba(0,0,0,.2)'
              :'0 2px 8px rgba(0,0,0,.1)',
            color:TEXT, fontSize:13.5, outline:'none', fontFamily:'inherit',
            borderRadius:0, transition:'all .2s', letterSpacing:'.01em',
          }}/>
        <div style={{ position:'absolute', right:0, top:0, bottom:0,
          display:'flex', alignItems:'center', paddingRight:12 }}>
          <EyeBtn show={show} set={setShow} dim={DIM}/>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight:'100vh', background:BG,
      backgroundImage:mode==='dark'?[
        'radial-gradient(ellipse 80% 60% at 18% 28%,rgba(207,10,44,.06) 0%,transparent 60%)',
        'linear-gradient(rgba(255,255,255,.016) 1px,transparent 1px)',
        'linear-gradient(90deg,rgba(255,255,255,.016) 1px,transparent 1px)',
      ].join(','):[
        'radial-gradient(ellipse 80% 60% at 18% 28%,rgba(207,10,44,.04) 0%,transparent 60%)',
        'linear-gradient(rgba(0,0,0,.025) 1px,transparent 1px)',
        'linear-gradient(90deg,rgba(0,0,0,.025) 1px,transparent 1px)',
      ].join(','),
      backgroundSize:'auto,72px 72px,72px 72px',
      display:'flex', flexDirection:'column',
      fontFamily:"'Inter','Barlow',system-ui,sans-serif",
      color:TEXT, transition:'background .3s,color .3s',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&family=Barlow+Condensed:ital,wght@0,700;0,800;0,900&display=swap');
        @keyframes rp-spin  { to{transform:rotate(360deg)} }
        @keyframes rp-in    { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
        @keyframes pulse-rp { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.7)} }
        .rp-btn{background:linear-gradient(135deg,#D90B2E 0%,#CF0A2C 55%,#B50826 100%);
          color:white;border:none;border-top:1px solid rgba(255,255,255,.13);
          padding:14px 32px;font-size:11.5px;font-weight:800;letter-spacing:1.8px;
          text-transform:uppercase;cursor:pointer;transition:all .22s;font-family:inherit;
          display:inline-flex;align-items:center;justify-content:center;gap:9px;width:100%;
          box-shadow:0 4px 20px rgba(207,10,44,.28)}
        .rp-btn:hover:not(:disabled){background:linear-gradient(135deg,#E8102F 0%,#D90B2E 55%,#C00926 100%);
          transform:translateY(-1.5px);box-shadow:0 10px 34px rgba(207,10,44,.48)}
        .rp-btn:disabled{background:rgba(207,10,44,.18);cursor:not-allowed;transform:none;opacity:.55}
        input:-webkit-autofill{
          -webkit-box-shadow:0 0 0 100px ${mode==='dark'?'#04050A':'#FFF'} inset!important;
          -webkit-text-fill-color:${TEXT}!important}
      `}</style>

      {/* HEADER */}
      <header style={{ position:'sticky', top:0, zIndex:100, height:64,
        padding:'0 48px', display:'flex', alignItems:'center',
        justifyContent:'space-between',
        background:mode==='dark'?'rgba(5,5,7,.98)':'rgba(240,242,248,.98)',
        borderBottom:`1px solid ${BORDER}`,
        backdropFilter:'blur(24px) saturate(1.4)', flexShrink:0,
        boxShadow:`0 1px 0 rgba(207,10,44,.07),0 4px 28px rgba(0,0,0,${mode==='dark'?'.5':'.08'})`,
        transition:'background .3s' }}>
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:11, textDecoration:'none' }}>
          <div style={{ width:36, height:36, borderRadius:'50%', overflow:'hidden',
            border:'1.5px solid rgba(207,10,44,.55)',
            boxShadow:'0 0 14px rgba(207,10,44,.22),0 0 0 3px rgba(207,10,44,.06)' }}>
            <img src={logoImg} alt="SpiriComp" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
          </div>
          <div style={{ lineHeight:1 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900,
              fontSize:20, letterSpacing:'-.5px', color:TEXT }}>
              Spiri<span style={{ color:RED }}>Comp</span>
            </div>
            <div style={{ fontSize:8, color:DIM, letterSpacing:4, marginTop:2, fontWeight:700 }}>
              HUAWEI TECHNOLOGIES
            </div>
          </div>
        </Link>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={toggleTheme} style={{
            width:34, height:34, borderRadius:8, border:`1px solid ${BORDER}`,
            background:mode==='dark'?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)',
            color:MUTED, cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', transition:'all .2s' }}>
            {mode==='dark' ? <Sun size={14}/> : <Moon size={14}/>}
          </button>
          <Link to="/login" style={{
            background:'transparent', color:MUTED, border:`1px solid ${BORDER}`,
            padding:'8px 18px', fontSize:10, fontWeight:600, letterSpacing:'1.6px',
            textTransform:'uppercase', textDecoration:'none', display:'inline-flex',
            alignItems:'center', gap:8, transition:'all .2s' }}>
            ← Back to Login
          </Link>
        </div>
      </header>

      {/* BODY */}
      <main style={{ flex:1, display:'flex', alignItems:'center',
        justifyContent:'center', padding:'40px 20px' }}>
        <div style={{ width:'100%', maxWidth:460,
          animation:'rp-in .45s cubic-bezier(.22,.68,0,1.2) both' }}>

          {/* Missing token guard */}
          {!token ? (
            <div style={{ textAlign:'center',
              background:mode==='dark'?'#0F0F12':'#FFF',
              border:`1px solid rgba(207,10,44,.22)`,
              padding:'40px 28px' }}>
              <div style={{ height:3,
                background:`linear-gradient(90deg,${RED},rgba(207,10,44,.12),transparent)`,
                marginBottom:28 }}/>
              <IcoWarn size={40} color={RED}/>
              <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:24,
                fontWeight:900, color:TEXT, margin:'16px 0 8px' }}>
                Invalid Reset Link
              </h2>
              <p style={{ fontSize:13, color:MUTED, lineHeight:1.7, marginBottom:24 }}>
                This password reset link is missing a token.<br/>
                Request a new one from the login page.
              </p>
              <Link to="/login" style={{ display:'inline-flex', alignItems:'center', gap:9,
                background:`linear-gradient(135deg,#D90B2E,#CF0A2C)`, color:'white',
                padding:'12px 28px', fontSize:11, fontWeight:800, letterSpacing:1.8,
                textTransform:'uppercase', textDecoration:'none',
                boxShadow:'0 4px 20px rgba(207,10,44,.28)' }}>
                Go to Login <IcoArrow size={13}/>
              </Link>
            </div>
          ) : (
            <div style={{
              background:mode==='dark'
                ?'linear-gradient(180deg,#0F0F12 0%,#0B0B0F 100%)':'#FFF',
              border:`1px solid ${BORDER}`,
              boxShadow:mode==='dark'
                ?'0 0 0 1px rgba(207,10,44,.07),0 28px 72px rgba(0,0,0,.7)'
                :'0 4px 32px rgba(0,0,0,.1)',
              position:'relative', overflow:'hidden' }}>

              {/* Red accent stripe */}
              <div style={{ height:3,
                background:`linear-gradient(90deg,${RED},rgba(207,10,44,.55) 45%,rgba(207,10,44,.12) 80%,transparent)`,
                boxShadow:'0 0 22px rgba(207,10,44,.45)' }}/>

              {/* Card header */}
              <div style={{ padding:'22px 28px 18px',
                borderBottom:`1px solid ${BORDER}` }}>
                <div style={{ fontSize:9.5, fontWeight:800, color:RED,
                  letterSpacing:'4px', textTransform:'uppercase',
                  display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:20, height:1, background:RED }}/>
                  SECURE ACCESS
                </div>
                <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28,
                  fontWeight:900, letterSpacing:'-1px', lineHeight:1,
                  color:TEXT, marginBottom:5 }}>
                  Reset Password{' — '}
                  <span style={{ color:MUTED, fontWeight:300, fontStyle:'italic' }}>SpiriComp</span>
                </h2>
                <p style={{ fontSize:11, color:DIM, lineHeight:1.6 }}>
                  Enter a new password for your account.
                </p>
              </div>

              {/* Form body */}
              <div style={{ padding:'26px 28px 24px' }}>
                {done ? (
                  /* ── SUCCESS ── */
                  <div style={{ textAlign:'center', padding:'20px 0' }}>
                    <div style={{ width:54, height:54, borderRadius:'50%',
                      background:'rgba(63,185,80,.1)', border:'1px solid rgba(63,185,80,.3)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      margin:'0 auto 16px' }}>
                      <IcoCheck size={24} color="#3FB950"/>
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif",
                      fontSize:22, fontWeight:800, color:TEXT, marginBottom:8 }}>
                      Password Updated
                    </div>
                    <p style={{ fontSize:12, color:MUTED, lineHeight:1.7, marginBottom:22 }}>
                      Your password has been changed successfully.<br/>
                      Redirecting to login…
                    </p>
                    <Link to="/login" style={{ display:'inline-flex', alignItems:'center', gap:9,
                      background:`linear-gradient(135deg,#D90B2E,#CF0A2C)`, color:'white',
                      padding:'12px 28px', fontSize:11, fontWeight:800, letterSpacing:1.8,
                      textTransform:'uppercase', textDecoration:'none',
                      boxShadow:'0 4px 20px rgba(207,10,44,.28)' }}>
                      Go to Login <IcoArrow size={13}/>
                    </Link>
                  </div>
                ) : (
                  /* ── FORM ── */
                  <form onSubmit={handleSubmit}>

                    {error && (
                      <div style={{ display:'flex', alignItems:'center', gap:9,
                        marginBottom:18, background:'rgba(207,10,44,.06)',
                        border:'1px solid rgba(207,10,44,.22)',
                        borderLeft:`3px solid ${RED}`, padding:'10px 14px',
                        fontSize:12, color:REDL }}>
                        <IcoWarn size={13} color={REDL}/>
                        {error}
                      </div>
                    )}

                    <div style={{ marginBottom:18 }}>
                      <FieldLabel>New Password</FieldLabel>
                      <PwInput value={newPw} onChange={e=>{setNewPw(e.target.value);setError(null)}}
                        show={showNew} setShow={setShowNew}
                        placeholder="Min. 8 characters"  autoFocus otherValue={confPw}/>
                      {/* Strength meter */}
                      {newPw.length > 0 && (
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                          <div style={{ flex:1, height:2, background:BORDER,
                            display:'flex', gap:2 }}>
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

                    <div style={{ marginBottom:24 }}>
                      <FieldLabel>Confirm New Password</FieldLabel>
                      <PwInput value={confPw} onChange={e=>{setConfPw(e.target.value);setError(null)}}
                        show={showCnf} setShow={setShowCnf}
                        placeholder="Repeat password" otherValue={newPw}/>
                      {confMismatch && (
                        <div style={{ display:'flex', alignItems:'center', gap:5,
                          marginTop:5, fontSize:11, color:'#F85149' }}>
                          <IcoWarn size={11} color="#F85149"/> Passwords do not match.
                        </div>
                      )}
                      {confMatch && (
                        <div style={{ display:'flex', alignItems:'center', gap:5,
                          marginTop:5, fontSize:11, color:'#3FB950' }}>
                          <IcoCheck size={11} color="#3FB950"/> Passwords match ✓
                        </div>
                      )}
                    </div>

                    <button type="submit" className="rp-btn"
                      disabled={loading||!newPw||!confPw||confMismatch||str<1}>
                      {loading
                        ? <><LoadingDots/> Updating…</>
                        : <><IcoShield size={14} color="#fff"/> Set New Password <IcoArrow size={14}/></>}
                    </button>
                  </form>
                )}
              </div>

              {/* Card footer */}
              <div style={{ padding:'12px 28px 14px', borderTop:`1px solid ${BORDER}`,
                background:mode==='dark'?'rgba(0,0,0,.25)':'rgba(0,0,0,.02)',
                display:'flex', alignItems:'center', justifyContent:'center',
                gap:6, fontSize:11, color:DIM }}>
                Remember your password?{' '}
                <Link to="/login" style={{ color:RED, fontWeight:700, textDecoration:'none',
                  fontSize:11 }}>
                  Sign In
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ height:48, padding:'0 48px', display:'flex',
        alignItems:'center', justifyContent:'space-between',
        borderTop:`1px solid ${BORDER}`,
        background:mode==='dark'?'rgba(5,5,7,.98)':'rgba(240,242,248,.98)',
        flexShrink:0, transition:'background .3s' }}>
        <p style={{ fontSize:10, color:DIM }}>
          © 2026 SpiriComp — Huawei Technologies Tunisia · PFE Engineering · Ouerghi Chaima
        </p>
        <div style={{ display:'inline-flex', alignItems:'center', gap:7,
          border:'1px solid rgba(34,197,94,.16)', background:'rgba(34,197,94,.04)',
          padding:'4px 12px' }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'#22C55E',
            animation:'pulse-rp 2s infinite' }}/>
          <span style={{ fontSize:8.5, color:'rgba(34,197,94,.7)',
            letterSpacing:2, fontWeight:700 }}>API · PORT 8000 · LIVE</span>
        </div>
      </footer>
    </div>
  )
}