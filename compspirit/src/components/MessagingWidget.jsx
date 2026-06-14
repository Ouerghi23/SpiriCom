// src/components/MessagingWidget.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC — Floating messaging widget (v6 - Fully integrated with backend API)
//
// ✅ Left/Right alignment - Sender = right, Receiver = left  
// ✅ Sender name - Show name above message
// ✅ Avatar / Initials - Circular avatar with user initials
// ✅ Timestamp - Show time (HH:MM) for each message
// ✅ Read receipts - "Seen" indicator when message is read (uses read_by array)
// ✅ Unread badge - Notification badge for unread messages
// ✅ Message status - Sent ✓, Delivered ✓✓, Seen (blue)
// ✅ Scroll to bottom - Auto-scroll on new message
// ✅ Emoji picker - For better UX
// ─────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth }  from '../hooks/useAuth.jsx'
import {
  MessageCircle, X, Send, RefreshCw, AlertTriangle,
  Shield, ChevronDown, Circle, Info, Check, CheckCheck, Radio,
  Eye, Smile
} from 'lucide-react'
import axios from 'axios'
import { HW, ALARM, sevDim, sevBd } from './UI'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const hdr = () => {
  const tok = sessionStorage.getItem('spiricomp_token')
           || localStorage.getItem('spiricomp_token') || ''
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

// ── Priority config ─────────────────────────────────────────────────
const PRIORITIES = [
  { id: 'normal', label: 'Normal', icon: Circle,        color: null           },
  { id: 'info',   label: 'Info',   icon: Info,          color: ALARM.warning  },
  { id: 'urgent', label: 'Urgent', icon: AlertTriangle, color: ALARM.critical },
]

const FALLBACK_RECIPIENTS = [
  { value: 'all',           label: 'Broadcast — all users' },
  { value: 'all_engineers', label: 'All engineers'         },
  { value: 'noc_engineer',  label: 'noc_engineer'          },
  { value: 'huawei_cn',     label: 'huawei_cn'             },
]

const isBroadcast = to => to === 'all' || to === 'all_engineers'

// ── Message Status Ladder (based on read_by array) ──────────────────
// According to your backend:
// - read_by = [] or read_by doesn't include current user = Sent (not read yet)
// - read_by includes only sender = Delivered (recipient hasn't opened)
// - read_by includes recipient = Seen
const STATUS_META = {
  sent:      { Icon: Check,     color: null,    label: 'Sent'      },
  delivered: { Icon: CheckCheck, color: null,   label: 'Delivered' },
  seen:      { Icon: CheckCheck, color: HW.blue, label: 'Seen'      },
}

function messageStatus(msg, currentUser) {
  // For messages sent by current user, check who has read them
  if (msg.from_user !== currentUser) return null
  
  const readBy = msg.read_by || []
  if (readBy.length === 0) return 'sent'
  // If recipient (or anyone else besides sender) has read it
  const hasRecipientRead = readBy.some(username => username !== msg.from_user)
  if (hasRecipientRead) return 'seen'
  return 'delivered'
}

// ── Timestamp formatting ───────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return ''
  try {
    const date = new Date(ts)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDate(ts) {
  if (!ts) return ''
  try {
    const date = new Date(ts)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) {
      return formatTime(ts)
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday ${formatTime(ts)}`
    } else {
      return `${date.toLocaleDateString()} ${formatTime(ts)}`
    }
  } catch {
    return ''
  }
}

// ── Emoji Picker Component ─────────────────────────────────────────
const EMOJIS = ['😊', '👍', '❤️', '😂', '🎉', '👋', '🙏', '🔥', '💡', '⚠️', '✅', '❌', '🔧', '⚡', '📢', '👀']

function EmojiPicker({ onSelect, onClose, theme }) {
  const pickerRef = useRef(null)
  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])
  
  return (
    <div ref={pickerRef} style={{
      position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
      background: theme.bgCard, border: `1px solid ${theme.border}`,
      borderRadius: 8, padding: 8, boxShadow: '0 4px 12px rgba(0,0,0,.3)',
      display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)',
      gap: 6, zIndex: 10000, width: 260
    }}>
      {EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => { onSelect(emoji); onClose() }}
          style={{
            background: 'transparent', border: 'none',
            fontSize: 20, cursor: 'pointer', padding: 6,
            borderRadius: 4, transition: 'background .15s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = theme.bgCardHover}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          {emoji}
        </button>
      ))}
    </div>
  )
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const isAdmin   = user?.role?.toLowerCase() === 'admin'
  const bottomRef = useRef(null)

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const r = await axios.get(`${BASE}/api/messages?limit=100`, { headers: hdr() })
      // Sort by timestamp ascending for display (oldest first)
      const messages = (r.data.messages || []).sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      )
      setMsgs(messages)
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

  // Poll for messages and unread counts
  useEffect(() => {
    fetchUnread()
    const unreadInterval = setInterval(fetchUnread, 15000)
    return () => clearInterval(unreadInterval)
  }, [fetchUnread])

  useEffect(() => {
    if (!open) return
    fetchMessages()
    const msgInterval = setInterval(() => fetchMessages(true), 15000)
    return () => clearInterval(msgInterval)
  }, [open, fetchMessages])

  // Auto-scroll to bottom
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [msgs, open])

  // Mark messages as read when opening panel
  useEffect(() => {
    if (!open) return
    // Clear the unread badge immediately
    setUnread(0)
    // Mark all as read on the server
    axios.patch(`${BASE}/api/messages/read-all`, {}, { headers: hdr() })
      .catch(err => console.error('Failed to mark all as read:', err))
  }, [open])

  const sendMessage = async () => {
    const content = input.trim()
    if (!content || sending) return
    
    setSending(true)
    setError(null)
    setShowEmojiPicker(false)
    
    try {
      await axios.post(
        `${BASE}/api/messages`,
        { 
          to_user: toUser, 
          content, 
          priority,
          msg_type: isBroadcast(toUser) ? 'broadcast' : 'direct' 
        },
        { headers: hdr() }
      )
      setInput('')
      await fetchMessages(true)
      // Scroll to bottom after sending
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (err) {
      setError(err.response?.data?.detail || 'Message not sent — retry')
    } finally {
      setSending(false)
    }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { 
      e.preventDefault(); 
      sendMessage() 
    }
  }

  const insertEmoji = (emoji) => {
    setInput(prev => prev + emoji)
  }

  const getInitials = (username) => {
    if (!username) return '?'
    return username.slice(0, 2).toUpperCase()
  }

  // Group messages by date
  const groupedMessages = msgs.reduce((groups, msg) => {
    try {
      const date = new Date(msg.timestamp).toLocaleDateString()
      if (!groups[date]) groups[date] = []
      groups[date].push(msg)
    } catch (e) {
      console.error('Error grouping message:', e)
    }
    return groups
  }, {})

  return (
    <>
      <style>{`
        @keyframes msgw-pop { from{transform:scale(.8);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes msgw-slide { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }

        .msgw-fab { transition: all .25s cubic-bezier(.22,1,.36,1); }
        .msgw-fab:hover { transform: scale(1.08); }

        .msgw-iconbtn { background: transparent; border: none; cursor: pointer;
          color: ${T.textDim}; padding: 4px; display: flex; transition: all .15s;
          border-radius: 4px; }
        .msgw-iconbtn:hover { color: ${HW.blue}; background: ${HW.blueDim}; }
        .msgw-iconbtn.danger:hover { color: ${ALARM.critical}; background: ${sevDim(ALARM.critical, '0E')}; }

        .msgw-item { animation: msgw-slide .2s ease; }

        .msgw-input { transition: border-color .15s; }
        .msgw-input:focus { border-color: ${HW.blue} !important; outline: none; }

        .msgw-panel { right: 90px; width: 380px; max-height: 600px; }
        @media (max-width: 480px) {
          .msgw-panel { right: 16px; width: calc(100vw - 32px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .msgw-fab, .msgw-fab:hover { transition: none; transform: none; }
          .msgw-item, .msgw-panel { animation: none !important; }
        }

        .msgw-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .msgw-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .msgw-scrollbar::-webkit-scrollbar-thumb {
          background: ${T.border};
          border-radius: 3px;
        }
        .msgw-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${T.textDim};
        }
      `}</style>

      {/* PANEL */}
      {open && (
        <div className="msgw-panel" style={{
          position: 'fixed', bottom: 96, height: 560, zIndex: 9997,
          display: 'flex', flexDirection: 'column',
          background: T.bgCard,
          border: `1px solid ${HW.blueBd}`,
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          animation: 'msgw-slide .3s cubic-bezier(.22,1,.36,1)',
          borderRadius: 12,
        }}>
          {/* Top accent */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, transparent, ${HW.blue}, ${HW.blueLight}, transparent)`,
            borderTopLeftRadius: 12, borderTopRightRadius: 12 }}/>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 16px', borderBottom: `1px solid ${T.border}`,
            background: HW.blueDim, flexShrink: 0, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%',
              background: `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MessageCircle size={15} color="#fff"/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: '0.3px' }}>
                {isAdmin ? 'Team Messages' : 'Message Admin'}
              </div>
              <div style={{ fontSize: 10, color: T.textDim }}>
                {msgs.length} messages • {unread} unread
              </div>
            </div>
            <button className="msgw-iconbtn" aria-label="Refresh messages"
              onClick={() => { fetchMessages(); fetchUnread(); }}
              style={{ padding: 6 }}>
              <RefreshCw size={14}/>
            </button>
            <button className="msgw-iconbtn danger" aria-label="Close messages"
              onClick={() => setOpen(false)}
              style={{ padding: 6 }}>
              <X size={14}/>
            </button>
          </div>

          {/* Message list */}
          <div className="msgw-scrollbar" style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '16px',
            display: 'flex', 
            flexDirection: 'column', 
            gap: 16
          }}>
            
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: T.textDim, fontSize: 13 }}>
                <RefreshCw size={18} color={T.textDim}
                  style={{ animation: 'noc-spin .9s linear infinite', marginRight: 10 }}/>
                Loading messages...
              </div>
            ) : error ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                background: sevDim(ALARM.critical, '0E'),
                border: `1px solid ${sevBd(ALARM.critical)}`,
                padding: '12px', fontSize: 12, color: ALARM.critical, borderRadius: 6 }}>
                <AlertTriangle size={14} color={ALARM.critical}/>{error}
              </div>
            ) : msgs.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                height: '100%', textAlign: 'center', color: T.textDim }}>
                <MessageCircle size={40} color={T.textDim} style={{ opacity: .3, marginBottom: 12 }}/>
                <div style={{ fontSize: 13, fontWeight: 500 }}>No messages yet</div>
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  {isAdmin ? 'Send a message to your team' : 'Write to the admin below'}
                </div>
              </div>
            ) : (
              Object.entries(groupedMessages).map(([date, dateMessages]) => (
                <div key={date}>
                  {/* Date separator */}
                  <div style={{
                    textAlign: 'center',
                    margin: '8px 0 12px',
                    position: 'relative'
                  }}>
                    <span style={{
                      background: T.bgCardHover,
                      padding: '4px 12px',
                      fontSize: 10,
                      color: T.textDim,
                      borderRadius: 12,
                      border: `1px solid ${T.border}`
                    }}>
                      {date === new Date().toLocaleDateString() ? 'Today' : date}
                    </span>
                  </div>
                  
                  {dateMessages.map(msg => {
                    const isMe = msg.from_user === user?.username
                    const pr = PRIORITIES.find(p => p.id === msg.priority)
                    const sev = pr?.color
                    const status = messageStatus(msg, user?.username)
                    const st = status ? STATUS_META[status] : null
                    const timeDisplay = formatDate(msg.timestamp)
                    
                    return (
                      <div key={msg.id} className="msgw-item"
                        style={{ 
                          display: 'flex', 
                          gap: 10,
                          marginBottom: 16,
                          flexDirection: isMe ? 'row-reverse' : 'row',
                          alignItems: 'flex-start'
                        }}>
                        
                        {/* Avatar */}
                        <div style={{ 
                          width: 36, 
                          height: 36, 
                          borderRadius: '50%', 
                          flexShrink: 0,
                          background: isMe
                            ? `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`
                            : `linear-gradient(135deg, #64748B, #475569)`,
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontSize: 13, 
                          fontWeight: 800, 
                          color: '#fff',
                          boxShadow: '0 2px 4px rgba(0,0,0,.15)'
                        }}>
                          {getInitials(msg.from_user || '?')}
                        </div>

                        <div style={{ maxWidth: '70%', flex: 1 }}>
                          {/* Sender name and metadata */}
                          <div style={{ 
                            fontSize: 11, 
                            color: T.textDim, 
                            marginBottom: 5,
                            display: 'flex', 
                            alignItems: 'center',
                            justifyContent: isMe ? 'flex-end' : 'flex-start', 
                            gap: 8,
                            flexWrap: 'wrap'
                          }}>
                            {!isMe && (
                              <span style={{ 
                                fontWeight: 800, 
                                color: T.text,
                                fontSize: 12
                              }}>
                                {msg.from_user}
                              </span>
                            )}
                            {isMe && (
                              <span style={{ 
                                fontWeight: 800, 
                                color: HW.blue,
                                fontSize: 12
                              }}>
                                You
                              </span>
                            )}
                            
                            {sev && (
                              <span style={{ 
                                fontSize: 9, 
                                fontWeight: 800, 
                                padding: '2px 8px',
                                background: sevDim(sev, '14'), 
                                border: `1px solid ${sevBd(sev)}`,
                                color: sev, 
                                letterSpacing: '0.5px', 
                                textTransform: 'uppercase',
                                borderRadius: 4, 
                                display: 'inline-flex',
                                alignItems: 'center', 
                                gap: 4 
                              }}>
                                {pr.icon && <pr.icon size={9}/>}
                                {msg.priority}
                              </span>
                            )}
                            
                            <span style={{ fontSize: 10 }}>
                              {timeDisplay}
                            </span>
                          </div>

                          {/* Message bubble */}
                          <div style={{
                            background: isMe ? HW.blueDim : T.bgCardHover,
                            border: `1px solid ${isMe ? HW.blueBd : T.border}`,
                            borderLeft: !isMe && sev === ALARM.critical
                              ? `3px solid ${ALARM.critical}` : undefined,
                            borderRadius: isMe ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                            padding: '10px 14px', 
                            fontSize: 13, 
                            color: T.text,
                            lineHeight: 1.5, 
                            wordBreak: 'break-word',
                            boxShadow: '0 1px 2px rgba(0,0,0,.05)'
                          }}>
                            {msg.content}
                          </div>

                          {/* Message status (own messages only) */}
                          {isMe && st && (
                            <div style={{ 
                              fontSize: 10, 
                              color: st.color || T.textDim,
                              textAlign: 'right', 
                              marginTop: 4,
                              display: 'flex', 
                              justifyContent: 'flex-end',
                              alignItems: 'center', 
                              gap: 4 
                            }}>
                              <st.Icon size={10}/> 
                              <span>{st.label}</span>
                              {st.label === 'Seen' && <Eye size={9} style={{ marginLeft: 2 }}/>}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
            
            <div ref={bottomRef} />
          </div>

          {/* Compose bar */}
          <div style={{ 
            padding: '14px 16px',
            borderTop: `1px solid ${T.border}`,
            background: T.mode === 'dark' ? 'rgba(0,0,0,.2)' : 'rgba(0,0,0,.02)',
            flexShrink: 0,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12
          }}>

            {/* Recipient + priority */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {isAdmin ? (
                <div style={{ position: 'relative', flex: 1, display: 'flex',
                  alignItems: 'center', background: T.bgCardHover,
                  border: `1px solid ${T.border}`, borderRadius: 6 }}>
                  <Radio size={12} color={HW.blue}
                    style={{ marginLeft: 10, flexShrink: 0,
                      opacity: isBroadcast(toUser) ? 1 : .4 }}/>
                  <select value={toUser} onChange={e => setToUser(e.target.value)}
                    aria-label="Recipient"
                    style={{ flex: 1, appearance: 'none', background: 'transparent',
                      color: T.text, border: 'none',
                      padding: '8px 28px 8px 10px', fontSize: 11,
                      fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                    {FALLBACK_RECIPIENTS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} color={T.textDim} style={{ position: 'absolute',
                    right: 10, top: '50%', transform: 'translateY(-50%)',
                    pointerEvents: 'none' }}/>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  background: T.bgCardHover, border: `1px solid ${T.border}`,
                  borderRadius: 6, padding: '8px 12px', fontSize: 11, color: T.textDim }}>
                  <Shield size={14} color={HW.blue}/>
                  To: <strong style={{ color: T.text, fontSize: 12 }}>Admin</strong>
                </div>
              )}

              {/* Priority selector */}
              <div role="radiogroup" aria-label="Message priority"
                style={{ display: 'flex', border: `1px solid ${T.border}`,
                  borderRadius: 6, overflow: 'hidden' }}>
                {PRIORITIES.map(p => {
                  const active = priority === p.id
                  const c = p.color || T.textMuted
                  return (
                    <button key={p.id} role="radio" aria-checked={active}
                      title={`Priority: ${p.label}`}
                      onClick={() => setPriority(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5,
                        padding: '8px 12px', fontSize: 11, fontWeight: 700,
                        fontFamily: 'inherit', cursor: 'pointer', border: 'none',
                        borderLeft: p.id !== 'normal' ? `1px solid ${T.border}` : 'none',
                        background: active ? sevDim(c, '14') : 'transparent',
                        color: active ? c : T.textDim,
                        transition: 'all .15s' }}>
                      <p.icon size={12}/>
                      {active && p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Input area */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', position: 'relative' }}>
              {/* Emoji picker button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="msgw-iconbtn"
                  aria-label="Insert emoji"
                  style={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: 6,
                    background: T.bgCardHover,
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center'
                  }}>
                  <Smile size={18}/>
                </button>
                {showEmojiPicker && (
                  <EmojiPicker 
                    onSelect={insertEmoji}
                    onClose={() => setShowEmojiPicker(false)}
                    theme={T}
                  />
                )}
              </div>
              
              <textarea
                className="msgw-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type a message — Enter to send"
                aria-label="Message text"
                rows={1}
                style={{ flex: 1, background: T.bgCardHover, color: T.text,
                  border: `1px solid ${T.border}`, borderRadius: 6,
                  padding: '10px 14px', fontSize: 13, fontFamily: 'inherit',
                  outline: 'none', resize: 'none',
                  minHeight: 42, maxHeight: 100, lineHeight: 1.4 }}
              />
              <button onClick={sendMessage} disabled={!input.trim() || sending}
                aria-label="Send message"
                style={{ width: 42, height: 42, borderRadius: 6, border: 'none',
                  background: input.trim() && !sending ? HW.blue : HW.blueDim,
                  color: '#fff',
                  cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all .2s',
                  boxShadow: input.trim() && !sending
                    ? `0 4px 12px ${HW.blueGlow}` : 'none' }}>
                {sending
                  ? <RefreshCw size={18} style={{ animation: 'noc-spin .9s linear infinite' }}/>
                  : <Send size={18}/>}
              </button>
            </div>

            {error && (
              <div style={{ marginTop: 10, fontSize: 11, color: ALARM.critical,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={12} color={ALARM.critical}/>{error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FLOATING BUTTON */}
      <button
        className="msgw-fab"
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close messages' : `Open messages${unread > 0 ? ` — ${unread} unread` : ''}`}
        style={{
          position: 'fixed', bottom: 90, right: 24,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: open
            ? `linear-gradient(135deg, ${HW.navy}, ${HW.navyMid})`
            : `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`,
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open ? '0 4px 16px rgba(0,0,0,.5)' : `0 4px 20px ${HW.blueGlow}`,
          zIndex: 9998,
          animation: 'msgw-pop .4s cubic-bezier(.22,1,.36,1)',
        }}>
        {open ? <X size={22}/> : <MessageCircle size={24}/>}

        {/* Unread badge */}
        {!open && unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 22, height: 22, borderRadius: 11,
            background: ALARM.critical,
            border: `2px solid ${T.bg}`,
            color: '#fff', fontSize: 11, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 6px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  )
}