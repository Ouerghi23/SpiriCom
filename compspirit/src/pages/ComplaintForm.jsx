// src/pages/ComplaintForm.jsx
// ─────────────────────────────────────────────────────────────────────
// v2 changes:
//  CF-S1  Segment selector added — "Particulier" (default) / "Entreprise"
//         Styled as two pill buttons, trilingual labels.
//  CF-S2  Segment passed to API and to Telegram notifier via segment field.
//  All previous UX fixes (BUG-1, UX-1..UX-7) preserved.
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ClipboardList,
  MapPin, Phone, Send, Loader2, User, Building2,
} from 'lucide-react'
import { nlpApi } from '../api/client'

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

const L = {
  fr: {
    title:          'Portail Client',
    subtitle:       'Ooredoo Tunisie — Service Client',
    phone:          'Numéro de téléphone',
    phonePh:        'Ex: 52 123 456',
    phoneHint:      'Facultatif — pour suivi de votre dossier',
    phoneError:     'Numéro invalide. Ex: 52 123 456 (8 chiffres)',
    city:           'Ville',
    cityPh:         'Tunis, Sfax, Sousse…',
    segmentLabel:   'Type de client',
    segSimple:      'Particulier',
    segEnterprise:  'Entreprise',
    textLabel:      'Décrivez votre problème ou demande',
    placeholder:    "Exemple :\n« Mon réseau 4G coupe à Sfax depuis 3 jours. »\n\nOu une question :\n« Comment activer le roaming international ? »",
    hint:           'Vous pouvez écrire en français, arabe ou anglais.',
    submit:         'Envoyer',
    submitting:     'Envoi en cours…',
    minChars:       'Merci de décrire votre problème en au moins 10 caractères.',
    apiError:       'Une erreur est survenue. Veuillez réessayer.',
    successTitle:   'Message envoyé !',
    successSub:     'Votre message a bien été reçu. Notre équipe va traiter votre demande.',
    successRef:     'Numéro de dossier',
    successNext:    'Conservez ce numéro de référence pour le suivi de votre dossier.',
    newMsg:         'Envoyer un autre message',
  },
  ar: {
    title:          'بوابة العملاء',
    subtitle:       'Ooredoo تونس — خدمة العملاء',
    phone:          'رقم الهاتف',
    phonePh:        'مثال: 52 123 456',
    phoneHint:      'اختياري — لمتابعة ملفك',
    phoneError:     'رقم غير صحيح. مثال: 52 123 456 (8 أرقام)',
    city:           'المدينة',
    cityPh:         'تونس، صفاقس، سوسة…',
    segmentLabel:   'نوع العميل',
    segSimple:      'فرد',
    segEnterprise:  'شركة',
    textLabel:      'صف مشكلتك أو طلبك',
    placeholder:    'مثال:\n« شبكتي مقطوعة في صفاقس منذ 3 أيام. »',
    hint:           'يمكنك الكتابة بالعربية أو الفرنسية أو الإنجليزية.',
    submit:         'إرسال',
    submitting:     'جاري الإرسال…',
    minChars:       'يرجى وصف مشكلتك بـ 10 أحرف على الأقل.',
    apiError:       'حدث خطأ. يرجى المحاولة مرة أخرى.',
    successTitle:   'تم إرسال رسالتك!',
    successSub:     'تم استلام رسالتك. سيتولى فريقنا معالجة طلبك.',
    successRef:     'رقم الملف',
    successNext:    'احتفظ بهذا الرقم لمتابعة ملفك.',
    newMsg:         'إرسال رسالة أخرى',
  },
  en: {
    title:          'Customer Portal',
    subtitle:       'Ooredoo Tunisia — Customer Service',
    phone:          'Phone number',
    phonePh:        'E.g. 52 123 456',
    phoneHint:      'Optional — for case follow-up',
    phoneError:     'Invalid number. E.g. 52 123 456 (8 digits)',
    city:           'City',
    cityPh:         'Tunis, Sfax, Sousse…',
    segmentLabel:   'Customer type',
    segSimple:      'Individual',
    segEnterprise:  'Enterprise',
    textLabel:      'Describe your issue or request',
    placeholder:    'Example:\n"My 4G network keeps dropping in Tunis since yesterday."\n\nOr a question:\n"How do I activate international roaming?"',
    hint:           'You can write in French, Arabic or English.',
    submit:         'Send',
    submitting:     'Sending…',
    minChars:       'Please describe your issue in at least 10 characters.',
    apiError:       'An error occurred. Please try again.',
    successTitle:   'Message sent!',
    successSub:     'Your message has been received. Our team will process your request.',
    successRef:     'Case reference',
    successNext:    'Keep this reference number to track your case.',
    newMsg:         'Send another message',
  },
}

