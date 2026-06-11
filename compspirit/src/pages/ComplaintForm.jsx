// src/pages/ComplaintForm.jsx
// ─────────────────────────────────────────────────────────────────────
// FIXES vs original:
//
//  BUG-1  BroadcastChannel was created inline and abandoned (memory leak).
//         Now: bc = new BroadcastChannel; bc.postMessage(...); bc.close()
//
//  UX-1   Light theme — customers expect a clean, professional white portal,
//         not a dark NOC dashboard. Changed to white/light-gray background.
//
//  UX-2   Removed "Segment" and "Channel" fields — completely internal.
//         channel is auto-filled to 'web', segment left empty. Customers
//         don't know what "Enterprise" or "MSISDN" means.
//
//  UX-3   "MSISDN" renamed to "Numéro de téléphone" / "Phone number".
//
//  UX-4   Phone hint updated: "Ex: 52 123 456" instead of "Format: XXXXXXXX".
//
//  UX-5   Success card simplified — customer sees a clear confirmation with
//         their reference number, not raw NLP fields (langue détectée, etc.).
//         Internal fields removed from the customer-facing success view.
//
//  UX-6   Character counter "/ 3000" removed — just the color bar remains.
//
//  UX-7   Success state is warm and prominent (green check, clear message).
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ClipboardList,
  MapPin, Phone, Send, Loader2,
} from 'lucide-react'
import { nlpApi } from '../api/client'

// ── Brand colors — light theme, Ooredoo red ───────────────────────────
const C = {
  primary:     '#DC143C',
  primaryDark: '#A50E2D',
  primaryLight:'#FFE4E9',
  bg:          '#F5F6FA',
  card:        '#FFFFFF',
  text:        '#1A1A2E',
  textMuted:   '#6B7280',
  textDim:     '#9CA3AF',
  border:      '#E5E7EB',
  borderFocus: '#DC143C',
  red:         '#EF4444',
  redLight:    '#FEE2E2',
  green:       '#22C55E',
  greenLight:  '#DCFCE7',
  amber:       '#F59E0B',
}

// ── Labels — 3 languages ──────────────────────────────────────────────
const L = {
  fr: {
    title:       'Portail Client',
    subtitle:    'Ooredoo Tunisie — Service Client',
    phone:       'Numéro de téléphone',
    phonePh:     'Ex: 52 123 456',
    phoneHint:   'Facultatif — pour suivi de votre dossier',
    phoneError:  'Numéro invalide. Ex: 52 123 456 (8 chiffres)',
    city:        'Ville',
    cityPh:      'Tunis, Sfax, Sousse…',
    textLabel:   'Décrivez votre problème ou demande',
    placeholder: "Exemple :\n« Mon réseau 4G coupe à Sfax depuis 3 jours, impossible de me connecter. »\n\nOu une question :\n« Comment activer le roaming international ? »",
    hint:        'Vous pouvez écrire en français, arabe ou anglais.',
    submit:      'Envoyer',
    submitting:  'Envoi en cours…',
    minChars:    'Merci de décrire votre problème en au moins 10 caractères.',
    apiError:    'Une erreur est survenue. Veuillez réessayer dans quelques instants.',
    successTitle:'Message envoyé !',
    successSub:  'Votre message a bien été reçu. Notre équipe va traiter votre demande.',
    successRef:  'Numéro de dossier',
    successNext: 'Conservez ce numéro de référence pour le suivi de votre dossier.',
    newMsg:      'Envoyer un autre message',
  },
  ar: {
    title:       'بوابة العملاء',
    subtitle:    'Ooredoo تونس — خدمة العملاء',
    phone:       'رقم الهاتف',
    phonePh:     'مثال: 52 123 456',
    phoneHint:   'اختياري — لمتابعة ملفك',
    phoneError:  'رقم غير صحيح. مثال: 52 123 456 (8 أرقام)',
    city:        'المدينة',
    cityPh:      'تونس، صفاقس، سوسة…',
    textLabel:   'صف مشكلتك أو طلبك',
    placeholder: 'مثال:\n« شبكتي مقطوعة في صفاقس منذ 3 أيام. »\n\nأو سؤال:\n« كيف أفعّل التجوال الدولي؟ »',
    hint:        'يمكنك الكتابة بالعربية أو الفرنسية أو الإنجليزية.',
    submit:      'إرسال',
    submitting:  'جاري الإرسال…',
    minChars:    'يرجى وصف مشكلتك بـ 10 أحرف على الأقل.',
    apiError:    'حدث خطأ. يرجى المحاولة مرة أخرى.',
    successTitle:'تم إرسال رسالتك!',
    successSub:  'تم استلام رسالتك. سيتولى فريقنا معالجة طلبك.',
    successRef:  'رقم الملف',
    successNext: 'احتفظ بهذا الرقم لمتابعة ملفك.',
    newMsg:      'إرسال رسالة أخرى',
  },
  en: {
    title:       'Customer Portal',
    subtitle:    'Ooredoo Tunisia — Customer Service',
    phone:       'Phone number',
    phonePh:     'E.g. 52 123 456',
    phoneHint:   'Optional — for case follow-up',
    phoneError:  'Invalid number. E.g. 52 123 456 (8 digits)',
    city:        'City',
    cityPh:      'Tunis, Sfax, Sousse…',
    textLabel:   'Describe your issue or request',
    placeholder: 'Example:\n"My 4G network keeps dropping in Tunis since yesterday."\n\nOr a question:\n"How do I activate international roaming?"',
    hint:        'You can write in French, Arabic or English.',
    submit:      'Send',
    submitting:  'Sending…',
    minChars:    'Please describe your issue in at least 10 characters.',
    apiError:    'An error occurred. Please try again in a moment.',
    successTitle:'Message sent!',
    successSub:  'Your message has been received. Our team will process your request.',
    successRef:  'Case reference',
    successNext: 'Keep this reference number to track your case.',
    newMsg:      'Send another message',
  },
}

