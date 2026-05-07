// src/pages/ComplaintForm.jsx
import { useState } from 'react';
import { nlpApi } from '../api/client';

const C = {
  primary: '#DC143C',
  bg: '#0A0A0F',
  surface: '#111118',
  text: '#F1F1F3',
  textMuted: '#71717A',
  border: 'rgba(255,255,255,0.06)',
  green: '#22C55E',
  red: '#EF4444',
};

const LABELS = {
  fr: {
    title: 'Formulaire de Réclamation',
    subtitle: 'Ooredoo Tunisia — Service Client',
    msisdn: 'Numéro MSISDN',
    city: 'Ville',
    segment: 'Segment',
    channel: 'Canal',
    text: 'Décrivez votre problème *',
    placeholder: 'Ex: Mon réseau 4G coupe à Sfax depuis 3 jours...',
    hint: 'Minimum 10 caractères — langue détectée automatiquement',
    submit: 'Soumettre la réclamation',
    submitting: '⏳ Analyse en cours...',
    success: 'Réclamation enregistrée avec succès !',
    error: 'Erreur lors de la soumission. Veuillez réessayer.',
  },
  ar: {
    title: 'نموذج الشكوى',
    subtitle: 'Ooredoo تونس — خدمة العملاء',
    msisdn: 'رقم الهاتف',
    city: 'المدينة',
    segment: 'الشريحة',
    channel: 'القناة',
    text: 'اشرح مشكلتك *',
    placeholder: 'مثال: شبكتي مقطوعة في تونس منذ 3 أيام...',
    hint: '10 أحرف على الأقل — اللغة تُكشف تلقائياً',
    submit: 'إرسال الشكوى',
    submitting: '⏳ جاري التحليل...',
    success: 'تم تسجيل الشكوى بنجاح!',
    error: 'خطأ في الإرسال. يرجى المحاولة مرة أخرى.',
  },
  en: {
    title: 'Complaint Form',
    subtitle: 'Ooredoo Tunisia — Customer Service',
    msisdn: 'MSISDN Number',
    city: 'City',
    segment: 'Segment',
    channel: 'Channel',
    text: 'Describe your problem *',
    placeholder: 'Ex: My 4G network keeps dropping in Tunis...',
    hint: 'Minimum 10 characters — language auto-detected',
    submit: 'Submit Complaint',
    submitting: '⏳ Analyzing...',
    success: 'Complaint registered successfully!',
    error: 'Submission error. Please try again.',
  },
};

