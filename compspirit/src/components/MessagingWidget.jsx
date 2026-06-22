// src/components/MessagingWidget.jsx
// SpiriCom NOC — Floating messaging widget (v5)
//
// v5 changes vs v4-fixed:
//  V5-1  Engineer gets a recipient dropdown (admin + noc_engineer).
//        Previously engineers had a static "To: Admin" label — no choice.
//  V5-2  ADMIN_RECIPIENTS and ENGINEER_RECIPIENTS are separate lists.
//        Admin: all named users + broadcasts.
//        Engineer: admin + noc_engineer only.
//  V5-3  Compose bar uses a single selector component for both roles,
//        driven by isAdmin ? ADMIN_RECIPIENTS : ENGINEER_RECIPIENTS.
//  V5-4  isBroadcast warning shown for admin only (engineers can't broadcast).
//
// Preserved from v4-fixed:
//  FIX-1  useState lazy initializer (_roleFromStorage).
//  FIX-2  Broadcast warning is a separate conditional row.
//  FIX-3  huawei_cn in ADMIN_RECIPIENTS.
//  FIX-4  position:'relative' on select wrapper.
//  FIX-5  Clean send restrictions in backend.
//  M-1–M-13  All earlier palette / receipt / UX fixes.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTheme }  from '../context/ThemeContext'
import { useAuth }   from '../hooks/useAuth.jsx'
import {
  MessageCircle, X, Send, RefreshCw, AlertTriangle,
  Shield, ChevronDown, Circle, Info, Check, CheckCheck,
  Radio, Pencil, Trash2, Languages,
} from 'lucide-react'
import axios from 'axios'
import { HW, ALARM, sevDim, sevBd } from './UI'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const hdr = () => {
  const tok = sessionStorage.getItem('spiricomp_token')
           || localStorage.getItem('spiricomp_token') || ''
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

// FIX-1: read role without depending on isAdmin being declared yet
function _roleFromStorage() {
  try {
    const raw = sessionStorage.getItem('spiricomp_user')
             || localStorage.getItem('spiricomp_user')
    return JSON.parse(raw)?.role?.toLowerCase() ?? 'engineer'
  } catch { return 'engineer' }
}

// ── Recipient lists ────────────────────────────────────────────────────
// V5-2: admin sees all users + broadcasts; engineer sees admin + noc_engineer
const ADMIN_RECIPIENTS = [
  { value: 'noc_engineer',  label: 'noc_engineer'               },
  { value: 'huawei_cn',     label: 'huawei_cn'                  },
  { value: 'viewer_demo',   label: 'viewer_demo'                },
  { value: '__sep__',       label: '──────────', disabled: true },
  { value: 'all_engineers', label: '📢 Broadcast — engineers'   },
  { value: 'all',           label: '📢 Broadcast — everyone'    },
]

const ENGINEER_RECIPIENTS = [
  { value: 'admin',        label: 'admin'        },
  { value: 'noc_engineer', label: 'noc_engineer' },
]

// ── Priority config ────────────────────────────────────────────────────
const PRIORITIES = [
  { id: 'normal', label: 'Normal', icon: Circle,        color: null           },
  { id: 'info',   label: 'Info',   icon: Info,          color: ALARM.warning  },
  { id: 'urgent', label: 'Urgent', icon: AlertTriangle, color: ALARM.critical },
]

const isBroadcast = to => to === 'all' || to === 'all_engineers'

// ── Status ladder ──────────────────────────────────────────────────────
const STATUS_META = {
  sent:      { Icon: Check,      color: null,    label: 'Sent'      },
  delivered: { Icon: CheckCheck, color: null,    label: 'Delivered' },
  seen:      { Icon: CheckCheck, color: HW.blue, label: 'Seen'      },
}
function messageStatus(msg) {
  const n = msg.read_by?.length ?? 0
  if (n <= 0) return 'sent'
  if (n === 1) return 'delivered'
  return 'seen'
}

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

function canEditMsg(msg, isMe) {
  if (!isMe || msg.edited) return false
  return (Date.now() - new Date(msg.timestamp).getTime()) / 1000 < 15 * 60
}

// ── Action button ──────────────────────────────────────────────────────
function ActionBtn({ icon: Icon, label, onClick, danger = false, T }) {
  return (
    <button title={label} aria-label={label}
      onClick={e => { e.stopPropagation(); onClick(e) }}
      style={{ background:'transparent', border:'none', cursor:'pointer',
        padding:'3px 5px', display:'flex', alignItems:'center',
        color: danger ? ALARM.critical : T.textDim,
        borderRadius:4, transition:'all .15s' }}
      onMouseEnter={e => e.currentTarget.style.background =
        danger ? sevDim(ALARM.critical,'14') : sevDim(HW.blue,'14')}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <Icon size={11}/>
    </button>
  )
}

// ══════════════════════════════════════════════════════════════════════
export default function MessagingWidget() {
  const { theme: T } = useTheme()
  const { user }     = useAuth()

  // ── All hooks first ───────────────────────────────────────────────
  const [open,         setOpen]         = useState(false)
  const [msgs,         setMsgs]         = useState([])
  const [unread,       setUnread]       = useState(0)
  const [input,        setInput]        = useState('')

  // FIX-1: lazy initializer — isAdmin not available yet at this call
  const [toUser, setToUser] = useState(() => {
    const role = _roleFromStorage()
    return role === 'admin' ? 'noc_engineer' : 'admin'
  })

  const [priority,     setPriority]     = useState('normal')
  const [loading,      setLoading]      = useState(false)
  const [sending,      setSending]      = useState(false)
  const [error,        setError]        = useState(null)
  const [editingId,    setEditingId]    = useState(null)
  const [editContent,  setEditContent]  = useState('')
  const [editSaving,   setEditSaving]   = useState(false)
  const [deleteMenuId, setDeleteMenuId] = useState(null)
  const [translations, setTranslations] = useState({})
  const [translating,  setTranslating]  = useState(null)

  // ── Derived values (after all hooks) ──────────────────────────────
  const isAdmin     = user?.role?.toLowerCase() === 'admin'
  const recipients  = isAdmin ? ADMIN_RECIPIENTS : ENGINEER_RECIPIENTS
  const bottomRef   = useRef(null)
  const orderedMsgs = useMemo(() => [...msgs].reverse(), [msgs])

  // ── Fetch ──────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const r = await axios.get(`${BASE}/api/messages?limit=60`, { headers: hdr() })
      setMsgs(r.data.messages || [])
    } catch (err) {
      if (!silent) setError(err.response?.data?.detail || 'Could not load messages')
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
    axios.patch(`${BASE}/api/messages/read-all`, {}, { headers: hdr() }).catch(() => {})
  }, [open])

  useEffect(() => {
    const close = () => setDeleteMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // ── Send ───────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true); setError(null)
    try {
      await axios.post(`${BASE}/api/messages`,
        { to_user: toUser, content, priority,
          msg_type: isBroadcast(toUser) ? 'broadcast' : 'direct' },
        { headers: hdr() })
      setInput('')
      await fetchMessages(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Message not sent — retry')
    } finally { setSending(false) }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── Edit ───────────────────────────────────────────────────────────
  const startEdit  = msg => { setEditingId(msg.id); setEditContent(msg.content); setDeleteMenuId(null) }
  const cancelEdit = ()  => { setEditingId(null); setEditContent('') }
  const saveEdit   = async msgId => {
    const content = editContent.trim()
    if (!content) return
    setEditSaving(true)
    try {
      await axios.patch(`${BASE}/api/messages/${msgId}`, { content }, { headers: hdr() })
      cancelEdit()
      await fetchMessages(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Edit failed')
    } finally { setEditSaving(false) }
  }

  // ── Delete ─────────────────────────────────────────────────────────
  const deleteMsg = async (msgId, mode) => {
    setDeleteMenuId(null)
    try {
      await axios.delete(`${BASE}/api/messages/${msgId}?mode=${mode}`, { headers: hdr() })
      await fetchMessages(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Delete failed')
    }
  }

  // ── Translate ──────────────────────────────────────────────────────
  const translateMsg = async msg => {
    if (translating) return
    setTranslating(msg.id)
    try {
      const r = await axios.post(`${BASE}/api/messages/${msg.id}/translate`,
        { target_lang: 'zh' }, { headers: hdr() })
      setTranslations(prev => ({ ...prev, [msg.id]: r.data.translated }))
    } catch {
      setTranslations(prev => ({ ...prev, [msg.id]: '⚠ Translation unavailable' }))
    } finally { setTranslating(null) }
  }

  // ══════════════════════════════════════════════════════════════════
  return (
    <>
      <style>{`
        @keyframes msgw-pop   { from{transform:scale(.8);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes msgw-slide { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .msgw-fab         { transition:all .25s cubic-bezier(.22,1,.36,1); }
        .msgw-fab:hover   { transform:scale(1.08); }
        .msgw-item        { animation:msgw-slide .2s ease; }
        .msgw-input       { transition:border-color .15s; }
        .msgw-input:focus { border-color:${HW.blue} !important; }
        .msgw-panel       { right:90px; width:380px; }
        .msgw-actions     { opacity:0; transition:opacity .15s; pointer-events:none; }
        .msgw-row:hover .msgw-actions { opacity:1; pointer-events:auto; }
        @media (max-width:480px) { .msgw-panel { right:16px; width:calc(100vw - 32px); } }
        @media (prefers-reduced-motion:reduce) {
          .msgw-fab,.msgw-item,.msgw-panel { animation:none !important; transition:none; }
        }
      `}</style>

      {/* ── PANEL ── */}
      {open && (
        <div className="msgw-panel" style={{
          position:'fixed', bottom:96, height:500, zIndex:9997,
          display:'flex', flexDirection:'column',
          background:T.bgCard, border:`1px solid ${HW.blueBd}`,
          boxShadow:'0 20px 60px rgba(0,0,0,.6)',
          animation:'msgw-slide .3s cubic-bezier(.22,1,.36,1)',
        }}>
          {/* Top accent */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2,
            background:`linear-gradient(90deg,transparent,${HW.blue},${HW.blueLight},transparent)` }}/>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:10,
            padding:'12px 14px 10px', borderBottom:`1px solid ${T.border}`,
            background:HW.blueDim, flexShrink:0 }}>
            <div style={{ width:28, height:28, borderRadius:'50%',
              background:`linear-gradient(135deg,${HW.blue},${HW.navy})`,
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <MessageCircle size={13} color="#fff"/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:800, color:T.text }}>
                {isAdmin ? 'Team Messages' : 'NOC Messages'}
              </div>
              <div style={{ fontSize:10, color:T.textDim, letterSpacing:'1px' }}>
                {msgs.length} messages
              </div>
            </div>
            <button aria-label="Refresh"
              onClick={() => { fetchMessages(); fetchUnread() }}
              style={{ background:'none', border:'none', cursor:'pointer',
                color:T.textDim, padding:4, display:'flex' }}>
              <RefreshCw size={12}/>
            </button>
            <button aria-label="Close" onClick={() => setOpen(false)}
              style={{ background:'none', border:'none', cursor:'pointer',
                color:T.textDim, padding:4, display:'flex' }}>
              <X size={12}/>
            </button>
          </div>

          {/* Message list */}
          <div style={{ flex:1, overflowY:'auto', padding:'10px 12px',
            display:'flex', flexDirection:'column', gap:8,
            scrollbarWidth:'thin', scrollbarColor:`${T.border} transparent` }}>

            {loading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
                height:'100%', color:T.textDim, fontSize:12 }}>
                <RefreshCw size={16} color={T.textDim}
                  style={{ animation:'noc-spin .9s linear infinite', marginRight:8 }}/>
                Loading…
              </div>
            ) : error ? (
              <div style={{ display:'flex', alignItems:'center', gap:8,
                background:sevDim(ALARM.critical,'0E'),
                border:`1px solid ${sevBd(ALARM.critical)}`,
                padding:'10px 12px', fontSize:11,
                color:ALARM.critical, borderRadius:4 }}>
                <AlertTriangle size={13} color={ALARM.critical}/>{error}
              </div>
            ) : orderedMsgs.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', height:'100%',
                textAlign:'center', color:T.textDim }}>
                <MessageCircle size={28} color={T.textDim}
                  style={{ opacity:.3, marginBottom:10 }}/>
                <div style={{ fontSize:12 }}>No messages yet</div>
                <div style={{ fontSize:10, marginTop:4 }}>
                  {isAdmin
                    ? 'Send a message to your NOC team'
                    : 'Message admin or a colleague below'}
                </div>
              </div>
            ) : orderedMsgs.map(msg => {
              const isMe      = msg.from_user === user?.username
              const pr        = PRIORITIES.find(p => p.id === msg.priority)
              const sev       = pr?.color
              const st        = STATUS_META[messageStatus(msg)]
              const isEditing = editingId === msg.id
              const xlation   = translations[msg.id]
              const isXlating = translating === msg.id

              if (msg.deleted_globally) {
                return (
                  <div key={msg.id} style={{ textAlign:'center', padding:'4px 0' }}>
                    <span style={{ fontSize:10, color:T.textDim, fontStyle:'italic' }}>
                      This message was deleted
                    </span>
                  </div>
                )
              }

              return (
                <div key={msg.id} className="msgw-row msgw-item"
                  style={{ display:'flex', gap:8,
                    flexDirection:isMe ? 'row-reverse' : 'row',
                    alignItems:'flex-end', position:'relative' }}>

                  {/* Avatar */}
                  <div style={{ width:22, height:22, borderRadius:'50%', flexShrink:0,
                    background: isMe
                      ? `linear-gradient(135deg,${HW.blue},${HW.navy})`
                      : 'linear-gradient(135deg,#64748B,#475569)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:9, fontWeight:800, color:'#fff' }}>
                    {(msg.from_user || '?')[0].toUpperCase()}
                  </div>

                  {/* Bubble column */}
                  <div style={{ maxWidth:'76%', position:'relative' }}>

                    {/* Metadata row */}
                    <div style={{ fontSize:10, color:T.textDim, marginBottom:3,
                      display:'flex', alignItems:'center',
                      justifyContent:isMe ? 'flex-end' : 'flex-start',
                      gap:6, flexWrap:'wrap' }}>
                      {!isMe && (
                        <span style={{ fontWeight:700, color:T.textMuted }}>
                          {msg.from_user}
                        </span>
                      )}
                      {isMe && msg.msg_type === 'direct' && (
                        <span style={{ fontSize:9, color:T.textDim }}>
                          To:{' '}
                          <strong style={{ color:T.textMuted }}>{msg.to_user}</strong>
                        </span>
                      )}
                      {msg.msg_type === 'broadcast' && (
                        <span style={{ fontSize:9, fontWeight:700,
                          color:HW.blue, letterSpacing:'0.5px' }}>
                          📢 broadcast
                        </span>
                      )}
                      {sev && (
                        <span style={{ fontSize:9, fontWeight:800, padding:'1px 6px',
                          background:sevDim(sev,'14'), border:`1px solid ${sevBd(sev)}`,
                          color:sev, letterSpacing:'1px', textTransform:'uppercase',
                          borderRadius:4, display:'inline-flex', alignItems:'center', gap:4 }}>
                          {pr.icon && <pr.icon size={9}/>}{msg.priority}
                        </span>
                      )}
                      <span>{relativeTime(msg.timestamp)}</span>
                    </div>

                    {/* Edit mode */}
                    {isEditing ? (
                      <div>
                        <textarea value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault(); saveEdit(msg.id)
                            }
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          autoFocus
                          style={{ width:'100%', background:T.bgCardHover, color:T.text,
                            border:`1px solid ${HW.blue}`, borderRadius:8,
                            padding:'8px 10px', fontSize:12, fontFamily:'inherit',
                            outline:'none', resize:'none', minHeight:60 }}/>
                        <div style={{ display:'flex', gap:6, marginTop:5,
                          justifyContent:isMe ? 'flex-end' : 'flex-start' }}>
                          <button onClick={cancelEdit}
                            style={{ fontSize:10, padding:'3px 10px', cursor:'pointer',
                              background:'transparent', border:`1px solid ${T.border}`,
                              color:T.textDim, borderRadius:4, fontFamily:'inherit' }}>
                            Cancel
                          </button>
                          <button onClick={() => saveEdit(msg.id)}
                            disabled={!editContent.trim() || editSaving}
                            style={{ fontSize:10, padding:'3px 10px', cursor:'pointer',
                              background:HW.blue, border:'none', color:'#fff',
                              borderRadius:4, fontFamily:'inherit',
                              opacity:editContent.trim() ? 1 : .5 }}>
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Message bubble */}
                        <div style={{
                          background:isMe ? HW.blueDim : T.bgCardHover,
                          border:`1px solid ${isMe ? HW.blueBd : T.border}`,
                          borderLeft:!isMe && sev === ALARM.critical
                            ? `2px solid ${ALARM.critical}` : undefined,
                          borderRadius:isMe ? '8px 2px 8px 8px' : '2px 8px 8px 8px',
                          padding:'8px 10px', fontSize:12, color:T.text,
                          lineHeight:1.55, wordBreak:'break-word', position:'relative',
                        }}>
                          {msg.content}

                          {/* Hover action bar */}
                          <div className="msgw-actions"
                            style={{ position:'absolute', top:-28,
                              [isMe ? 'right' : 'left']:0,
                              display:'flex', alignItems:'center', gap:2,
                              background:T.bgCard,
                              border:`1px solid ${T.border}`,
                              borderRadius:6, padding:'2px 4px',
                              boxShadow:'0 2px 8px rgba(0,0,0,.25)', zIndex:10 }}>
                            {canEditMsg(msg, isMe) && (
                              <ActionBtn icon={Pencil} label="Edit"
                                onClick={() => startEdit(msg)} T={T}/>
                            )}
                            <div style={{ position:'relative' }}>
                        <ActionBtn icon={Trash2} label="Delete" danger
  onClick={() => {
    setDeleteMenuId(v => v === msg.id ? null : msg.id)
  }} T={T}/>
                              {deleteMenuId === msg.id && (
                                <div onClick={e => e.stopPropagation()}
                                  style={{ position:'absolute', top:'100%',
                                    [isMe ? 'right' : 'left']:0, marginTop:4,
                                    background:T.bgCard,
                                    border:`1px solid ${T.border}`,
                                    borderRadius:6, zIndex:100, minWidth:170,
                                    boxShadow:'0 8px 24px rgba(0,0,0,.4)',
                                    overflow:'hidden' }}>
                                  <button onClick={() => deleteMsg(msg.id,'me')}
                                    style={{ display:'flex', alignItems:'center', gap:8,
                                      width:'100%', padding:'9px 14px', fontSize:11,
                                      background:'transparent', border:'none',
                                      color:T.text, cursor:'pointer',
                                      fontFamily:'inherit', textAlign:'left' }}
                                    onMouseEnter={e => e.currentTarget.style.background = sevDim(HW.blue,'10')}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <Trash2 size={11} color={T.textDim}/> Delete for me
                                  </button>
                                  {(isMe || isAdmin) && (
                                    <button onClick={() => deleteMsg(msg.id,'everyone')}
                                      style={{ display:'flex', alignItems:'center', gap:8,
                                        width:'100%', padding:'9px 14px', fontSize:11,
                                        background:'transparent', border:'none',
                                        color:ALARM.critical, cursor:'pointer',
                                        fontFamily:'inherit', textAlign:'left',
                                        borderTop:`1px solid ${T.border}` }}
                                      onMouseEnter={e => e.currentTarget.style.background = sevDim(ALARM.critical,'10')}
                                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                      <Trash2 size={11} color={ALARM.critical}/> Delete for everyone
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <ActionBtn icon={Languages} label="Translate to Chinese"
                              onClick={() => translateMsg(msg)} T={T}/>
                          </div>
                        </div>

                        {/* Edited badge */}
                        {msg.edited && (
                          <div style={{ fontSize:9, color:T.textDim, fontStyle:'italic',
                            textAlign:isMe ? 'right' : 'left', marginTop:2 }}>
                            edited
                          </div>
                        )}

                        {/* Translation block */}
                        {(xlation || isXlating) && (
                          <div style={{ marginTop:5,
                            background:sevDim(HW.blueLight,'08'),
                            border:`1px solid ${sevBd(HW.blue)}`,
                            borderRadius:6, padding:'6px 10px',
                            fontSize:11, color:T.textMuted }}>
                            <div style={{ fontSize:9, fontWeight:800, letterSpacing:1,
                              color:HW.blue, marginBottom:3, textTransform:'uppercase' }}>
                              🇨🇳 Chinese
                            </div>
                            {isXlating
                              ? <span style={{ fontStyle:'italic' }}>Translating…</span>
                              : xlation}
                          </div>
                        )}

                        {/* Read receipt (own messages) */}
                        {isMe && (
                          <div style={{ fontSize:10, color:st.color || T.textDim,
                            textAlign:'right', marginTop:2,
                            display:'flex', justifyContent:'flex-end',
                            alignItems:'center', gap:3 }}>
                            <st.Icon size={10}/> {st.label}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef}/>
          </div>

          {/* ── Compose bar ── */}
          <div style={{ padding:'10px 12px 12px',
            borderTop:`1px solid ${T.border}`,
            background:T.mode === 'dark' ? 'rgba(0,0,0,.15)' : 'rgba(0,0,0,.02)',
            flexShrink:0 }}>

            {/* Row 1: Recipient + Priority */}
            <div style={{ display:'flex', gap:6,
              marginBottom: isAdmin && isBroadcast(toUser) ? 6 : 8 }}>

              {/* V5-3: Same selector for both admin and engineer — different lists */}
              {/* FIX-4: position:'relative' on wrapper for ChevronDown */}
              <div style={{ position:'relative', flex:1, display:'flex',
                alignItems:'center', background:T.bgCardHover,
                border:`1px solid ${T.border}`, borderRadius:4 }}>
                {isBroadcast(toUser)
                  ? <Radio size={10} color={HW.blue}
                      style={{ marginLeft:8, flexShrink:0 }}/>
                  : <Shield size={10} color={HW.blue}
                      style={{ marginLeft:8, flexShrink:0, opacity:.6 }}/>
                }
                <select value={toUser} onChange={e => setToUser(e.target.value)}
                  aria-label="Recipient"
                  style={{ flex:1, appearance:'none', background:'transparent',
                    color:T.text, border:'none',
                    padding:'5px 24px 5px 8px', fontSize:10,
                    fontFamily:'inherit', outline:'none', cursor:'pointer' }}>
                  {recipients.map(r => (
                    <option key={r.value} value={r.value} disabled={r.disabled}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={9} color={T.textDim}
                  style={{ position:'absolute', right:6, top:'50%',
                    transform:'translateY(-50%)', pointerEvents:'none' }}/>
              </div>

              {/* Priority segmented control */}
              <div role="radiogroup" aria-label="Message priority"
                style={{ display:'flex', border:`1px solid ${T.border}`,
                  borderRadius:4, overflow:'hidden' }}>
                {PRIORITIES.map(p => {
                  const active = priority === p.id
                  const c = p.color || T.textMuted
                  return (
                    <button key={p.id} role="radio" aria-checked={active}
                      title={`Priority: ${p.label}`}
                      onClick={() => setPriority(p.id)}
                      style={{ display:'flex', alignItems:'center', gap:4,
                        padding:'5px 8px', fontSize:10, fontWeight:700,
                        fontFamily:'inherit', cursor:'pointer', border:'none',
                        borderLeft:p.id !== 'normal' ? `1px solid ${T.border}` : 'none',
                        background:active ? sevDim(c,'14') : 'transparent',
                        color:active ? c : T.textDim, transition:'all .15s' }}>
                      <p.icon size={10}/>
                      {active && p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* FIX-2: Broadcast warning — separate row, admin only */}
            {isAdmin && isBroadcast(toUser) && (
              <div style={{ display:'flex', alignItems:'center', gap:8,
                padding:'5px 10px', marginBottom:8,
                background:sevDim(ALARM.warning,'10'),
                border:`1px solid ${sevBd(ALARM.warning)}`,
                borderRadius:4, fontSize:10, color:ALARM.warning }}>
                <AlertTriangle size={11}/>
                This will be sent to{' '}
                <strong>all {toUser === 'all' ? 'users' : 'engineers'}</strong>
              </div>
            )}

            {/* Row 2: Textarea + Send */}
            <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
              <textarea className="msgw-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type a message — Enter to send"
                aria-label="Message text"
                rows={1}
                style={{ flex:1, background:T.bgCardHover, color:T.text,
                  border:`1px solid ${T.border}`, borderRadius:4,
                  padding:'8px 10px', fontSize:12, fontFamily:'inherit',
                  outline:'none', resize:'none',
                  minHeight:36, maxHeight:90, lineHeight:1.4 }}
              />
              <button onClick={sendMessage}
                disabled={!input.trim() || sending}
                aria-label="Send message"
                style={{ width:36, height:36, borderRadius:4, border:'none',
                  background:input.trim() && !sending ? HW.blue : HW.blueDim,
                  color:'#fff',
                  cursor:input.trim() && !sending ? 'pointer' : 'not-allowed',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  flexShrink:0, transition:'all .2s',
                  boxShadow:input.trim() && !sending
                    ? `0 4px 12px ${HW.blueGlow}` : 'none' }}>
                {sending
                  ? <RefreshCw size={14}
                      style={{ animation:'noc-spin .9s linear infinite' }}/>
                  : <Send size={14}/>}
              </button>
            </div>

            {error && (
              <div style={{ marginTop:6, fontSize:10, color:ALARM.critical,
                display:'flex', alignItems:'center', gap:5 }}>
                <AlertTriangle size={11} color={ALARM.critical}/>{error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAB */}
      <button className="msgw-fab" onClick={() => setOpen(v => !v)}
        aria-label={open
          ? 'Close messages'
          : `Open messages${unread > 0 ? ` — ${unread} unread` : ''}`}
        style={{ position:'fixed', bottom:90, right:24,
          width:46, height:46, borderRadius:'50%', border:'none',
          background:open
            ? `linear-gradient(135deg,${HW.navy},${HW.navyMid})`
            : `linear-gradient(135deg,${HW.blue},${HW.navy})`,
          color:'#fff', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:open
            ? '0 4px 16px rgba(0,0,0,.5)'
            : `0 4px 20px ${HW.blueGlow}`,
          zIndex:9998,
          animation:'msgw-pop .4s cubic-bezier(.22,1,.36,1)' }}>
        {open ? <X size={18}/> : <MessageCircle size={20}/>}
        {!open && unread > 0 && (
          <span style={{ position:'absolute', top:-3, right:-3,
            minWidth:18, height:18, borderRadius:9,
            background:ALARM.critical, border:`2px solid ${T.bg}`,
            color:'#fff', fontSize:10, fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:'0 3px' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  )
}