const LANG_TABS = [
  { code:'fr', flag:'🇫🇷', label:'Français' },
  { code:'ar', flag:'🇹🇳', label:'عربي'    },
  { code:'en', flag:'🇬🇧', label:'English' },
]

// CF-S1: segment options
const SEGMENTS = [
  { value: 'simple_user', icon: User,      labelKey: 'segSimple'     },
  { value: 'enterprise',  icon: Building2, labelKey: 'segEnterprise' },
]

function validateMsisdn(v) {
  if (!v) return true
  return /^[0-9]{8}$/.test(v.replace(/\s/g, ''))
}

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
      <div style={{ height:4, background:`linear-gradient(90deg,${C.green},#16A34A)` }}/>
      <div style={{ padding:'28px 24px' }}>
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
        <div style={{ fontSize:12, color:'#166534', lineHeight:1.6,
          background:'rgba(255,255,255,.5)', borderRadius:8,
          padding:'10px 14px', marginBottom:20 }}>
          💡 {labels.successNext}
        </div>
        <button onClick={onReset} style={{
          width:'100%', padding:'12px', background:'#FFFFFF',
          border:`1.5px solid #86EFAC`, color:'#166534',
          borderRadius:8, fontSize:14, fontWeight:700,
          cursor:'pointer', transition:'all .18s', fontFamily:'inherit',
        }}
          onMouseOver={e=>{ e.currentTarget.style.background=C.green; e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor=C.green }}
          onMouseOut={e=>{ e.currentTarget.style.background='#FFFFFF'; e.currentTarget.style.color='#166534'; e.currentTarget.style.borderColor='#86EFAC' }}>
          {labels.newMsg}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
