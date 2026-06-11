// src/components/MessagingWidget.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC — Floating messaging widget (v2, aligned to UI.jsx)
//
// FIXES vs previous version:
//  M-1  Foreign palette removed. All #3B82F6 / #2563EB / #22D3EE
//       (Tailwind blues) → HW.blue / HW.blueLight / HW.navy.
//       All legacy red #CF0A2C / #FF4060 removed:
//         errors & urgent  → ALARM.critical (severity, not brand)
//         own-message tint → HW.blue (own ≠ alarm; red was wrong signal)
//  M-2  Emojis removed (📢👷🇨🇳📡●ℹ🔴). Recipient select is plain
//       text + Lucide chrome; priority is a 3-state segmented control
//       with Lucide icons colored by ALARM tokens.
//  M-3  msg.read_by?.length — crash guard (was unguarded .length).
//  M-4  msg_type now 'broadcast' for all/all_engineers (was always
//       'direct').
//  M-5  Messages poll only while panel is open; unread polls always.
//  M-6  Hover styles via CSS classes (no inline onMouseOver mutation).
//       Keyframes reuse noc-pulse/noc-spin from <NocBaseStyles/>.
//  M-7  Typography floor: data-bearing text ≥ 10px (sender, time,
//       priority, unread). 9px only on pure chrome.
//  M-8  Radius scale matched to system: 4px controls, bubbles keep
//       the chat convention at 8px (the one deliberate rounding).
//  M-9  aria-labels on icon-only buttons; unread announced.
//  M-10 Panel responsive: never overflows viewport (<480px).
//  M-11 Unread badge ring uses T.bg (was hardcoded #fff — glowed
//       in dark mode).
//
// FLAGGED (needs backend/team decision — see review notes):
//  F-1  Token key 'spiricomp_token' carries the old brand spelling.
//       Kept for session compatibility; centralize in api/client and
//       rename in one coordinated change.
//  F-2  Admin recipient list is hardcoded (noc_engineer, huawei_cn).
//       Should come from GET /api/users; static list kept as fallback.
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth }  from '../hooks/useAuth.jsx'
import {
  MessageCircle, X, Send, RefreshCw, AlertTriangle,
  Shield, ChevronDown, Circle, Info, CheckCheck, Radio,
} from 'lucide-react'
import axios from 'axios'
import { HW, ALARM, FONT, sevDim, sevBd } from './UI'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// F-1: legacy key kept on purpose — see header note.
const hdr = () => {
  const tok = sessionStorage.getItem('spiricomp_token')
           || localStorage.getItem('spiricomp_token') || ''
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

// ── Priority config (M-2): segmented control, ALARM-colored ──────────
const PRIORITIES = [
  { id: 'normal', label: 'Normal', icon: Circle,        color: null           },
  { id: 'info',   label: 'Info',   icon: Info,          color: ALARM.warning  },
  { id: 'urgent', label: 'Urgent', icon: AlertTriangle, color: ALARM.critical },
]

// F-2: fallback only — replace with GET /api/users.
const FALLBACK_RECIPIENTS = [
  { value: 'all',           label: 'Broadcast — all users' },
  { value: 'all_engineers', label: 'All engineers'         },
  { value: 'noc_engineer',  label: 'noc_engineer'          },
  { value: 'huawei_cn',     label: 'huawei_cn'             },
]

const isBroadcast = to => to === 'all' || to === 'all_engineers'

function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(ts).toLocaleDateString()
}

