// src/pages/admin/ManageUsers.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom Admin — Working Hours + User CRUD (v2)
// Backend: GET|POST|PATCH|DELETE /api/admin/users
//          PATCH /api/admin/users/:id/shift|checkin|checkout|reset-hours
//
// MIGRATION (vs previous version):
//  MU-1  LEGACY RED PURGED: UserModal was still themed with the old
//        #CF0A2C / #FF4060 family (accent line, header, error box,
//        submit gradient). The modal is admin chrome → blue, matching
//        ShiftModal; errors use ALARM.critical.
//  MU-2  ALL EMOJIS REMOVED: role options (wrench/eye/shield), status
//        options (check/no-entry), "Generate password" bolt, and every
//        toast message (check/red-dot/refresh/calendar/pencil). Toasts
//        already carry Lucide icons; the ● / ○ status glyphs are dot
//        spans now.
//  MU-3  Severity tokens: destructive red #EF4444 → ALARM.critical;
//        status/on-shift green #00E5A0 → ALARM.normal; HoursBar ladder
//        → normal/blue/minor/major (bottom tier was RED — every
//        engineer looked critical at the start of their shift).
//        ROLE_META: admin → HW.red (brand chrome, matches the admin
//        avatar ring convention), engineer → HW.blue, viewer →
//        ALARM.unknown (amber implied a warning).
//  MU-4  LIGHT-MODE BUG: disabled Clock In/Out buttons used hardcoded
//        dark-theme text colors (#1a5c3a / #78481f). Now token color
//        with opacity dimming — legible in both themes.
//  MU-5  BASE URL from env (VITE_API_BASE) with localhost fallback.
//        FLAG (unchanged, needs team decision): token still read from
//        'spiricomp_token' storage key and auth header built locally —
//        centralize both in api/client.
//  MU-6  Keyframes deduped — AdminLayout mounts <NocBaseStyles/>, so
//        noc-spin / noc-pulse are global; local mu-spin/hw-pulse/
//        hw-glow copies deleted (mu-toast stays, it's page-specific).
//        Inline onMouseOver hovers → CSS classes. KPI gap strips use
//        gapColor(T) instead of T.border. LiveTimer drops the odd
//        "'Barlow Condensed', monospace" stack for FONT.display.
//  MU-7  FLAG: ShiftModal rejects start >= end, which makes overnight
//        NOC shifts (e.g. 22:00–06:00) impossible to schedule. Needs
//        a backend decision on cross-midnight hour computation before
//        the frontend check can be relaxed.
//  MU-8  i18n integration — all hardcoded strings replaced with
//        translation keys from users namespace.
// ─────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { useTranslation } from 'react-i18next'
import { HW, ALARM, FONT, gapColor } from '../../components/UI'
import {
  Users, Plus, Trash2, Shield, Edit2, Check, X,
  Search, RefreshCw, AlertTriangle, Eye, EyeOff,
  Copy, CheckCircle, Lock, Mail, User, ChevronDown,
  Clock, LogIn, LogOut, RotateCcw, Calendar, Timer,
  TrendingUp, Activity, Download, AlertCircle, Zap,
} from 'lucide-react'
import axios from 'axios'

// MU-5: env-configurable API base
const BASE = import.meta.env?.VITE_API_BASE || 'http://localhost:8000'
// FLAG MU-5: centralize in api/client (key spelling kept for session compat)
const tok  = () => sessionStorage.getItem('spiricomp_token') ||
                   localStorage.getItem('spiricomp_token') || ''
const hdr  = () => ({ Authorization: `Bearer ${tok()}` })

/* ─────────────────────── ROLE META — MU-3 ─────────────────────── */
const ROLE_META = {
  admin:    { color: HW.red,        bg: 'rgba(238,58,67,.12)',   border: 'rgba(238,58,67,.3)'   },
  engineer: { color: HW.blue,       bg: 'rgba(0,147,213,.12)',   border: 'rgba(0,147,213,.3)'   },
  viewer:   { color: ALARM.unknown, bg: 'rgba(107,114,128,.12)', border: 'rgba(107,114,128,.3)' },
}

const RoleBadge = ({ role }) => {
  const { t } = useTranslation()
  const m = ROLE_META[role?.toLowerCase()] || ROLE_META.viewer
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
      background: m.bg, border: `1px solid ${m.border}`, color: m.color,
      padding: '3px 10px', fontSize: 9, fontWeight: 800,
      letterSpacing: '1px', textTransform: 'uppercase', borderRadius: 4 }}>
      <Shield size={9} color={m.color}/>
      {t(`users.roles.${role?.toLowerCase() || 'viewer'}`)}
    </span>
  )
}

const Fld = ({ label, T, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 9, fontWeight: 800,
      color: T.textDim, letterSpacing: '2px', textTransform: 'uppercase',
      marginBottom: 6 }}>{label}</label>
    {children}
  </div>
)

const Inp = ({ value, onChange, placeholder, type = 'text', T, icon: Ic, right }) => (
  <div style={{ position: 'relative' }}>
    {Ic && <div style={{ position: 'absolute', left: 12, top: '50%',
      transform: 'translateY(-50%)', color: T.textDim, pointerEvents: 'none' }}>
      <Ic size={13}/>
    </div>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      className="mu-input"
      style={{ width: '100%', background: T.bgCardHover, color: T.text,
        border: `1px solid ${T.border}`, borderRadius: 8,
        padding: `10px ${right ? '40px' : '12px'} 10px ${Ic ? '36px' : '12px'}`,
        fontSize: 12, fontFamily: 'inherit', outline: 'none',
        transition: 'border .2s' }}/>
    {right && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0,
      display: 'flex', alignItems: 'center', paddingRight: 10 }}>{right}</div>}
  </div>
)

const Sel = ({ value, onChange, options, T, label }) => (
  <div style={{ position: 'relative' }}>
    <select value={value} onChange={onChange} aria-label={label}
      style={{ width: '100%', appearance: 'none',
        background: T.bgCardHover, color: T.text, border: `1px solid ${T.border}`,
        padding: '10px 32px 10px 12px', fontSize: 12, fontFamily: 'inherit',
        outline: 'none', cursor: 'pointer', borderRadius: 8 }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown size={11} color={T.textDim} style={{ position: 'absolute',
      right: 10, top: '50%', transform: 'translateY(-50%)',
      pointerEvents: 'none' }}/>
  </div>
)

/* ─────────────────────── HOURS BAR — MU-3 ─────────────────────── */
function HoursBar({ hours, target = 8, T }) {
  const pct   = Math.min(100, hours > 0 ? Math.round((hours / target) * 100) : 0)
  const color = pct >= 100 ? ALARM.normal
              : pct >= 75  ? HW.blue
              : pct >= 40  ? ALARM.minor
              :              ALARM.major
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        marginBottom: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: T.textDim }}>
          {Number(hours).toFixed(1)}h / {target}h
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: T.mode === 'dark'
          ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)',
        borderRadius: 6, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 6,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          boxShadow: pct > 0 ? `0 0 8px ${color}55` : 'none',
          transition: 'width .6s cubic-bezier(.4,0,.2,1)',
        }}/>
      </div>
    </div>
  )
}