export default function ComplaintForm() {
  const [lang,        setLang]        = useState('fr')
  const [form,        setForm]        = useState({ phone:'', city:'', text:'' })
  const [segment,     setSegment]     = useState('simple_user')   // CF-S1
  const [result,      setResult]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const labels = L[lang] || L.fr
  const dir    = lang === 'ar' ? 'rtl' : 'ltr'

  const handleLang = code => {
    setLang(code); setResult(null); setError(null); setFieldErrors({})
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
    setFieldErrors({}); setLoading(true); setError(null); setResult(null)
    try {
      const res = await nlpApi.submit({
        text:    form.text,
        msisdn:  form.phone.replace(/\s/g, '') || null,
        city:    form.city || null,
        segment: segment,    // CF-S2: pass segment to backend
        channel: 'web',
      })
      setResult(res.data)
      setForm(f => ({ ...f, text:'', phone:'', city:'' }))
      setSegment('simple_user')
      try {
        const bc = new BroadcastChannel('spiricomp')
        bc.postMessage({ type:'new_complaint', complaint:res.data })
        bc.close()
      } catch (_) {}
      setTimeout(() => {
        document.getElementById('cf-result')?.scrollIntoView({ behavior:'smooth', block:'start' })
      }, 100)
    } catch {
      setError(labels.apiError)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => { setResult(null); setError(null); setFieldErrors({}) }

  const inputStyle = {
    width:'100%', padding:'12px 14px',
    background:'#FFFFFF', color:C.text,
    border:`1.5px solid ${C.border}`,
    borderRadius:8, fontSize:14, outline:'none',
    fontFamily:'inherit', transition:'border-color .15s, box-shadow .15s',
    boxSizing:'border-box',
  }
  const inputFocus = e => { e.target.style.borderColor=C.primary; e.target.style.boxShadow=`0 0 0 3px ${C.primary}18` }
  const inputBlur  = e => { e.target.style.borderColor=C.border;  e.target.style.boxShadow='none' }

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
          min-height:100vh; background:${C.bg};
          display:flex; align-items:flex-start; justify-content:center;
          padding:0; font-family:'Inter',system-ui,sans-serif;
        }
        .cf-card {
          background:${C.card}; border:1px solid ${C.border};
          width:100%; max-width:540px; border-radius:0;
          padding:32px 24px 40px; margin:0 auto; min-height:100vh;
        }
        .cf-label {
          display:block; color:${C.textMuted}; font-size:11px;
          font-weight:700; letter-spacing:1px; text-transform:uppercase;
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
        .cf-lang-btn.active { background:${C.primary}; border-color:${C.primary}; color:white; }
        .cf-lang-btn:hover:not(.active) { border-color:${C.primary}60; color:${C.text}; background:${C.primaryLight}; }

        /* CF-S1: segment pill buttons */
        .cf-seg-btn {
          flex:1; padding:11px 10px; border-radius:8px;
          border:1.5px solid ${C.border}; background:transparent;
          color:${C.textMuted}; font-size:13px; font-weight:600;
          cursor:pointer; transition:all .18s; font-family:inherit;
          display:flex; align-items:center; justify-content:center; gap:7px;
        }
        .cf-seg-btn.active {
          border-color:${C.primary}; color:${C.primary};
          background:${C.primaryLight};
          box-shadow: 0 0 0 2px ${C.primary}22;
        }
        .cf-seg-btn:hover:not(.active) { border-color:${C.primary}60; color:${C.text}; }

        .cf-textarea {
          width:100%; padding:12px 14px; background:#FFFFFF; color:${C.text};
          border:1.5px solid ${C.border}; border-radius:8px;
          font-size:14px; outline:none; font-family:inherit;
          resize:vertical; min-height:130px; line-height:1.7;
          transition:border-color .15s, box-shadow .15s;
        }
        .cf-textarea:focus { border-color:${C.primary}; box-shadow:0 0 0 3px ${C.primary}18; }
        .cf-textarea::placeholder { color:${C.textDim}; line-height:1.7; }
        .cf-submit {
          width:100%; padding:15px;
          background:linear-gradient(135deg,${C.primary},${C.primaryDark});
          color:white; border:none; border-radius:10px;
          font-size:15px; font-weight:700; cursor:pointer;
          transition:all .18s; font-family:inherit;
          display:flex; align-items:center; justify-content:center; gap:8px;
          box-shadow:0 4px 16px ${C.primary}35; margin-top:24px; letter-spacing:.3px;
        }
        .cf-submit:hover:not(:disabled) {
          background:linear-gradient(135deg,${C.primaryDark},#8B0000);
          box-shadow:0 6px 22px ${C.primary}50; transform:translateY(-1px);
        }
        .cf-submit:disabled { background:#D1D5DB; cursor:not-allowed; box-shadow:none; transform:none; }
        .cf-divider { display:flex; align-items:center; gap:10px; margin:22px 0 18px; }
        .cf-divider-line { flex:1; height:1px; background:${C.border}; }
        .cf-divider-text { font-size:10px; font-weight:700; color:${C.textDim}; letter-spacing:1.5px; text-transform:uppercase; white-space:nowrap; }
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

          {/* Header */}
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

          {/* Lang tabs */}
          <div className="cf-lang-tabs" role="tablist">
            {LANG_TABS.map(({ code, flag, label }) => (
              <button key={code} className={`cf-lang-btn${lang===code?' active':''}`}
                onClick={() => handleLang(code)} role="tab" aria-selected={lang===code}>
                <span>{flag}</span><span>{label}</span>
              </button>
            ))}
          </div>

          {/* Success */}
          {result ? (
            <div id="cf-result">
              <SuccessCard result={result} labels={labels} onReset={handleReset}/>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>

              {/* Phone + City */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
                <div>
                  <label className="cf-label" htmlFor="cf-phone">
                    <Phone size={10} style={{ display:'inline', marginRight:4, verticalAlign:'middle' }}/>
                    {labels.phone}
                  </label>
                  <input
                    id="cf-phone" type="tel" value={form.phone}
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
                    id="cf-city" type="text" value={form.city}
                    onChange={e=>setForm(f=>({...f,city:e.target.value}))}
                    placeholder={labels.cityPh}
                    style={inputStyle}
                    onFocus={inputFocus} onBlur={inputBlur}
                  />
                </div>
              </div>

              {/* CF-S1: Segment selector */}
              <div style={{ marginBottom:20 }}>
                <label className="cf-label">
                  {labels.segmentLabel}
                </label>
                <div style={{ display:'flex', gap:10 }}
                  role="radiogroup" aria-label={labels.segmentLabel}>
                  {SEGMENTS.map(s => {
                    const Icon   = s.icon
                    const active = segment === s.value
                    return (
                      <button
                        key={s.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`cf-seg-btn${active ? ' active' : ''}`}
                        onClick={() => setSegment(s.value)}>
                        <Icon size={15}/>
                        {labels[s.labelKey]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Divider */}
              <div className="cf-divider">
                <div className="cf-divider-line"/>
                <span className="cf-divider-text">{labels.textLabel}</span>
                <div className="cf-divider-line"/>
              </div>

              {/* Textarea */}
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
                <div style={{ fontSize:11, color:C.textMuted, marginTop:6, lineHeight:1.5 }}>
                  💡 {labels.hint}
                </div>
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

              {/* Submit */}
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