// ══════════════════════════════════════════════════════════════════════
export default function MessagingWidget() {
  const { theme: T } = useTheme()
  const { user }     = useAuth()

  const [open,     setOpen]     = useState(false)
  const [msgs,     setMsgs]     = useState([])
  const [unread,   setUnread]   = useState(0)
  const [input,    setInput]    = useState('')
  const [toUser,   setToUser]   = useState('admin')
  const [priority, setPriority] = useState('normal')
  const [loading,  setLoading]  = useState(false)
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState(null)

  const isAdmin   = user?.role?.toLowerCase() === 'admin'
  const bottomRef = useRef(null)

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const r = await axios.get(`${BASE}/api/messages?limit=60`, { headers: hdr() })
      setMsgs(r.data.messages || [])
    } catch (err) {
      if (!silent) setError(err.response?.data?.detail || 'Could not load messages — check the connection and retry')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const fetchUnread = useCallback(async () => {
    try {
      const r = await axios.get(`${BASE}/api/messages/unread`, { headers: hdr() })
      setUnread(r.data.unread || 0)
    } catch { /* non-fatal */ }
  }, [])

  // M-5: unread polls always; full message list only while open.
  useEffect(() => {
    fetchUnread()
    const id = setInterval(fetchUnread, 15_000)
    return () => clearInterval(id)
  }, [fetchUnread])

  useEffect(() => {
    if (!open) return
    fetchMessages()
    const id = setInterval(() => fetchMessages(true), 15_000)
    return () => clearInterval(id)
  }, [open, fetchMessages])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, open])

  useEffect(() => {
    if (!open) return
    setUnread(0)
    axios.patch(`${BASE}/api/messages/read-all`, {}, { headers: hdr() })
      .catch(() => {})
  }, [open])

  const sendMessage = async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setError(null)
    try {
      await axios.post(
        `${BASE}/api/messages`,
        { to_user: toUser, content, priority,
          msg_type: isBroadcast(toUser) ? 'broadcast' : 'direct' },   // M-4
        { headers: hdr() }
      )
      setInput('')
      await fetchMessages(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Message not sent — retry')
    } finally {
      setSending(false)
    }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <>
      {/* M-6: local keyframes limited to entrance motion; pulse/spin
          come from <NocBaseStyles/> mounted in Layout. */}
      <style>{`
        @keyframes msgw-pop   { from{transform:scale(.8);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes msgw-slide { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

        .msgw-fab { transition: all .25s cubic-bezier(.22,1,.36,1); }
        .msgw-fab:hover { transform: scale(1.08); }

        .msgw-iconbtn { background: transparent; border: none; cursor: pointer;
          color: ${T.textDim}; padding: 4px; display: flex; transition: color .15s; }
        .msgw-iconbtn:hover        { color: ${HW.blue}; }
        .msgw-iconbtn.danger:hover { color: ${ALARM.critical}; }

        .msgw-item { animation: msgw-slide .2s ease; }

        .msgw-input { transition: border-color .15s; }
        .msgw-input:focus { border-color: ${HW.blue} !important; }

        .msgw-panel { right: 90px; width: 360px; }
        @media (max-width: 480px) {
          .msgw-panel { right: 16px; width: calc(100vw - 32px); }   /* M-10 */
        }

        @media (prefers-reduced-motion: reduce) {
          .msgw-fab, .msgw-fab:hover { transition: none; transform: none; }
          .msgw-item, .msgw-panel    { animation: none !important; }
        }
      `}</style>

      {/* ── PANEL ── */}
      {open && (
        <div className="msgw-panel" style={{
          position: 'fixed', bottom: 96, height: 480, zIndex: 9997,
          display: 'flex', flexDirection: 'column',
          background: T.bgCard,
          border: `1px solid ${HW.blueBd}`,                          // M-1
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          animation: 'msgw-slide .3s cubic-bezier(.22,1,.36,1)',
        }}>
          {/* Top accent — matches ChartPanel hover accent */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent, ${HW.blue}, ${HW.blueLight}, transparent)` }}/>

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px 10px', borderBottom: `1px solid ${T.border}`,
            background: HW.blueDim, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%',
              background: `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,   // M-1: matches Layout avatar
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MessageCircle size={13} color="#fff"/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text }}>
                {isAdmin ? 'Team Messages' : 'Message Admin'}
              </div>
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1px' }}>
                {msgs.length} messages
              </div>
            </div>
            <button className="msgw-iconbtn" aria-label="Refresh messages"
              onClick={() => { fetchMessages(); fetchUnread() }}>
              <RefreshCw size={12}/>
            </button>
            <button className="msgw-iconbtn danger" aria-label="Close messages"
              onClick={() => setOpen(false)}>
              <X size={12}/>
            </button>
          </div>

          {/* ── Message list ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 8,
            scrollbarWidth: 'thin', scrollbarColor: `${T.border} transparent` }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: T.textDim, fontSize: 12 }}>
                <RefreshCw size={16} color={T.textDim}
                  style={{ animation: 'noc-spin .9s linear infinite', marginRight: 8 }}/>
                Loading…
              </div>
            ) : error ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                background: sevDim(ALARM.critical, '0E'),
                border: `1px solid ${sevBd(ALARM.critical)}`,
                padding: '10px 12px', fontSize: 11, color: ALARM.critical, borderRadius: 4 }}>
                <AlertTriangle size={13} color={ALARM.critical}/>{error}
              </div>
            ) : msgs.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                height: '100%', textAlign: 'center', color: T.textDim }}>
                <MessageCircle size={28} color={T.textDim} style={{ opacity: .3, marginBottom: 10 }}/>
                <div style={{ fontSize: 12 }}>No messages yet</div>
                <div style={{ fontSize: 10, marginTop: 4 }}>
                  {isAdmin ? 'Send a message to your NOC team' : 'Write to the admin below'}
                </div>
              </div>
            ) : msgs.map(msg => {
              const isMe = msg.from_user === user?.username
              const pr   = PRIORITIES.find(p => p.id === msg.priority)
              const sev  = pr?.color   // null for normal
              return (
                <div key={msg.id} className="msgw-item"
                  style={{ display: 'flex', gap: 8,
                    flexDirection: isMe ? 'row-reverse' : 'row',
                    alignItems: 'flex-end' }}>
                  {/* Avatar — own = brand blue (matches navbar), other = neutral */}
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: isMe
                      ? `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`     // M-1
                      : 'linear-gradient(135deg, #64748B, #475569)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 800, color: '#fff' }}>
                    {(msg.from_user || '?')[0].toUpperCase()}
                  </div>

                  <div style={{ maxWidth: '78%' }}>
                    {/* Sender · priority · time — M-7: 10px floor */}
                    <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3,
                      display: 'flex', alignItems: 'center',
                      justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 6 }}>
                      {!isMe && (
                        <span style={{ fontWeight: 700, color: T.textMuted }}>
                          {msg.from_user}
                        </span>
                      )}
                      {sev && (
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px',
                          background: sevDim(sev, '14'), border: `1px solid ${sevBd(sev)}`,
                          color: sev, letterSpacing: '1px', textTransform: 'uppercase',
                          borderRadius: 4, display: 'inline-flex',
                          alignItems: 'center', gap: 4 }}>
                          {pr.icon && <pr.icon size={9}/>}
                          {msg.priority}
                        </span>
                      )}
                      <span>{relativeTime(msg.timestamp)}</span>
                    </div>

                    {/* Bubble — M-1: own tint is blue; urgent gets a
                        severity edge so alarms read at a glance */}
                    <div style={{
                      background: isMe ? HW.blueDim : T.bgCardHover,
                      border: `1px solid ${isMe ? HW.blueBd : T.border}`,
                      borderLeft: !isMe && sev === ALARM.critical
                        ? `2px solid ${ALARM.critical}` : undefined,
                      borderRadius: isMe ? '8px 2px 8px 8px' : '2px 8px 8px 8px',  // M-8
                      padding: '8px 10px', fontSize: 12, color: T.text,
                      lineHeight: 1.55, wordBreak: 'break-word',
                    }}>
                      {msg.content}
                    </div>

                    {/* Read indicator — M-3 guard, Lucide instead of ✓ */}
                    {isMe && (msg.read_by?.length ?? 0) > 1 && (
                      <div style={{ fontSize: 10, color: ALARM.normal,
                        textAlign: 'right', marginTop: 2,
                        display: 'flex', justifyContent: 'flex-end',
                        alignItems: 'center', gap: 3 }}>
                        <CheckCheck size={10}/> Read
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef}/>
          </div>

          {/* ── Compose bar ── */}
          <div style={{ padding: '10px 12px 12px',
            borderTop: `1px solid ${T.border}`,
            background: T.mode === 'dark' ? 'rgba(0,0,0,.15)' : 'rgba(0,0,0,.02)',
            flexShrink: 0 }}>

            {/* Recipient + priority */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {isAdmin ? (
                <div style={{ position: 'relative', flex: 1, display: 'flex',
                  alignItems: 'center', background: T.bgCardHover,
                  border: `1px solid ${T.border}`, borderRadius: 4 }}>
                  <Radio size={10} color={HW.blue}
                    style={{ marginLeft: 8, flexShrink: 0,
                      opacity: isBroadcast(toUser) ? 1 : .35 }}/>
                  <select value={toUser} onChange={e => setToUser(e.target.value)}
                    aria-label="Recipient"
                    style={{ flex: 1, appearance: 'none', background: 'transparent',
                      color: T.text, border: 'none',
                      padding: '5px 24px 5px 8px', fontSize: 10,
                      fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                    {/* M-2: plain text, no emojis. F-2: replace with /api/users */}
                    {FALLBACK_RECIPIENTS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={9} color={T.textDim} style={{ position: 'absolute',
                    right: 6, top: '50%', transform: 'translateY(-50%)',
                    pointerEvents: 'none' }}/>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                  background: T.bgCardHover, border: `1px solid ${T.border}`,
                  borderRadius: 4, padding: '5px 10px', fontSize: 10, color: T.textDim }}>
                  <Shield size={10} color={HW.blue}/>
                  To: <strong style={{ color: T.text }}>Admin</strong>
                </div>
              )}

              {/* M-2: priority segmented control with Lucide icons */}
              <div role="radiogroup" aria-label="Message priority"
                style={{ display: 'flex', border: `1px solid ${T.border}`,
                  borderRadius: 4, overflow: 'hidden' }}>
                {PRIORITIES.map(p => {
                  const active = priority === p.id
                  const c = p.color || T.textMuted
                  return (
                    <button key={p.id} role="radio" aria-checked={active}
                      title={`Priority: ${p.label}`}
                      onClick={() => setPriority(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 8px', fontSize: 10, fontWeight: 700,
                        fontFamily: 'inherit', cursor: 'pointer', border: 'none',
                        borderLeft: p.id !== 'normal' ? `1px solid ${T.border}` : 'none',
                        background: active ? sevDim(c, '14') : 'transparent',
                        color: active ? c : T.textDim,
                        transition: 'all .15s' }}>
                      <p.icon size={10}/>
                      {active && p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Input + send */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                className="msgw-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type a message — Enter to send"
                aria-label="Message text"
                rows={1}
                style={{ flex: 1, background: T.bgCardHover, color: T.text,
                  border: `1px solid ${T.border}`, borderRadius: 4,          // M-8
                  padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
                  outline: 'none', resize: 'none',
                  minHeight: 36, maxHeight: 90, lineHeight: 1.4 }}
              />
              <button onClick={sendMessage} disabled={!input.trim() || sending}
                aria-label="Send message"
                style={{ width: 36, height: 36, borderRadius: 4, border: 'none',  // M-8
                  background: input.trim() && !sending ? HW.blue : HW.blueDim,    // M-1
                  color: '#fff',
                  cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all .2s',
                  boxShadow: input.trim() && !sending
                    ? `0 4px 12px ${HW.blueGlow}` : 'none' }}>
                {sending
                  ? <RefreshCw size={14} style={{ animation: 'noc-spin .9s linear infinite' }}/>
                  : <Send size={14}/>}
              </button>
            </div>

            {error && (
              <div style={{ marginTop: 6, fontSize: 10, color: ALARM.critical,
                display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={11} color={ALARM.critical}/>{error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FLOATING BUTTON ── */}
      <button
        className="msgw-fab"
        onClick={() => setOpen(v => !v)}
        aria-label={open
          ? 'Close messages'
          : `Open messages${unread > 0 ? ` — ${unread} unread` : ''}`}
        title={open ? 'Close messages' : 'Open messages'}
        style={{
          position: 'fixed', bottom: 90, right: 24,
          width: 46, height: 46, borderRadius: '50%', border: 'none',
          background: open
            ? `linear-gradient(135deg, ${HW.navy}, ${HW.navyMid})`            // M-1
            : `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open
            ? '0 4px 16px rgba(0,0,0,.5)'
            : `0 4px 20px ${HW.blueGlow}`,
          zIndex: 9998,
          animation: 'msgw-pop .4s cubic-bezier(.22,1,.36,1)',
        }}>
        {open ? <X size={18}/> : <MessageCircle size={20}/>}

        {/* Unread badge — ALARM.critical: unread urgent info IS an alert */}
        {!open && unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            minWidth: 18, height: 18, borderRadius: 9,
            background: ALARM.critical,                                       // M-1
            border: `2px solid ${T.bg}`,                                      // M-11
            color: '#fff', fontSize: 10, fontWeight: 800,                     // M-7
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  )
}