const LANG_TABS = [
  { code:'fr', flag:'🇫🇷', label:'Français' },
  { code:'ar', flag:'🇹🇳', label:'عربي'    },
  { code:'en', flag:'🇬🇧', label:'English' },
]

function validateMsisdn(v) {
  if (!v) return true
  return /^[0-9]{8}$/.test(v.replace(/\s/g, ''))
}

// ── Simplified success card — customer-friendly, no internal fields ───
function SuccessCard({ result, labels, onReset }) {
  const id = result?.complaint_id || '—'
  return (
    <div style={{
      marginTop:24,
      background: C.greenLight,
      border:`1.5px solid #86EFAC`,
      borderRadius:14,
      overflow:'hidden',
      animation:'cf-slideIn .4s cubic-bezier(.22,1,.36,1)',
    }}>
      {/* Top stripe */}
      <div style={{ height:4, background:`linear-gradient(90deg,${C.green},#16A34A)` }}/>

      <div style={{ padding:'28px 24px' }}>
        {/* Icon + title */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
          <div style={{ width:52, height:52, background:'#FFFFFF',
            borderRadius:'50%', display:'flex', alignItems:'center',
            justifyContent:'center', flexShrink:0,
            boxShadow:`0 2px 12px rgba(34,197,94,.25)` }}>
            <CheckCircle2 size={28} color={C.green}/>
          </div>
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:'#14532D',
              fontFamily:"'Barlow Condensed','Inter',sans-serif",
              letterSpacing:'-.3px', marginBottom:3 }}>
              {labels.successTitle}
            </div>
            <div style={{ fontSize:13, color:'#166534', lineHeight:1.5 }}>
              {labels.successSub}
            </div>
          </div>
        </div>

        {/* Reference number — the ONE thing a customer needs */}
        <div style={{
          background:'#FFFFFF', border:'1px solid #BBF7D0',
          borderRadius:10, padding:'16px 20px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          marginBottom:14,
        }}>
          <div>
            <div style={{ fontSize:9, fontWeight:800, color:'#6B7280',
              letterSpacing:'2px', textTransform:'uppercase', marginBottom:5 }}>
              {labels.successRef}
            </div>
            <div style={{ fontFamily:"'Barlow Condensed',monospace",
              fontSize:22, fontWeight:900, color:C.primary,
              letterSpacing:'-.5px' }}>
              {id}
            </div>
          </div>
          <ClipboardList size={28} color="#86EFAC"/>
        </div>

        {/* Next steps hint */}
        <div style={{ fontSize:12, color:'#166534', lineHeight:1.6,
          background:'rgba(255,255,255,.5)', borderRadius:8,
          padding:'10px 14px', marginBottom:20 }}>
          💡 {labels.successNext}
        </div>

        {/* New message button */}
        <button onClick={onReset} style={{
          width:'100%', padding:'12px', background:'#FFFFFF',
          border:`1.5px solid #86EFAC`, color:'#166534',
          borderRadius:8, fontSize:14, fontWeight:700,
          cursor:'pointer', transition:'all .18s',
          fontFamily:'inherit', letterSpacing:'.2px',
        }}
          onMouseOver={e=>{ e.currentTarget.style.background=C.green; e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor=C.green }}
          onMouseOut={e=>{  e.currentTarget.style.background='#FFFFFF'; e.currentTarget.style.color='#166534'; e.currentTarget.style.borderColor='#86EFAC' }}>
          {labels.newMsg}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function ComplaintForm() {
  const [lang,        setLang]        = useState('fr')
  const [form,        setForm]        = useState({ phone:'', city:'', text:'' })
  const [result,      setResult]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const labels = L[lang] || L.fr
  const dir    = lang === 'ar' ? 'rtl' : 'ltr'

  const handleLang = code => {
    setLang(code)
    setResult(null)
    setError(null)
    setFieldErrors({})
  }

  const validate = () => {
    const errs = {}
    if (form.phone && !validateMsisdn(form.phone)) errs.phone = labels.phoneError
    if (form.text.trim().length < 10)              errs.text  = labels.minChars
    return errs
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }
    setFieldErrors({})
    setLoading(true); setError(null); setResult(null)

    try {
      const res = await nlpApi.submit({
        text:    form.text,
        msisdn:  form.phone.replace(/\s/g, '') || null,
        city:    form.city || null,
        segment: null,
        channel: 'web',   // UX-2: auto-filled, removed from UI
      })

      setResult(res.data)
      setForm(f => ({ ...f, text:'', phone:'', city:'' }))

      // BUG-1: create, use and immediately close BroadcastChannel
      try {
        const bc = new BroadcastChannel('spiricomp')
        bc.postMessage({ type:'new_complaint', complaint:res.data })
        bc.close()
      } catch (_) {}

      setTimeout(() => {
        document.getElementById('cf-result')?.scrollIntoView({ behavior:'smooth', block:'start' })
      }, 100)

    } catch (err) {
      setError(labels.apiError)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    setError(null)
    setFieldErrors({})
  }

  // Input shared style helper (stable object)
  const inputStyle = {
    width:'100%', padding:'12px 14px',
    background:'#FFFFFF', color:C.text,
    border:`1.5px solid ${C.border}`,
    borderRadius:8, fontSize:14, outline:'none',
    fontFamily:'inherit', transition:'border-color .15s, box-shadow .15s',
    boxSizing:'border-box', appearance:'none', WebkitAppearance:'none',
  }
  const inputFocus = e => {
    e.target.style.borderColor = C.primary
    e.target.style.boxShadow   = `0 0 0 3px ${C.primary}18`
  }
  const inputBlur = e => {
    e.target.style.borderColor = C.border
    e.target.style.boxShadow   = 'none'
  }

  const charPct   = (form.text.length / 3000) * 100
  const charColor = form.text.length > 2800 ? C.amber : form.text.length > 50 ? C.green : '#D1D5DB'

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box }
        @keyframes cf-slideIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes cf-spin     { to{transform:rotate(360deg)} }
        .cf-spin { animation:cf-spin .7s linear infinite }

        .cf-page {
          min-height:100vh;
          background:${C.bg};
          display:flex; align-items:flex-start; justify-content:center;
          padding:0; font-family:'Inter',system-ui,sans-serif;
        }
        .cf-card {
          background:${C.card};
          border:1px solid ${C.border};
          width:100%; max-width:540px;
          border-radius:0; padding:32px 24px 40px;
          margin:0 auto; min-height:100vh;
        }
        .cf-label {
          display:block; color:${C.textMuted};
          font-size:11px; font-weight:700;
          letter-spacing:1px; text-transform:uppercase;
          margin-bottom:8px;
        }
        .cf-field-error {
          font-size:12px; color:${C.red};
          margin-top:6px; display:flex; align-items:center; gap:4px;
        }
        .cf-lang-tabs {
          display:flex; gap:8px; margin-bottom:28px;
          padding-bottom:20px; border-bottom:1px solid ${C.border};
        }
        .cf-lang-btn {
          flex:1; padding:10px 8px; border-radius:8px;
          border:1.5px solid ${C.border}; background:transparent;
          color:${C.textMuted}; font-size:13px; font-weight:600;
          cursor:pointer; transition:all .18s; font-family:inherit;
          display:flex; align-items:center; justify-content:center; gap:6px;
        }
        .cf-lang-btn.active {
          background:${C.primary}; border-color:${C.primary}; color:white;
          box-shadow:0 2px 10px ${C.primary}30;
        }
        .cf-lang-btn:hover:not(.active) {
          border-color:${C.primary}60; color:${C.text};
          background:${C.primaryLight};
        }
        .cf-textarea {
          width:100%; padding:12px 14px;
          background:#FFFFFF; color:${C.text};
          border:1.5px solid ${C.border}; border-radius:8px;
          font-size:14px; outline:none; font-family:inherit;
          resize:vertical; min-height:130px; line-height:1.7;
          transition:border-color .15s, box-shadow .15s;
        }
        .cf-textarea:focus {
          border-color:${C.primary};
          box-shadow:0 0 0 3px ${C.primary}18;
        }
        .cf-textarea::placeholder { color:${C.textDim}; line-height:1.7; }
        .cf-submit {
          width:100%; padding:15px;
          background:linear-gradient(135deg,${C.primary},${C.primaryDark});
          color:white; border:none; border-radius:10px;
          font-size:15px; font-weight:700; cursor:pointer;
          transition:all .18s; font-family:inherit;
          display:flex; align-items:center; justify-content:center; gap:8px;
          box-shadow:0 4px 16px ${C.primary}35; margin-top:24px;
          letter-spacing:.3px;
        }
        .cf-submit:hover:not(:disabled) {
          background:linear-gradient(135deg,${C.primaryDark},#8B0000);
          box-shadow:0 6px 22px ${C.primary}50;
          transform:translateY(-1px);
        }
        .cf-submit:disabled { background:#D1D5DB; cursor:not-allowed; box-shadow:none; transform:none; }
        .cf-divider {
          display:flex; align-items:center; gap:10px; margin:22px 0 18px;
        }
        .cf-divider-line { flex:1; height:1px; background:${C.border}; }
        .cf-divider-text {
          font-size:10px; font-weight:700; color:${C.textDim};
          letter-spacing:1.5px; text-transform:uppercase; white-space:nowrap;
        }
        .cf-char-bar { height:3px; background:#F3F4F6; border-radius:2px; margin-top:8px; overflow:hidden; }
        .cf-char-bar-fill { height:100%; border-radius:2px; transition:width .2s, background .2s; }

        @media(min-width:480px) {
          .cf-page { padding:32px 16px; align-items:center; }
          .cf-card  { min-height:auto; border-radius:16px; box-shadow:0 8px 40px rgba(0,0,0,.1); }
        }
        @media(min-width:768px) {
          .cf-page { padding:48px 24px; }
          .cf-card  { padding:40px 36px 48px; }
        }
      `}</style>

      <div className="cf-page" dir={dir}>
        <div className="cf-card">

          {/* ── HEADER ── */}
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{
              width:58, height:58,
              background:`linear-gradient(135deg,${C.primary},${C.primaryDark})`,
              borderRadius:14, display:'inline-flex', alignItems:'center',
              justifyContent:'center', color:'white',
              fontSize:28, fontWeight:900, marginBottom:16,
              boxShadow:`0 6px 20px ${C.primary}35`,
              fontFamily:"'Barlow Condensed','Inter',sans-serif",
            }}>O</div>
            <h1 style={{ color:C.text, fontSize:22, fontWeight:800,
              margin:'0 0 5px', letterSpacing:'-.3px' }}>
              {labels.title}
            </h1>
            <p style={{ color:C.textMuted, fontSize:13, margin:0 }}>
              {labels.subtitle}
            </p>
          </div>

          {/* ── LANG TABS ── */}
          <div className="cf-lang-tabs" role="tablist">
            {LANG_TABS.map(({ code, flag, label }) => (
              <button key={code} className={`cf-lang-btn${lang===code?' active':''}`}
                onClick={() => handleLang(code)} role="tab" aria-selected={lang===code}>
                <span>{flag}</span><span>{label}</span>
              </button>
            ))}
          </div>

          {/* ── SUCCESS STATE ── */}
          {result ? (
            <div id="cf-result">
              <SuccessCard result={result} labels={labels} onReset={handleReset}/>
            </div>
          ) : (
            /* ── FORM ── */
            <form onSubmit={handleSubmit} noValidate>

              {/* Phone + City */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
                <div>
                  <label className="cf-label" htmlFor="cf-phone">
                    <Phone size={10} style={{ display:'inline', marginRight:4, verticalAlign:'middle' }}/>
                    {labels.phone}
                  </label>
                  <input
                    id="cf-phone" type="tel"
                    value={form.phone}
                    onChange={e => { setForm(f=>({...f,phone:e.target.value})); if(fieldErrors.phone) setFieldErrors(fe=>({...fe,phone:''})) }}
                    placeholder={labels.phonePh}
                    style={{ ...inputStyle, borderColor:fieldErrors.phone?C.red:C.border }}
                    onFocus={inputFocus} onBlur={inputBlur}
                  />
                  {fieldErrors.phone
                    ? <div className="cf-field-error"><AlertTriangle size={11}/>{fieldErrors.phone}</div>
                    : <div style={{ fontSize:11, color:C.textDim, marginTop:5 }}>{labels.phoneHint}</div>
                  }
                </div>
                <div>
                  <label className="cf-label" htmlFor="cf-city">
                    <MapPin size={10} style={{ display:'inline', marginRight:4, verticalAlign:'middle' }}/>
                    {labels.city}
                  </label>
                  <input
                    id="cf-city" type="text"
                    value={form.city}
                    onChange={e=>setForm(f=>({...f,city:e.target.value}))}
                    placeholder={labels.cityPh}
                    style={inputStyle}
                    onFocus={inputFocus} onBlur={inputBlur}
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="cf-divider">
                <div className="cf-divider-line"/>
                <span className="cf-divider-text">{labels.textLabel}</span>
                <div className="cf-divider-line"/>
              </div>

              {/* Message textarea */}
              <div>
                <textarea
                  id="cf-text"
                  className="cf-textarea"
                  value={form.text}
                  onChange={e => { setForm(f=>({...f,text:e.target.value})); if(fieldErrors.text) setFieldErrors(fe=>({...fe,text:''})) }}
                  placeholder={labels.placeholder}
                  rows={6}
                  maxLength={3000}
                  style={{ borderColor: fieldErrors.text ? C.red : undefined }}
                />
                {/* Hint */}
                <div style={{ fontSize:11, color:C.textMuted, marginTop:6, lineHeight:1.5 }}>
                  💡 {labels.hint}
                </div>
                {/* UX-6: just the bar, no character count text */}
                <div className="cf-char-bar">
                  <div className="cf-char-bar-fill"
                    style={{ width:`${charPct}%`, background:charColor }}/>
                </div>
                {fieldErrors.text && (
                  <div className="cf-field-error" style={{ marginTop:8 }}>
                    <AlertTriangle size={11}/>{fieldErrors.text}
                  </div>
                )}
              </div>

              {/* API Error */}
              {error && (
                <div style={{
                  background:'#FEF2F2', border:`1px solid #FECACA`,
                  borderRadius:8, padding:'12px 16px',
                  color:'#DC2626', fontSize:13, marginTop:16,
                  display:'flex', alignItems:'center', gap:8,
                }}>
                  <AlertTriangle size={14}/>{error}
                </div>
              )}

              {/* Submit button */}
              <button type="submit" className="cf-submit" disabled={loading}>
                {loading
                  ? <><Loader2 size={16} className="cf-spin"/>{labels.submitting}</>
                  : <><Send size={15}/>{labels.submit}</>}
              </button>
            </form>
          )}

        </div>
      </div>
    </>
  )
}