/* ─────────────────────── LIVE TIMER — MU-6 ────────────────────── */
function LiveTimer({ checkinISO }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!checkinISO) return
    const update = () => {
      const diff = (Date.now() - new Date(checkinISO).getTime()) / 1000
      setElapsed(Math.max(0, diff))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [checkinISO])
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = Math.floor(elapsed % 60)
  return (
    <span style={{ fontFamily: FONT.display,
      fontSize: 15, fontWeight: 800, color: ALARM.normal, letterSpacing: 1 }}>
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SHIFT SCHEDULE MODAL — MU-7 flag in header
═══════════════════════════════════════════════════════════════ */
function ShiftModal({ user, onClose, onSave, T }) {
  const { t } = useTranslation()
  const [start,   setStart]   = useState(user?.shift_start || '08:00')
  const [end,     setEnd]     = useState(user?.shift_end   || '17:00')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const shiftHours = (() => {
    if (!start || !end) return 0
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const mins = (eh * 60 + em) - (sh * 60 + sm)
    return mins > 0 ? (mins / 60).toFixed(1) : 0
  })()

  const submit = async () => {
    if (!start || !end) { setError(t('users.shift.errors.bothRequired')); return }
    // MU-7: blocks overnight shifts — relax once backend handles
    // cross-midnight hour computation
    if (start >= end)   { setError(t('users.shift.errors.endAfterStart')); return }
    setLoading(true); setError(null)
    try {
      await axios.patch(
        `${BASE}/api/admin/users/${user.id}/shift`,
        { shift_start: start, shift_end: end }, { headers: hdr() }
      )
      onSave({ ...user, shift_start: start, shift_end: end })
    } catch (err) {
      setError(err.response?.data?.detail || t('users.shift.errors.updateFailed'))
    } finally { setLoading(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9200,
      background: 'rgba(0,10,25,.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.mode === 'dark'
          ? 'linear-gradient(135deg, rgba(0,15,35,.99), rgba(0,25,55,.97))'
          : T.bgCard,
        border: '1px solid rgba(0,147,213,.25)',
        borderRadius: 16, width: '100%', maxWidth: 420,
        boxShadow: '0 24px 80px rgba(0,0,0,.5), 0 0 0 1px rgba(0,147,213,.1)',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${HW.blue}, ${HW.blueLight}, transparent)` }}/>

        {/* Header */}
        <div style={{ padding: '22px 24px 16px',
          borderBottom: `1px solid ${T.mode === 'dark'
            ? 'rgba(0,147,213,.15)' : T.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(0,147,213,.2), rgba(0,195,255,.1))',
                border: '1px solid rgba(0,147,213,.3)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center' }}>
                <Calendar size={16} color={HW.blue}/>
              </div>
              <div>
                <div style={{ fontSize: 9, color: HW.blue, letterSpacing: '2px',
                  fontWeight: 800, textTransform: 'uppercase' }}>
                  {t('users.shift.title')}
                </div>
                <div style={{ fontFamily: FONT.display, fontSize: 18,
                  fontWeight: 900, color: T.text, lineHeight: 1.2 }}>
                  {user?.full_name || user?.username}
                </div>
              </div>
            </div>
            <button onClick={onClose} aria-label={t('users.common.close')} style={{
              background: T.mode === 'dark'
                ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)',
              border: `1px solid ${T.border}`, borderRadius: 8,
              color: T.textMuted, cursor: 'pointer', width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={13}/>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(220,38,38,.08)',
              border: '1px solid rgba(220,38,38,.25)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
              fontSize: 12, color: ALARM.critical }}>
              <AlertTriangle size={13}/>{error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 16, marginBottom: 16 }}>
            {[
              { label: t('users.shift.start'), val: start, set: setStart },
              { label: t('users.shift.end'),   val: end,   set: setEnd   },
            ].map(({ label, val, set }) => (
              <Fld key={label} label={label} T={T}>
                <input type="time" value={val} onChange={e => set(e.target.value)}
                  className="mu-input" aria-label={label}
                  style={{ width: '100%', background: T.bgCardHover,
                    color: T.text, border: `1px solid ${T.border}`,
                    borderRadius: 8, padding: '11px 12px', fontSize: 14,
                    fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                    transition: 'border .2s' }}/>
              </Fld>
            ))}
          </div>

          {shiftHours > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              background: 'linear-gradient(135deg, rgba(0,147,213,.1), rgba(0,195,255,.05))',
              border: '1px solid rgba(0,147,213,.2)', borderRadius: 10,
              padding: '12px 16px' }}>
              <Timer size={16} color={HW.blue}/>
              <div>
                <div style={{ fontSize: 11, color: T.textDim }}>{t('users.shift.duration')}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: HW.blue }}>
                  {shiftHours} {t('users.shift.hours')}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: T.textDim }}>{t('users.shift.weeklyTotal')}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                  {(shiftHours * 5).toFixed(0)}h / {t('users.shift.week')}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: '0 24px 22px',
          justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${T.border}`,
            borderRadius: 8, color: T.textMuted, cursor: 'pointer',
            padding: '9px 20px', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit' }}>{t('users.common.cancel')}</button>
          <button onClick={submit} disabled={loading} style={{
            background: loading ? T.border
              : 'linear-gradient(135deg, #0093D5, #0070A8)',
            border: 'none', borderRadius: 8, color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer', padding: '9px 24px',
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 7,
            boxShadow: loading ? 'none' : '0 4px 16px rgba(0,147,213,.35)',
            opacity: loading ? 0.7 : 1, transition: 'all .2s' }}>
            {loading
              ? <><RefreshCw size={12}
                  style={{ animation: 'noc-spin .8s linear infinite' }}/> {t('users.common.saving')}</>
              : <><Check size={12}/> {t('users.shift.save')}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   USER CREATE / EDIT MODAL — MU-1: blue admin chrome, no emojis
═══════════════════════════════════════════════════════════════ */
function UserModal({ mode, user, onClose, onSave, T }) {
  const { t } = useTranslation()
  const isCreate = mode === 'create'
  const [form, setForm] = useState({
    username:  user?.username  || '',
    full_name: user?.full_name || '',
    email:     user?.email     || '',
    role:      user?.role      || 'engineer',
    password:  '',
    active:    user?.active    ?? true,
  })
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [copied,  setCopied]  = useState(false)

  const genPw = () => {
    const c = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$!'
    const pw = Array.from({ length: 14 },
      () => c[Math.floor(Math.random() * c.length)]).join('')
    setForm(f => ({ ...f, password: pw })); setShowPw(true)
  }
  const copyPw = () => {
    navigator.clipboard.writeText(form.password).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  const submit = async () => {
    setError(null)
    if (isCreate && (!form.username.trim() || !form.full_name.trim() || !form.password)) {
      setError(t('users.modal.errors.requiredFields')); return
    }
    if (!isCreate && !form.full_name.trim()) { setError(t('users.modal.errors.fullNameRequired')); return }
    setLoading(true)
    try {
      if (isCreate) {
        const r = await axios.post(`${BASE}/api/admin/users`,
          { username: form.username.trim(), full_name: form.full_name.trim(),
            email: form.email.trim() || undefined, role: form.role,
            password: form.password },
          { headers: hdr() })
        onSave(r.data, true)
      } else {
        const r = await axios.patch(`${BASE}/api/admin/users/${user.id}`,
          { full_name: form.full_name.trim() || undefined,
            email: form.email.trim() || undefined,
            role: form.role, active: form.active,
            password: form.password || undefined },
          { headers: hdr() })
        onSave(r.data, false)
      }
    } catch (err) { setError(err.response?.data?.detail || t('users.common.requestFailed'))
    } finally { setLoading(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9100,
      background: 'rgba(0,10,25,.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.mode === 'dark'
          ? 'linear-gradient(135deg, rgba(0,15,35,.99), rgba(0,25,55,.97))'
          : T.bgCard,
        border: '1px solid rgba(0,147,213,.25)',     // MU-1
        borderRadius: 16, width: '100%', maxWidth: 500,
        boxShadow: '0 24px 80px rgba(0,0,0,.5)',
        overflow: 'hidden', position: 'relative',
      }}>
        {/* MU-1: blue chrome, not legacy red */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${HW.blue}, ${HW.blueLight}, transparent)` }}/>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '20px 24px 16px',
          borderBottom: `1px solid ${T.mode === 'dark'
            ? 'rgba(0,147,213,.15)' : T.border}` }}>
          <div>
            <div style={{ fontSize: 9, color: HW.blue, letterSpacing: '2.5px',
              fontWeight: 800, textTransform: 'uppercase', marginBottom: 5 }}>
              {isCreate ? t('users.modal.newTitle') : t('users.modal.editTitle')}
            </div>
            <div style={{ fontFamily: FONT.display,
              fontSize: 22, fontWeight: 900, color: T.text }}>
              {isCreate ? t('users.modal.addEngineer') : user?.full_name || user?.username}
            </div>
          </div>
          <button onClick={onClose} aria-label={t('users.common.close')} style={{
            background: T.mode === 'dark'
              ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)',
            border: `1px solid ${T.border}`, borderRadius: 8,
            color: T.textMuted, cursor: 'pointer', width: 30, height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 24px 10px' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(220,38,38,.08)',
              border: '1px solid rgba(220,38,38,.25)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
              fontSize: 12, color: ALARM.critical }}>
              <AlertTriangle size={13}/>{error}
            </div>
          )}
          {isCreate && (
            <Fld label={t('users.fields.username') + ' *'} T={T}>
              <Inp value={form.username} T={T} icon={User}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder={t('users.placeholders.username')}/>
            </Fld>
          )}
          <Fld label={t('users.fields.fullName') + ' *'} T={T}>
            <Inp value={form.full_name} T={T} icon={User}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder={t('users.placeholders.fullName')}/>
          </Fld>
          <Fld label={t('users.fields.email')} T={T}>
            <Inp value={form.email} T={T} icon={Mail} type="email"
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder={t('users.placeholders.email')}/>
          </Fld>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Fld label={t('users.fields.role') + ' *'} T={T}>
              <Sel value={form.role} label={t('users.fields.role')}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))} T={T}
                options={[
                  { value: 'engineer', label: t('users.roles.engineer') },
                  { value: 'viewer',   label: t('users.roles.viewer') },
                  { value: 'admin',    label: t('users.roles.admin') },
                ]}/>
            </Fld>
            {!isCreate && (
              <Fld label={t('users.fields.status')} T={T}>
                <Sel value={form.active.toString()} label={t('users.fields.status')}
                  onChange={e => setForm(f => ({ ...f,
                    active: e.target.value === 'true' }))}
                  T={T} options={[
                    { value: 'true',  label: t('users.status.active') },
                    { value: 'false', label: t('users.status.disabled') },
                  ]}/>
              </Fld>
            )}
          </div>
          <Fld label={isCreate ? t('users.fields.password') + ' *' : t('users.fields.newPassword')} T={T}>
            <Inp value={form.password} T={T} icon={Lock}
              type={showPw ? 'text' : 'password'}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder={isCreate ? t('users.placeholders.password') : t('users.placeholders.newPassword')}
              right={
                <div style={{ display: 'flex', gap: 4 }}>
                  {form.password && (
                    <button type="button" onClick={copyPw}
                      aria-label={t('users.common.copyPassword')}
                      style={{ background: 'transparent', border: 'none',
                        cursor: 'pointer',
                        color: copied ? ALARM.normal : T.textDim, padding: 4 }}>
                      {copied ? <CheckCircle size={13}/> : <Copy size={13}/>}
                    </button>
                  )}
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? t('users.common.hidePassword') : t('users.common.showPassword')}
                    style={{ background: 'transparent', border: 'none',
                      cursor: 'pointer', color: T.textDim, padding: 4 }}>
                    {showPw ? <EyeOff size={13}/> : <Eye size={13}/>}
                  </button>
                </div>
              }/>
          </Fld>
          <button type="button" onClick={genPw} className="mu-genpw"
            style={{ background: 'transparent',
              border: `1px solid ${T.border}`, borderRadius: 8,
              color: T.textDim, cursor: 'pointer', fontSize: 10,
              fontWeight: 700, padding: '6px 14px', marginBottom: 16,
              fontFamily: 'inherit', display: 'inline-flex',
              alignItems: 'center', gap: 6 }}>
            <Zap size={11}/> {t('users.modal.generatePassword')}
          </button>
        </div>

        {/* Footer — MU-1: blue submit */}
        <div style={{ display: 'flex', gap: 10, padding: '16px 24px 22px',
          justifyContent: 'flex-end', borderTop: `1px solid ${T.border}` }}>
          <button onClick={onClose} style={{ background: 'transparent',
            border: `1px solid ${T.border}`, borderRadius: 8,
            color: T.textMuted, cursor: 'pointer', padding: '9px 20px',
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
            {t('users.common.cancel')}
          </button>
          <button onClick={submit} disabled={loading} style={{
            background: loading ? T.border
              : 'linear-gradient(135deg, #0093D5, #0070A8)',
            border: 'none', borderRadius: 8, color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer', padding: '9px 24px',
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 7,
            boxShadow: loading ? 'none' : '0 4px 16px rgba(0,147,213,.35)',
            opacity: loading ? 0.7 : 1 }}>
            {loading
              ? <><RefreshCw size={12}
                  style={{ animation: 'noc-spin .8s linear infinite' }}/> {t('users.common.saving')}</>
              : <><Check size={12}/>{isCreate ? t('users.modal.createAccount') : t('users.modal.saveChanges')}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   DELETE CONFIRM — destructive = ALARM.critical (convention)
═══════════════════════════════════════════════════════════════ */
function DelConfirm({ user, onClose, onConfirm, T }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const go = async () => { setBusy(true); await onConfirm(); setBusy(false) }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9100,
      background: 'rgba(0,10,25,.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.mode === 'dark'
          ? 'linear-gradient(135deg, rgba(0,15,35,.99), rgba(0,25,55,.97))'
          : T.bgCard,
        border: '1px solid rgba(220,38,38,.3)',
        borderRadius: 16, width: '100%', maxWidth: 380,
        padding: '30px 28px', position: 'relative',
        boxShadow: '0 24px 80px rgba(0,0,0,.5)',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${ALARM.critical}, transparent)`,
          borderRadius: '16px 16px 0 0' }}/>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%',
            background: 'rgba(220,38,38,.1)',
            border: '2px solid rgba(220,38,38,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px' }}>
            <Trash2 size={22} color={ALARM.critical}/>
          </div>
          <div style={{ fontFamily: FONT.display, fontSize: 22,
            fontWeight: 900, color: T.text, marginBottom: 10 }}>
            {t('users.delete.title')}
          </div>
          <p style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.7,
            margin: 0 }}>
            {t('users.delete.message', { name: user?.full_name || user?.username })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'transparent',
            border: `1px solid ${T.border}`, borderRadius: 8,
            color: T.textMuted, cursor: 'pointer', padding: 10,
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
            {t('users.common.cancel')}
          </button>
          <button onClick={go} disabled={busy} style={{ flex: 1,
            background: `linear-gradient(135deg, ${ALARM.critical}, #991B1B)`,
            border: 'none', borderRadius: 8, color: '#fff',
            cursor: busy ? 'not-allowed' : 'pointer', padding: 10,
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 7,
            boxShadow: busy ? 'none' : '0 4px 16px rgba(220,38,38,.35)' }}>
            {busy ? t('users.delete.disabling') : <><Trash2 size={12}/> {t('users.delete.disable')}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   WORKING HOURS TAB
═══════════════════════════════════════════════════════════════ */
function WorkingHoursTab({ users, onUpdate, notify, T }) {
  const { t } = useTranslation()
  const [shiftModal, setShiftModal] = useState(null)
  const [busy,       setBusy]       = useState({})
  const GAP = gapColor(T)

  const engineers = useMemo(
    () => users.filter(u => u.role !== 'admin' && u.active),
    [users]
  )

  const doAction = async (userId, action, endpoint) => {
    setBusy(b => ({ ...b, [userId]: action }))
    try {
      const r = await axios.patch(
        `${BASE}/api/admin/users/${userId}/${endpoint}`,
        {}, { headers: hdr() }
      )
      onUpdate({ id: userId, ...r.data })
      try {
        const full = await axios.get(`${BASE}/api/admin/users`, { headers: hdr() })
        const updated = full.data.find(u => u.id === userId)
        if (updated) onUpdate(updated)
      } catch {}
      const verb = action === 'checkin' ? t('users.shift.checkedIn')
                 : action === 'checkout' ? t('users.shift.checkedOut') 
                 : t('users.shift.hoursReset')
      notify(`${verb} — ${engineers.find(u => u.id === userId)?.username || ''}`)
    } catch (err) {
      notify(err.response?.data?.detail || `${action} ${t('users.common.failed')}`, false)
    } finally {
      setBusy(b => { const n = { ...b }; delete n[userId]; return n })
    }
  }

  const handleShiftSave = (updated) => {
    onUpdate(updated)
    notify(t('users.shift.updateSuccess', { name: updated.full_name || updated.username }))
    setShiftModal(null)
  }

  const onShift      = engineers.filter(u => u.is_on_shift).length
  const totalToday   = engineers.reduce((s, u) => s + (u.hours_today || 0), 0)
  const totalWeek    = engineers.reduce((s, u) => s + (u.hours_week  || 0), 0)
  const scheduledAll = engineers.filter(u => u.shift_start && u.shift_end).length

  const exportCSV = () => {
    const rows = [
      [t('users.shift.csv.name'), t('users.shift.csv.username'), 
       t('users.shift.csv.role'), t('users.shift.csv.shift'),
       t('users.shift.csv.onShift'), t('users.shift.csv.today'), 
       t('users.shift.csv.week')]
    ]
    engineers.forEach(u => rows.push([
      u.full_name || '', u.username, u.role,
      u.shift_start && u.shift_end ? `${u.shift_start}-${u.shift_end}` : t('users.shift.csv.notSet'),
      u.is_on_shift ? t('users.shift.csv.yes') : t('users.shift.csv.no'),
      (u.hours_today || 0).toFixed(2),
      (u.hours_week  || 0).toFixed(2),
    ]))
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `shift_report_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      {shiftModal && (
        <ShiftModal user={shiftModal} T={T}
          onClose={() => setShiftModal(null)} onSave={handleShiftSave}/>
      )}

      {/* ── KPI summary strip — MU-6: gapColor ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
        gap: 1, background: GAP, marginBottom: 20, borderRadius: 12,
        overflow: 'hidden' }}>
        {[
          { l: t('users.shift.kpi.engineers'),   v: engineers.length,            c: HW.blue,       sub: t('users.shift.kpi.nocViewer') },
          { l: t('users.shift.kpi.onShift'),    v: onShift,                     c: ALARM.normal,  sub: t('users.shift.kpi.currentlyActive') },
          { l: t('users.shift.kpi.hoursToday'), v: totalToday.toFixed(1) + 'h', c: HW.blueLight,  sub: t('users.shift.kpi.allEngineers') },
          { l: t('users.shift.kpi.scheduled'),   v: scheduledAll,                c: '#8B5CF6',     sub: t('users.shift.kpi.haveShift') },
        ].map(k => (
          <div key={k.l} style={{ background: T.bgCard, padding: '18px 16px',
            position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: '10%',
              right: '10%', height: 2,
              background: `linear-gradient(90deg, transparent, ${k.c}, transparent)` }}/>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.textDim,
              letterSpacing: '1.5px', textTransform: 'uppercase',
              marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontFamily: FONT.display,
              fontSize: 30, fontWeight: 900, color: k.c, lineHeight: 1,
              marginBottom: 4 }}>{k.v}</div>
            <div style={{ fontSize: 9, color: T.textDim }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%',
            background: HW.blue, boxShadow: `0 0 8px ${HW.blue}` }}/>
          <span style={{ fontSize: 12, color: T.textMuted }}>
            {t('users.shift.showing', { count: engineers.length })}
          </span>
        </div>
        <button onClick={exportCSV}
          style={{ display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,147,213,.1)',
            border: '1px solid rgba(0,147,213,.3)',
            borderRadius: 8, color: HW.blue, cursor: 'pointer',
            padding: '7px 16px', fontSize: 11, fontWeight: 700,
            fontFamily: 'inherit' }}>
          <Download size={13}/> {t('users.shift.exportCsv')}
        </button>
      </div>

      {/* ── Engineer cards ── */}
      {engineers.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center',
          background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: 12 }}>
          <Clock size={36} color={T.textDim}
            style={{ display: 'block', margin: '0 auto 14px' }}/>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text,
            marginBottom: 6 }}>
            {t('users.shift.noEngineers')}
          </div>
          <div style={{ fontSize: 12, color: T.textDim }}>
            {t('users.shift.noEngineersDesc')}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 16 }}>
          {engineers.map(u => {
            const isLoading  = busy[u.id]
            const shiftHours = (() => {
              if (!u.shift_start || !u.shift_end) return 8
              const [sh, sm] = u.shift_start.split(':').map(Number)
              const [eh, em] = u.shift_end.split(':').map(Number)
              const mins = (eh * 60 + em) - (sh * 60 + sm)
              return mins > 0 ? mins / 60 : 8
            })()

            return (
              <div key={u.id} style={{
                background: T.mode === 'dark'
                  ? 'linear-gradient(135deg, rgba(0,15,35,.95), rgba(0,25,55,.9))'
                  : T.bgCard,
                border: u.is_on_shift
                  ? '1px solid rgba(22,163,74,.4)'
                  : `1px solid ${T.border}`,
                borderRadius: 14, padding: '18px 20px',
                position: 'relative', overflow: 'hidden',
                boxShadow: u.is_on_shift
                  ? '0 4px 24px rgba(22,163,74,.15), 0 0 0 1px rgba(22,163,74,.1)'
                  : '0 2px 12px rgba(0,0,0,.08)',
                transition: 'all .3s',
              }}>
                {u.is_on_shift && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0,
                    height: 2,
                    background: `linear-gradient(90deg, transparent, ${ALARM.normal}, transparent)` }}/>
                )}

                {/* Status indicator */}
                <div style={{ position: 'absolute', top: 14, right: 14,
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: u.is_on_shift
                    ? 'rgba(22,163,74,.12)'
                    : T.mode === 'dark'
                      ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)',
                  border: `1px solid ${u.is_on_shift
                    ? 'rgba(22,163,74,.3)' : T.border}`,
                  borderRadius: 20, padding: '4px 10px' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%',
                    background: u.is_on_shift ? ALARM.normal : ALARM.unknown,
                    boxShadow: u.is_on_shift
                      ? `0 0 6px ${ALARM.normal}` : 'none',
                    animation: u.is_on_shift
                      ? 'noc-pulse 2s infinite' : 'none' }}/>
                  <span style={{ fontSize: 9, fontWeight: 700,
                    color: u.is_on_shift ? ALARM.normal : ALARM.unknown,
                    letterSpacing: '1px', textTransform: 'uppercase' }}>
                    {u.is_on_shift ? t('users.shift.onShift') : t('users.shift.offShift')}
                  </span>
                </div>

                {/* Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                  marginBottom: 16 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%',
                    flexShrink: 0,
                    background: `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15, fontWeight: 800, color: '#fff',
                    border: `2px solid ${u.is_on_shift
                      ? 'rgba(22,163,74,.5)' : 'rgba(0,147,213,.3)'}`,
                    boxShadow: u.is_on_shift
                      ? '0 0 12px rgba(22,163,74,.3)' : 'none' }}>
                    {(u.full_name || u.username || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text,
                      lineHeight: 1.2 }}>
                      {u.full_name || u.username}
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 3,
                      display: 'flex', alignItems: 'center', gap: 6 }}>
                      @{u.username}
                      <RoleBadge role={u.role}/>
                    </div>
                  </div>
                </div>

                {/* Live timer */}
                {u.is_on_shift && u.last_checkin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(22,163,74,.08)',
                    border: '1px solid rgba(22,163,74,.2)',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                    <Timer size={14} color={ALARM.normal}/>
                    <div>
                      <div style={{ fontSize: 9, color: T.textDim,
                        marginBottom: 2 }}>
                        {t('users.shift.sessionDuration')}
                      </div>
                      <LiveTimer checkinISO={u.last_checkin}/>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: T.textDim }}>
                        {t('users.shift.checkin')}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600,
                        color: T.text }}>
                        {new Date(u.last_checkin).toLocaleTimeString([],
                          { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Shift schedule row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  background: T.mode === 'dark'
                    ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)',
                  border: `1px solid ${T.border}`, borderRadius: 8,
                  padding: '8px 12px', marginBottom: 14 }}>
                  <Calendar size={13} color={HW.blue} style={{ flexShrink: 0 }}/>
                  {u.shift_start && u.shift_end ? (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700,
                        color: T.text }}>
                        {u.shift_start}
                        <span style={{ color: T.textDim, fontWeight: 400,
                          margin: '0 6px' }}>→</span>
                        {u.shift_end}
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim }}>
                        {shiftHours.toFixed(1)}h {t('users.shift.shift')} ·
                        {' '}{(shiftHours * 5).toFixed(0)}h/{t('users.shift.week')}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: T.textDim,
                      fontStyle: 'italic', flex: 1 }}>
                      {t('users.shift.noSchedule')}
                    </span>
                  )}
                  <button onClick={() => setShiftModal(u)}
                    style={{ background: 'rgba(0,147,213,.1)',
                      border: '1px solid rgba(0,147,213,.25)', borderRadius: 6,
                      color: HW.blue, cursor: 'pointer', padding: '4px 10px',
                      fontSize: 9, fontWeight: 800, fontFamily: 'inherit',
                      letterSpacing: '.5px', textTransform: 'uppercase' }}>
                    {t('users.shift.edit')}
                  </button>
                </div>

                {/* Hours bars */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.textDim,
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                    marginBottom: 6, display: 'flex', alignItems: 'center',
                    gap: 5 }}>
                    <TrendingUp size={9} color={T.textDim}/> {t('users.shift.today')}
                  </div>
                  <HoursBar hours={u.hours_today || 0} target={shiftHours} T={T}/>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.textDim,
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                    marginBottom: 6, display: 'flex', alignItems: 'center',
                    gap: 5 }}>
                    <Activity size={9} color={T.textDim}/> {t('users.shift.thisWeek')}
                  </div>
                  <HoursBar hours={u.hours_week || 0}
                    target={shiftHours * 5} T={T}/>
                </div>

                {/* Action buttons — MU-4: token colors + opacity dimming */}
                <div style={{ display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6 }}>
                  <button
                    disabled={!!isLoading || !!u.is_on_shift}
                    onClick={() => doAction(u.id, 'checkin', 'checkin')}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: 5,
                      background: 'rgba(22,163,74,.12)',
                      border: '1px solid rgba(22,163,74,.35)',
                      borderRadius: 8, color: ALARM.normal,
                      cursor: (isLoading || u.is_on_shift)
                        ? 'not-allowed' : 'pointer',
                      padding: '8px 4px', fontSize: 10, fontWeight: 700,
                      fontFamily: 'inherit',
                      opacity: u.is_on_shift ? 0.4 : 1, transition: 'all .2s',
                    }}>
                    {isLoading === 'checkin'
                      ? <RefreshCw size={11}
                          style={{ animation: 'noc-spin .8s linear infinite' }}/>
                      : <LogIn size={11}/>}
                    {t('users.shift.clockIn')}
                  </button>

                  <button
                    disabled={!!isLoading || !u.is_on_shift}
                    onClick={() => doAction(u.id, 'checkout', 'checkout')}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: 5,
                      background: 'rgba(202,138,4,.12)',
                      border: '1px solid rgba(202,138,4,.35)',
                      borderRadius: 8, color: ALARM.minor,
                      cursor: (isLoading || !u.is_on_shift)
                        ? 'not-allowed' : 'pointer',
                      padding: '8px 4px', fontSize: 10, fontWeight: 700,
                      fontFamily: 'inherit',
                      opacity: !u.is_on_shift ? 0.4 : 1, transition: 'all .2s',
                    }}>
                    {isLoading === 'checkout'
                      ? <RefreshCw size={11}
                          style={{ animation: 'noc-spin .8s linear infinite' }}/>
                      : <LogOut size={11}/>}
                    {t('users.shift.clockOut')}
                  </button>

                  <button onClick={() => setShiftModal(u)}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: 5,
                      background: 'rgba(139,92,246,.1)',
                      border: '1px solid rgba(139,92,246,.3)',
                      borderRadius: 8, color: '#8B5CF6', cursor: 'pointer',
                      padding: '8px 4px', fontSize: 10, fontWeight: 700,
                      fontFamily: 'inherit', transition: 'all .2s',
                    }}>
                    <Calendar size={11}/> {t('users.shift.schedule')}
                  </button>

                  <button disabled={!!isLoading} className="mu-reset"
                    onClick={() => doAction(u.id, 'reset', 'reset-hours')}
                    title={t('users.shift.resetTitle')} 
                    aria-label={t('users.shift.resetTitle')}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center',
                      background: T.mode === 'dark'
                        ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)',
                      border: `1px solid ${T.border}`, borderRadius: 8,
                      color: T.textDim,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      padding: '8px 10px', fontSize: 10,
                      fontFamily: 'inherit', transition: 'all .2s',
                    }}>
                    {isLoading === 'reset'
                      ? <RefreshCw size={11}
                          style={{ animation: 'noc-spin .8s linear infinite' }}/>
                      : <RotateCcw size={11}/>}
                  </button>
                </div>

                {/* Overtime alert */}
                {u.hours_today > shiftHours * 1.1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7,
                    background: 'rgba(202,138,4,.08)',
                    border: '1px solid rgba(202,138,4,.25)',
                    borderRadius: 8, padding: '7px 12px', marginTop: 10 }}>
                    <AlertCircle size={12} color={ALARM.minor}/>
                    <span style={{ fontSize: 11, color: ALARM.minor,
                      fontWeight: 600 }}>
                      {t('users.shift.overtime', { hours: (u.hours_today - shiftHours).toFixed(1) })}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Week totals footer */}
      {engineers.length > 0 && (
        <div style={{ marginTop: 20, padding: '14px 20px',
          background: T.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(0,147,213,.08), rgba(0,195,255,.04))'
            : 'rgba(0,147,213,.04)',
          border: '1px solid rgba(0,147,213,.15)', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} color={HW.blue}/>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
              {t('users.shift.teamThisWeek')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: t('users.shift.totalHours'),
                val: totalWeek.toFixed(1) + 'h', color: HW.blue },
              { label: t('users.shift.onShiftNow'),
                val: onShift + ' / ' + engineers.length, color: ALARM.normal },
              { label: t('users.shift.avgPerEngineer'),
                val: (engineers.length
                  ? totalWeek / engineers.length : 0).toFixed(1) + 'h',
                color: HW.blueLight },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: T.textDim,
                  textTransform: 'uppercase', letterSpacing: '1.5px',
                  marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function ManageUsers() {
  const { t } = useTranslation()
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)

  const [users,      setUsers]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [modal,      setModal]      = useState(null)
  const [delUser,    setDelUser]    = useState(null)
  const [toast,      setToast]      = useState(null)
  const [activeTab,  setActiveTab]  = useState('engineers')

  const notify = (msg, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 4000)
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await axios.get(`${BASE}/api/admin/users`, { headers: hdr() })
      setUsers(r.data)
    } catch (err) {
      setError(err.response?.data?.detail || `${err.message} — check uvicorn logs`)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const filtered = useMemo(() => {
    let list = users
    if (roleFilter !== 'All') list = list.filter(u => u.role === roleFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(u =>
        u.username?.toLowerCase().includes(q) ||
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q))
    }
    return list
  }, [users, search, roleFilter])

  const stats = useMemo(() => ({
    total:     users.length,
    active:    users.filter(u => u.active).length,
    admins:    users.filter(u => u.role === 'admin').length,
    engineers: users.filter(u => u.role === 'engineer').length,
    onShift:   users.filter(u => u.is_on_shift).length,
  }), [users])

  const handleSave = (saved, isCreate) => {
    setUsers(prev => isCreate
      ? [...prev, saved]
      : prev.map(u => u.id === saved.id ? saved : u))
    notify(`${isCreate ? t('users.common.created') : t('users.common.updated')}: ${saved.username}`)
    setModal(null)
  }
  const handleDelete = async () => {
    try {
      await axios.delete(`${BASE}/api/admin/users/${delUser.id}`,
        { headers: hdr() })
      setUsers(prev => prev.map(u =>
        u.id === delUser.id ? { ...u, active: false } : u))
      notify(`${t('users.common.disabled')}: ${delUser.username}`)
    } catch (err) { notify(err.response?.data?.detail || t('users.common.deleteFailed'), false) }
    setDelUser(null)
  }
  const handleReactivate = async (user) => {
    try {
      const r = await axios.patch(
        `${BASE}/api/admin/users/${user.id}`,
        { active: true }, { headers: hdr() })
      setUsers(prev => prev.map(u => u.id === user.id ? r.data : u))
      notify(`${t('users.common.reactivated')}: ${user.username}`)
    } catch (err) { notify(err.response?.data?.detail || t('users.common.failed'), false) }
  }
  const handleUserUpdate = (updated) => {
    setUsers(prev => prev.map(u =>
      u.id === updated.id ? { ...u, ...updated } : u))
  }

  return (
    <div style={{ padding: '28px 32px 80px', background: T.bg,
      minHeight: 'calc(100vh - 56px)', color: T.text }}>

      <style>{`
        @keyframes mu-toast { from{opacity:0;transform:translateY(-12px)}
          to{opacity:1;transform:translateY(0)} }
        .mu-row td { transition: background .12s; }
        .mu-row:hover td { background: ${T.mode === 'dark'
          ? 'rgba(0,147,213,.05)' : 'rgba(0,147,213,.03)'}!important; }
        .mu-input:focus { border-color: ${HW.blue} !important; }
        .mu-genpw { transition: all .2s; }
        .mu-genpw:hover { border-color: ${ALARM.normal} !important;
          color: ${ALARM.normal} !important; }
        .mu-reset:hover:not(:disabled) {
          border-color: ${ALARM.critical} !important;
          color: ${ALARM.critical} !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: T.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(0,15,35,.98), rgba(0,25,55,.96))'
            : T.bgCard,
          border: `1px solid ${toast.ok
            ? 'rgba(22,163,74,.35)' : 'rgba(220,38,38,.35)'}`,
          borderRadius: 12, padding: '12px 18px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, fontWeight: 600, animation: 'mu-toast .3s ease',
          boxShadow: '0 12px 40px rgba(0,0,0,.4)' }}>
          {toast.ok
            ? <CheckCircle size={16} color={ALARM.normal}/>
            : <AlertTriangle size={16} color={ALARM.critical}/>}
          <span style={{ color: T.text }}>{toast.msg}</span>
        </div>
      )}

      {modal && <UserModal mode={modal.mode} user={modal.user} T={T}
        onClose={() => setModal(null)} onSave={handleSave}/>}
      {delUser && <DelConfirm user={delUser} T={T}
        onClose={() => setDelUser(null)} onConfirm={handleDelete}/>}

      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(0,147,213,.08)',
            border: '1px solid rgba(0,147,213,.2)',
            borderRadius: 20, padding: '4px 12px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%',
              background: ALARM.normal, display: 'inline-block',
              animation: 'noc-pulse 2s infinite' }}/>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2px',
              textTransform: 'uppercase', color: HW.blue }}>
              {t('users.page.liveBadge')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h1 style={{ fontFamily: FONT.display,
              fontSize: 'clamp(24px,3vw,42px)', fontWeight: 900,
              letterSpacing: '-1px', lineHeight: 1, color: T.text,
              margin: '0 0 6px' }}>
              {t('users.page.title')} <span style={{
                background: `linear-gradient(90deg, ${HW.blue}, ${HW.blueLight})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontStyle: 'italic' }}>{t('users.page.titleAccent')}</span>
            </h1>
            <p style={{ fontSize: 13, color: T.textMuted, margin: 0,
              fontWeight: 300 }}>
              {t('users.page.subtitle')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={fetchUsers} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6,
                background: T.mode === 'dark'
                  ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)',
                border: `1px solid ${T.border}`, borderRadius: 8,
                color: T.textMuted, padding: '8px 16px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}>
              <RefreshCw size={13} style={{ animation: loading
                ? 'noc-spin .8s linear infinite' : undefined }}/>
              {t('users.common.refresh')}
            </button>
            {activeTab === 'engineers' && (
              <button onClick={() => setModal({ mode: 'create' })}
                style={{ display: 'flex', alignItems: 'center', gap: 7,
                  background: 'linear-gradient(135deg, #0093D5, #0070A8)',
                  border: 'none', borderRadius: 8, color: '#fff',
                  padding: '8px 20px', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '.3px',
                  boxShadow: '0 4px 16px rgba(0,147,213,.35)',
                  transition: 'all .2s' }}>
                <Plus size={14}/> {t('users.page.addEngineer')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI strip — MU-6: gapColor; MU-3: token colors ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 1, background: GAP, borderRadius: 12, overflow: 'hidden',
        marginBottom: 24 }}>
        {[
          { l: t('users.page.stats.total'),  v: stats.total,     c: HW.blue       },
          { l: t('users.page.stats.active'),       v: stats.active,    c: ALARM.normal  },
          { l: t('users.page.stats.onShift'), v: stats.onShift,   c: HW.blueLight  },
          { l: t('users.page.stats.admins'),       v: stats.admins,    c: HW.red        },
          { l: t('users.page.stats.engineers'),    v: stats.engineers, c: '#8B5CF6'     },
        ].map(k => (
          <div key={k.l} style={{ background: T.bgCard, padding: '16px 14px',
            position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: '10%',
              right: '10%', height: 2,
              background: `linear-gradient(90deg, transparent, ${k.c}, transparent)` }}/>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.textDim,
              letterSpacing: '1.5px', textTransform: 'uppercase',
              marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontFamily: FONT.display,
              fontSize: 28, fontWeight: 900, color: k.c,
              lineHeight: 1 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* ── TABS ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`,
        marginBottom: 24 }}>
        {[
          { key: 'engineers', label: t('users.tabs.engineers'), Icon: Users },
          { key: 'hours',     label: t('users.tabs.workingHours'), Icon: Clock },
        ].map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            aria-pressed={activeTab === key}
            style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 22px', fontSize: 13, fontWeight: 600,
              background: 'transparent', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              color: activeTab === key ? HW.blue : T.textMuted,
              borderBottom: activeTab === key
                ? `2px solid ${HW.blue}` : '2px solid transparent',
              marginBottom: -1, transition: 'color .15s' }}>
            <Icon size={15}/>
            {label}
            {key === 'hours' && stats.onShift > 0 && (
              <span style={{ marginLeft: 4,
                background: 'rgba(22,163,74,.15)',
                border: '1px solid rgba(22,163,74,.3)',
                color: ALARM.normal, padding: '1px 8px', fontSize: 9,
                fontWeight: 800, borderRadius: 10 }}>
                {stats.onShift} {t('users.tabs.live')}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─────────── TAB: ENGINEERS ─────────── */}
      {activeTab === 'engineers' && (
        <>
          {/* Filter bar — MU-6: gapColor */}
          <div style={{ display: 'flex', gap: 1, background: GAP,
            marginBottom: 16, borderRadius: 10, overflow: 'hidden',
            flexWrap: 'wrap' }}>
            <div style={{ background: T.bgCard, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 8, flex: 1,
              minWidth: 220 }}>
              <Search size={13} color={T.textDim}/>
              <input type="text" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('users.page.searchPlaceholder')}
                aria-label={t('users.page.searchLabel')}
                style={{ background: 'transparent', border: 'none',
                  outline: 'none', color: T.text, fontSize: 13,
                  fontFamily: 'inherit', flex: 1 }}/>
              {search && (
                <button onClick={() => setSearch('')} aria-label={t('users.common.clear')}
                  style={{ background: 'transparent', border: 'none',
                    cursor: 'pointer', color: T.textDim, padding: 0 }}>
                  <X size={12}/>
                </button>
              )}
            </div>
            <div style={{ background: T.bgCard, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: T.textDim,
                letterSpacing: '2px', textTransform: 'uppercase' }}>
                {t('users.page.roleLabel')}
              </span>
              <div style={{ position: 'relative' }}>
                <select value={roleFilter} aria-label={t('users.page.roleFilterLabel')}
                  onChange={e => setRoleFilter(e.target.value)}
                  style={{ appearance: 'none', background: T.bgCardHover,
                    color: T.text, border: `1px solid ${T.border}`,
                    borderRadius: 6, padding: '6px 28px 6px 10px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    outline: 'none', fontFamily: 'inherit', minWidth: 130 }}>
                  <option value="All">{t('users.page.allRoles')}</option>
                  <option value="admin">{t('users.roles.admin')}</option>
                  <option value="engineer">{t('users.roles.engineer')}</option>
                  <option value="viewer">{t('users.roles.viewer')}</option>
                </select>
                <ChevronDown size={10} color={T.textDim} style={{
                  position: 'absolute', right: 8, top: '50%',
                  transform: 'translateY(-50%)', pointerEvents: 'none' }}/>
              </div>
            </div>
            <div style={{ background: T.bgCard, padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 6,
              marginLeft: 'auto' }}>
              <span style={{ fontFamily: FONT.display,
                fontSize: 16, fontWeight: 900, color: HW.blue }}>
                {filtered.length}
              </span>
              <span style={{ fontSize: 11, color: T.textDim }}>
                / {users.length} {t('users.common.users')}
              </span>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(220,38,38,.08)',
              border: '1px solid rgba(220,38,38,.25)',
              borderRadius: 10, padding: '14px 18px', fontSize: 12,
              color: ALARM.critical, marginBottom: 16 }}>
              <AlertTriangle size={14}/>
              <div>
                <strong>{t('users.page.loadError')}</strong> {error}
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>
                  {t('users.page.checkLogs')}
                </div>
              </div>
              <button onClick={fetchUsers} style={{ marginLeft: 'auto',
                borderRadius: 6, background: 'transparent',
                border: '1px solid rgba(220,38,38,.3)',
                color: ALARM.critical, cursor: 'pointer',
                padding: '4px 12px', fontSize: 11 }}>{t('users.common.retry')}</button>
            </div>
          )}

          {/* Table */}
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 12,
            overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse',
                fontSize: 12, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: T.mode === 'dark'
                      ? 'rgba(0,147,213,.06)' : 'rgba(0,147,213,.03)',
                    borderBottom: `1px solid ${T.border}` }}>
                    {[
                      t('users.table.id'),
                      t('users.table.user'),
                      t('users.table.email'),
                      t('users.table.role'),
                      t('users.table.shift'),
                      t('users.table.status'),
                      t('users.table.actions')
                    ].map(h => (
                      <th key={h} style={{ padding: '12px 14px',
                        textAlign: 'left', fontSize: 9, fontWeight: 800,
                        letterSpacing: '1.5px', textTransform: 'uppercase',
                        color: T.textDim, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} style={{ padding: 48,
                      textAlign: 'center', color: T.textDim }}>
                      <RefreshCw size={20} color={HW.blue}
                        style={{ animation: 'noc-spin .8s linear infinite',
                          display: 'block', margin: '0 auto 10px' }}/>
                      {t('users.page.loading')}
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 52,
                      textAlign: 'center', color: T.textMuted }}>
                      <Users size={28} color={T.textDim}
                        style={{ display: 'block', margin: '0 auto 12px' }}/>
                      {error ? t('users.page.backendError') : t('users.page.noResults')}
                    </td></tr>
                  ) : filtered.map(u => (
                    <tr key={u.id} className="mu-row" style={{
                      borderBottom: `1px solid ${T.mode === 'dark'
                        ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'}`,
                      opacity: u.active ? 1 : 0.5 }}>
                      <td style={{ padding: '11px 14px', color: T.textDim,
                        fontSize: 11 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 10,
                          color: HW.blue, opacity: .7 }}>#{u.id}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center',
                          gap: 10 }}>
                          <div style={{ width: 32, height: 32,
                            borderRadius: '50%', flexShrink: 0,
                            background: `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12, fontWeight: 800, color: '#fff',
                            border: `2px solid ${u.is_on_shift
                              ? 'rgba(22,163,74,.5)'
                              : 'rgba(0,147,213,.3)'}` }}>
                            {(u.full_name || u.username || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: T.text,
                              fontSize: 13 }}>
                              {u.full_name || u.username}
                            </div>
                            <div style={{ fontSize: 10, color: T.textDim,
                              fontFamily: 'monospace' }}>
                              @{u.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', color: T.textDim,
                        fontSize: 11 }}>
                        {u.email || <span style={{ opacity: .35 }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <RoleBadge role={u.role}/>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {u.shift_start && u.shift_end ? (
                          <span style={{ fontSize: 11, color: T.text,
                            fontWeight: 600 }}>
                            {u.shift_start}–{u.shift_end}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: T.textDim,
                            fontStyle: 'italic' }}>
                            {t('users.table.notSet')}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center',
                          gap: 6 }}>
                          <span style={{ display: 'inline-flex',
                            alignItems: 'center', gap: 5,
                            padding: '3px 10px', fontSize: 9, fontWeight: 800,
                            letterSpacing: '1px', textTransform: 'uppercase',
                            borderRadius: 4,
                            background: u.active
                              ? 'rgba(22,163,74,.1)' : 'rgba(107,114,128,.1)',
                            border: `1px solid ${u.active
                              ? 'rgba(22,163,74,.25)' : 'rgba(107,114,128,.2)'}`,
                            color: u.active ? ALARM.normal : ALARM.unknown }}>
                            <span style={{ width: 5, height: 5,
                              borderRadius: '50%',
                              background: u.active
                                ? ALARM.normal : ALARM.unknown,
                              display: 'inline-block' }}/>
                            {u.active ? t('users.status.active') : t('users.status.off')}
                          </span>
                          {u.is_on_shift && (
                            <div style={{ width: 7, height: 7,
                              borderRadius: '50%', background: ALARM.normal,
                              boxShadow: `0 0 6px ${ALARM.normal}`,
                              animation: 'noc-pulse 2s infinite' }}
                              title={t('users.table.onShiftTitle')}/>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button title={t('users.table.edit')} 
                            aria-label={`${t('users.table.edit')} ${u.username}`}
                            onClick={() => setModal({ mode: 'edit', user: u })}
                            style={{ background: 'rgba(0,147,213,.1)',
                              border: '1px solid rgba(0,147,213,.25)',
                              borderRadius: 6, color: HW.blue,
                              cursor: 'pointer', width: 28, height: 28,
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all .15s' }}>
                            <Edit2 size={11}/>
                          </button>
                          {u.active ? (
                            <button title={t('users.table.disable')}
                              aria-label={`${t('users.table.disable')} ${u.username}`}
                              onClick={() => setDelUser(u)}
                              style={{ background: 'rgba(220,38,38,.1)',
                                border: '1px solid rgba(220,38,38,.25)',
                                borderRadius: 6, color: ALARM.critical,
                                cursor: 'pointer', width: 28, height: 28,
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all .15s' }}>
                              <Trash2 size={11}/>
                            </button>
                          ) : (
                            <button title={t('users.table.reactivate')}
                              aria-label={`${t('users.table.reactivate')} ${u.username}`}
                              onClick={() => handleReactivate(u)}
                              style={{ background: 'rgba(22,163,74,.1)',
                                border: '1px solid rgba(22,163,74,.25)',
                                borderRadius: 6, color: ALARM.normal,
                                cursor: 'pointer', width: 28, height: 28,
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all .15s' }}>
                              <Check size={11}/>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ─────────── TAB: WORKING HOURS ─────────── */}
      {activeTab === 'hours' && (
        <WorkingHoursTab
          users={users}
          onUpdate={handleUserUpdate}
          notify={notify}
          T={T}/>
      )}
    </div>
  )
}