export default function ComplaintForm() {
  const [lang, setLang] = useState('fr');
  const [form, setForm] = useState({
    msisdn: '',
    city: '',
    segment: '',
    channel: 'web',
    text: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const L = LABELS[lang];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.text.trim().length < 10) {
      setError('Minimum 10 caractères requis / 10 أحرف على الأقل / Minimum 10 characters');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await nlpApi.submit({
        text: form.text,
        msisdn: form.msisdn || null,
        city: form.city || null,
        segment: form.segment || null,
        channel: form.channel,
      });

      setResult(res.data);
      setForm({ msisdn: '', city: '', segment: '', channel: 'web', text: '' });
    } catch (err) {
      setError(L.error);
      console.error('Submit error:', err);
    } finally {
      setLoading(false);
    }
  };

  const urgencyBadge = (level) => {
    const colors = {
      'très urgent': { bg: 'rgba(239,68,68,0.15)', color: '#FCA5A5', border: 'rgba(239,68,68,0.3)' },
      'urgent': { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: 'rgba(245,158,11,0.3)' },
      'normal': { bg: 'rgba(34,197,94,0.15)', color: '#6EE7B7', border: 'rgba(34,197,94,0.3)' },
    };
    const s = colors[level] || colors['normal'];
    return { background: s.bg, color: s.color, border: `1px solid ${s.border}` };
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: "'Inter', 'Barlow', sans-serif",
    }}>
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: '36px 32px',
        width: '100%',
        maxWidth: 560,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52,
            background: 'linear-gradient(135deg, #DC143C, #8B0000)',
            borderRadius: 12,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 24,
            fontWeight: 800,
            marginBottom: 12,
          }}>
            O
          </div>
          <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
            {L.title}
          </h1>
          <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>
            {L.subtitle}
          </p>
        </div>

        {/* Language Tabs */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 24,
          borderBottom: `2px solid ${C.border}`,
          paddingBottom: 12,
        }}>
          {[
            { code: 'fr', label: '🇫🇷 Français' },
            { code: 'ar', label: '🇹🇳 عربي' },
            { code: 'en', label: '🇬🇧 English' },
          ].map(({ code, label }) => (
            <button
              key={code}
              onClick={() => setLang(code)}
              style={{
                padding: '8px 18px',
                borderRadius: 20,
                border: `1.5px solid ${lang === code ? C.primary : C.border}`,
                background: lang === code ? C.primary : 'transparent',
                color: lang === code ? 'white' : C.textMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .2s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* MSISDN + City row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{
                display: 'block', color: C.textMuted, fontSize: 10,
                fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                {L.msisdn}
              </label>
              <input
                type="text"
                value={form.msisdn}
                onChange={e => setForm({ ...form, msisdn: e.target.value })}
                placeholder="216XXXXXXXX"
                style={{
                  width: '100%', padding: '10px 14px',
                  background: C.bg, color: C.text,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
            <div>
              <label style={{
                display: 'block', color: C.textMuted, fontSize: 10,
                fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                {L.city}
              </label>
              <input
                type="text"
                value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })}
                placeholder="Tunis, Sfax, تونس..."
                style={{
                  width: '100%', padding: '10px 14px',
                  background: C.bg, color: C.text,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          {/* Segment + Channel row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{
                display: 'block', color: C.textMuted, fontSize: 10,
                fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                {L.segment}
              </label>
              <select
                value={form.segment}
                onChange={e => setForm({ ...form, segment: e.target.value })}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: C.bg, color: C.text,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, outline: 'none', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <option value="">--</option>
                <option>Standard</option>
                <option>Premium</option>
                <option>Enterprise</option>
                <option>VIP</option>
              </select>
            </div>
            <div>
              <label style={{
                display: 'block', color: C.textMuted, fontSize: 10,
                fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                {L.channel}
              </label>
              <select
                value={form.channel}
                onChange={e => setForm({ ...form, channel: e.target.value })}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: C.bg, color: C.text,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, outline: 'none', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <option value="web">{lang === 'ar' ? 'البوابة' : 'Portail Web'}</option>
                <option value="app">{lang === 'ar' ? 'تطبيق' : 'App Mobile'}</option>
                <option value="social">{lang === 'ar' ? 'اجتماعي' : 'Réseaux Sociaux'}</option>
              </select>
            </div>
          </div>

          {/* Complaint Text */}
          <div style={{ marginBottom: 8 }}>
            <label style={{
              display: 'block', color: C.textMuted, fontSize: 10,
              fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              {L.text}
            </label>
            <textarea
              value={form.text}
              onChange={e => setForm({ ...form, text: e.target.value })}
              placeholder={L.placeholder}
              rows={5}
              required
              style={{
                width: '100%', padding: '12px 14px',
                background: C.bg, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 8,
                fontSize: 13, outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.6,
              }}
            />
            <p style={{ color: C.textMuted, fontSize: 10, marginTop: 4 }}>
              {L.hint}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#FCA5A5',
              fontSize: 12,
              marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#666' : C.primary,
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all .2s',
              fontFamily: 'inherit',
              letterSpacing: '0.3px',
            }}
          >
            {loading ? L.submitting : L.submit}
          </button>
        </form>

        {/* Result */}
        {result && (
          <div style={{
            marginTop: 20,
            padding: 20,
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 12,
          }}>
            <div style={{ color: C.green, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              ✅ {L.success}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'ID', value: result.complaint_id },
                { label: 'Langue', value: result.language_detected },
                { label: 'Catégorie', value: result.category },
                { label: 'Sentiment', value: result.sentiment },
                { label: 'Urgence', value: result.urgency_level },
                { label: 'Score', value: result.urgency_score?.toFixed(2) },
                { label: 'Ville détectée', value: result.city_detected || '—' },
                { label: 'Délai réponse', value: `${result.estimated_response_hours}h` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <span style={{ color: C.textMuted, fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {label}
                  </span>
                  <div style={{
                    color: C.text, fontSize: 12, fontWeight: 600, marginTop: 2,
                    ...(label === 'Urgence' ? urgencyBadge(result.urgency_level) : {}),
                    padding: label === 'Urgence' ? '2px 8px' : 0,
                    borderRadius: label === 'Urgence' ? 12 : 0,
                    display: label === 'Urgence' ? 'inline-block' : 'block',
                  }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
            
            <p style={{ color: C.textMuted, fontSize: 11, marginTop: 12, fontStyle: 'italic' }}>
              {result.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}