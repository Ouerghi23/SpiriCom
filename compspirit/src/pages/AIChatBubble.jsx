// src/components/AIChatBubble.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC — Floating AI assistant (v2, aligned to UI.jsx)
// EN/ZH only · POST /api/ai/chat (Ollama/qwen2 backend proxy)
//
// FIXES vs previous version:
//  A-1  Palette unified. ~20 occurrences of legacy red #CF0A2C plus
//       #FF4060 / #E8102F / #D90B2E / #EF4444 / #3B82F6 / #2F81F7 /
//       #22D3EE / #F59E0B replaced with tokens:
//         identity chrome (FAB, header accents) → HW.red (brand)
//         errors / stop                          → ALARM.critical
//         offline / degraded                     → ALARM.minor
//         generating / links / md accents        → HW.blue / blueLight
//       Perpetual red pulse ring on the FAB removed — an always-on
//       red pulse reads as a permanent alarm and cries wolf.
//  A-2  Emojis removed (👋 ⚠️ ⚠ ●). Status dots are styled spans;
//       error/offline rows use Lucide AlertTriangle / CloudOff.
//  A-3  XSS: renderMd injected model output into innerHTML unescaped.
//       HTML is now escaped BEFORE markdown substitution.
//  A-4  Stop button now actually aborts the request (AbortController);
//       previously it only flipped `loading` and the late response
//       still overwrote the chat.
//  A-5  Brand regression: "SpiriComp" → "SpiriCom" (FIX-B1) in the
//       welcome message and footer.
//  A-6  Minimise was unrecoverable: height:0 hid the header that holds
//       the restore button. Minimised state now keeps the header bar.
//  A-7  Unread badge could never increment (open captured in the send
//       closure). Tracked via ref; replies arriving after close now
//       badge correctly.
//  A-8  Clear chat re-seeds the welcome message (effect deps missed
//       this case — list stayed empty until reopen).
//  A-9  Typing allowed while generating (textarea no longer disabled;
//       send stays blocked) — operators queue their next question.
//  A-10 Hover/focus via CSS classes (no inline mutation, no useState
//       hover in HeaderBtn). Suggestion hover no longer forces white
//       text (broken in light mode).
//  A-11 Typography floor ≥10px for data text (timestamps, status,
//       footer). Radius scale: panel sharp, controls 4px, bubbles 8px.
//  A-12 aria-labels on icon buttons, aria-pressed on EN/中 toggle,
//       prefers-reduced-motion respected.
//
// DEPENDS ON: <NocBaseStyles/> mounted in Layout (noc-pulse, noc-spin).
// ─────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import {
  X, Send, RefreshCw, Minimize2, Bot, StopCircle,
  ChevronDown, AlertTriangle, CloudOff,
} from 'lucide-react'
import axios from 'axios'
import { HW, ALARM, FLOAT, sevDim, sevBd } from '../components/UI'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── A-3: escape HTML before any markdown substitution ────────────────
const escapeHtml = s => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── Markdown-lite renderer (token colors — A-1) ──────────────────────
function renderMd(raw) {
  const text = escapeHtml(raw)
  return text
    .replace(/```([\w]*)\n?([\s\S]*?)```/g,
      (_, _l, c) =>
        `<pre style="background:rgba(0,0,0,.3);border-radius:4px;padding:10px 12px;` +
        `overflow-x:auto;margin:8px 0;font-size:11px;font-family:monospace;` +
        `color:${HW.blueLight};border-left:2px solid ${HW.blue}">${c.trim()}</pre>`)
    .replace(/`([^`]+)`/g,
      `<code style="background:rgba(128,128,128,.15);padding:1px 5px;border-radius:3px;` +
      `font-size:11px;color:${HW.blueLight};font-family:monospace">$1</code>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700">$1</strong>')
    .replace(/^#{1,3} (.+)$/gm,
      `<div style="font-weight:800;font-size:12px;color:${HW.blue};margin:10px 0 4px;` +
      `letter-spacing:.3px;text-transform:uppercase">$1</div>`)
    .replace(/^[•\-] (.+)$/gm,
      `<div style="display:flex;gap:6px;margin:3px 0;align-items:flex-start">` +
      `<span style="color:${HW.blue};flex-shrink:0;margin-top:1px">›</span><span>$1</span></div>`)
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

// ── NOC-specific suggestions ──────────────────────────────────────────
const SUGGESTIONS = {
  en: [
    'How many complaints are open right now?',
    'What is the current churn rate and risk breakdown?',
    'Show me the top 5 high-risk subscribers',
    'Which are the top 5 cities with most complaints?',
    'How is 5G adoption trending this month?',
    'Which phone brand has the highest churn risk?',
    'What anomalies were detected this week?',
    'What are the top complaint types today?',
  ],
  zh: [
    '目前有多少未解决的投诉？',
    '当前流失率和风险分布是多少？',
    '显示前 5 名高风险用户',
    '投诉最多的前 5 个城市是哪些？',
    '本月 5G 采用趋势如何？',
    '哪个手机品牌流失风险最高？',
    '本周检测到了哪些异常？',
    '今天的主要投诉类型是什么？',
  ],
}

// A-5: brand corrected. A-2: no emoji.
const welcomeMsg = lang => ({
  role: 'assistant',
  id:   'welcome',
  ts:   '',
  content: lang === 'zh'
    ? '你好！我是 **SpiriCom NOC 智能助手**（由 qwen2 驱动）。\n\n我可以帮你分析 Ooredoo 突尼斯的网络投诉、流失风险、5G 趋势和异常数据。请提问或从下方选择建议。'
    : "Hello! I'm the **SpiriCom NOC AI Assistant** (powered by qwen2).\n\nI can analyze Ooredoo Tunisia complaints, churn risk, 5G trends, and anomalies using live data. Ask me anything or pick a suggestion below.",
})

const ts = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// ── Typing indicator (A-1: brand blue) ────────────────────────────────
const TypingDots = () => (
  <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 4px' }}>
    {[0, 1, 2].map(d => (
      <span key={d} style={{
        width: 6, height: 6, borderRadius: '50%', background: HW.blue,
        display: 'inline-block',
        animation: `noc-dots 1.2s ${d * 0.2}s ease-in-out infinite`,
      }}/>
    ))}
  </div>
)

// ── Status dot (A-2: replaces ● glyphs) ───────────────────────────────
const Dot = ({ color, pulse }) => (
  <span style={{ width: 5, height: 5, borderRadius: '50%', background: color,
    display: 'inline-block', flexShrink: 0,
    animation: pulse ? 'noc-pulse 1.5s ease-in-out infinite' : 'none' }}/>
)

// ══════════════════════════════════════════════════════════════════════
export default function AIChatBubble() {
  const { theme: T } = useTheme()

  const [open,        setOpen]        = useState(false)
  const [messages,    setMessages]    = useState([])
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [lang,        setLang]        = useState('en')
  const [enabled,     setEnabled]     = useState(true)
  const [unread,      setUnread]      = useState(0)
  const [minimised,   setMinimised]   = useState(false)
  const [provInfo,    setProvInfo]    = useState(null)
  const [showAllSugg, setShowAllSugg] = useState(false)

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const abortRef  = useRef(null)        // A-4
  const openRef   = useRef(open)        // A-7
  const msgsRef   = useRef(messages)
  useEffect(() => { msgsRef.current = messages }, [messages])
  useEffect(() => { openRef.current = open }, [open])

  // AI status on mount
  useEffect(() => {
    axios.get(`${BASE}/api/ai/status`)
      .then(r => {
        setEnabled(r.data.enabled)
        setProvInfo({ provider: r.data.provider, model: r.data.model })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (open && !minimised) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, minimised])

  // Welcome message on first open / after clear
  useEffect(() => {
    if (open && messages.length === 0) setMessages([welcomeMsg(lang)])
  }, [open, lang, messages.length])   // A-8

  useEffect(() => {
    if (open && !minimised) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open, minimised])

  useEffect(() => { if (open) setUnread(0) }, [open])

  // Auto-resize textarea
  const handleInputChange = e => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px'
  }

  // A-4: real abort
  const stopGeneration = () => {
    abortRef.current?.abort()
  }

  const sendMessage = useCallback(async (text) => {
    const userText = (text || input).trim()
    if (!userText || loading) return
    setInput('')
    setError(null)
    if (inputRef.current) inputRef.current.style.height = `${FLOAT.control}px`

    const userMsg = { role: 'user',      content: userText, id: Date.now(),     ts: ts() }
    const asstMsg = { role: 'assistant', content: '',       id: Date.now() + 1, ts: ''   }
    setMessages(prev => [...prev, userMsg, asstMsg])
    setLoading(true)

    const history = [
      ...msgsRef.current
        .filter(m => m.id !== 'welcome' && m.content)
        .map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userText },
    ]

    const controller = new AbortController()
    abortRef.current = controller

    const setLastAssistant = content =>
      setMessages(prev => {
        const upd  = [...prev]
        const last = upd[upd.length - 1]
        if (last?.role === 'assistant') {
          upd[upd.length - 1] = { ...last, content, ts: ts() }
        }
        return upd
      })

    try {
      const r = await axios.post(`${BASE}/api/ai/chat`, {
        messages:       history,
        language:       lang,
        inject_context: true,
      }, { signal: controller.signal })

      const reply = r.data.reply || '(empty response)'
      if (r.data.provider) {
        setProvInfo({ provider: r.data.provider, model: r.data.model })
      }
      setLastAssistant(reply)
      if (!openRef.current) setUnread(n => n + 1)   // A-7

    } catch (err) {
      if (axios.isCancel?.(err) || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        setLastAssistant(lang === 'zh' ? '（已停止）' : '(stopped)')
      } else {
        const msg = err.response?.data?.detail || err.message || 'Connection error'
        setError(msg)
        setLastAssistant(msg)
      }
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }, [input, loading, lang])

  const clearChat = () => {
    abortRef.current?.abort()
    setMessages([welcomeMsg(lang)])   // A-8
    setError(null)
    setLoading(false)
  }

  if (!enabled) return null

  const suggs        = SUGGESTIONS[lang] || SUGGESTIONS.en
  const visibleSuggs = showAllSugg ? suggs : suggs.slice(0, 4)
  const isOffline    = provInfo?.provider === 'offline_fallback'

  return (
    <>
      <style>{`
        @keyframes aib-pop   { from{transform:scale(.8);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes aib-slide { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes aib-in    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .aib-msg  { animation: aib-in .22s ease; }

        .aib-sugg { transition: all .18s; cursor: pointer; }
        .aib-sugg:hover {
          background: ${HW.blueDim} !important;
          border-color: ${HW.blueBd} !important;
          color: ${T.text} !important;
        }

        .aib-send:hover:not(:disabled) { background: ${HW.redHover} !important; transform: scale(1.05); }
        .aib-fab { transition: all .25s cubic-bezier(.22,1,.36,1); }
        .aib-fab:hover { transform: scale(1.08); box-shadow: 0 8px 30px ${HW.redGlow} !important; }

        .aib-hbtn { background: transparent; border: 1px solid ${T.border};
          color: ${T.textDim}; cursor: pointer; width: 24px; height: 24px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 4px; transition: all .15s; }
        .aib-hbtn:hover        { border-color: ${HW.blue};        color: ${HW.blue}; }
        .aib-hbtn.danger:hover { border-color: ${ALARM.critical}; color: ${ALARM.critical}; }

        .aib-input { transition: border-color .2s, box-shadow .2s; }
        .aib-input:focus {
          border-color: ${HW.blue} !important;
          box-shadow: 0 0 0 3px ${HW.blueDim} !important;
        }

        .aib-scroll::-webkit-scrollbar { width: 4px; }
        .aib-scroll::-webkit-scrollbar-thumb { background: ${HW.blue}40; border-radius: 2px; }

        .aib-panel { right: ${FLOAT.panelRight(0)}px; width: ${FLOAT.panelW}px; }
        @media (max-width: 480px) {
          .aib-panel { right: 16px; width: calc(100vw - 32px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .aib-msg, .aib-panel { animation: none !important; }
          .aib-fab, .aib-fab:hover, .aib-send:hover:not(:disabled) { transition: none; transform: none; }
        }
      `}</style>

      {/* ── CHAT PANEL ── */}
      {open && (
        <div className="aib-panel" style={{
          position: 'fixed', bottom: FLOAT.panelBottom, zIndex: FLOAT.z.panel,
          height: minimised ? 'auto' : FLOAT.panelH,  // A-6
          display: 'flex', flexDirection: 'column',
          background: T.bgCard,
          border: `1px solid ${HW.redBd}`,
          boxShadow: FLOAT.panelShadow,
          animation: 'aib-slide .3s cubic-bezier(.22,1,.36,1)',
        }}>
          {/* Identity accent — brand chrome, the one red element */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: FLOAT.accentH,
            background: `linear-gradient(90deg, transparent, ${HW.red} 30%, ${HW.redHover} 60%, transparent)`,
          }}/>

          {/* ── Header (kept when minimised — A-6) ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: FLOAT.headerPad,
            borderBottom: minimised ? 'none' : `1px solid ${T.border}`,
            background: HW.redDim, flexShrink: 0,
          }}>
            <div style={{
              width: FLOAT.avatar, height: FLOAT.avatar, borderRadius: '50%', flexShrink: 0,
              background: isOffline
                ? 'linear-gradient(135deg,#374151,#1F2937)'
                : `linear-gradient(135deg, ${HW.red}, ${HW.navy})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={14} color="#fff"/>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text, letterSpacing: '.3px' }}>
                NOC <span style={{ color: HW.red }}>AI</span> Assistant
              </div>
              {/* A-2: Lucide + dots instead of ● ⚠ glyphs · A-11: 10px */}
              <div style={{ fontSize: 10, letterSpacing: '.8px',
                display: 'flex', alignItems: 'center', gap: 5,
                color: isOffline ? ALARM.minor : T.textDim }}>
                {loading ? (
                  <><Dot color={HW.blue} pulse/><span style={{ color: HW.blue }}>Generating…</span></>
                ) : isOffline ? (
                  <><CloudOff size={10}/><span>Offline — showing cached data</span></>
                ) : (
                  <><Dot color={ALARM.normal}/><span>{provInfo?.model || 'qwen2'} · Live context</span></>
                )}
              </div>
            </div>

            {/* EN / 中 toggle */}
            <div style={{
              display: 'flex', background: T.bgCardHover,
              border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden',
            }}>
              {[{ c: 'en', l: 'EN' }, { c: 'zh', l: '中' }].map(({ c, l }) => (
                <button key={c} onClick={() => setLang(c)}
                  aria-pressed={lang === c} aria-label={`Language: ${l}`}
                  style={{
                    padding: '3px 9px', border: 'none', cursor: 'pointer',
                    fontSize: 10, fontWeight: 800, transition: 'all .15s',
                    fontFamily: 'inherit',
                    background: lang === c ? HW.blue : 'transparent',
                    color:      lang === c ? '#fff'  : T.textMuted,
                  }}>
                  {l}
                </button>
              ))}
            </div>

            <button className="aib-hbtn" onClick={clearChat} aria-label="New chat" title="New chat">
              <RefreshCw size={10}/>
            </button>
            <button className="aib-hbtn" onClick={() => setMinimised(v => !v)}
              aria-label={minimised ? 'Restore' : 'Minimise'} title={minimised ? 'Restore' : 'Minimise'}>
              <Minimize2 size={10}/>
            </button>
            <button className="aib-hbtn danger" onClick={() => setOpen(false)}
              aria-label="Close assistant" title="Close">
              <X size={10}/>
            </button>
          </div>

          {!minimised && (
            <>
              {/* ── Messages ── */}
              <div className="aib-scroll" style={{
                flex: 1, overflowY: 'auto', padding: '12px 13px',
                display: 'flex', flexDirection: 'column', gap: 11,
              }}>
                {messages.map((msg, i) => {
                  const isUser = msg.role === 'user'
                  return (
                    <div key={msg.id || i} className="aib-msg" style={{
                      display: 'flex', gap: 7,
                      flexDirection: isUser ? 'row-reverse' : 'row',
                      alignItems: 'flex-end',
                    }}>
                      {/* Avatar — user = brand blue (consistent with
                          navbar + MessagingWidget), AI = red identity */}
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: isUser
                          ? `linear-gradient(135deg, ${HW.blue}, ${HW.navy})`
                          : `linear-gradient(135deg, ${HW.red}, ${HW.navy})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 800, color: '#fff',
                      }}>
                        {isUser ? 'N' : 'AI'}
                      </div>

                      <div style={{
                        maxWidth: '84%',
                        background: isUser ? HW.blueDim : T.bgCardHover,
                        border: `1px solid ${isUser ? HW.blueBd : T.border}`,
                        borderRadius: isUser ? '8px 2px 8px 8px' : '2px 8px 8px 8px',
                        padding: '8px 10px',
                      }}>
                        {isUser ? (
                          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55,
                            color: T.text, wordBreak: 'break-word' }}>
                            {msg.content}
                          </p>
                        ) : msg.content === '' && loading && i === messages.length - 1 ? (
                          <TypingDots/>
                        ) : (
                          <div style={{ fontSize: 12, lineHeight: 1.65, color: T.text,
                            wordBreak: 'break-word' }}
                            dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }}/>
                        )}
                        {msg.ts && (
                          <div style={{ fontSize: 10, color: T.textDim, marginTop: 4,
                            textAlign: isUser ? 'left' : 'right', letterSpacing: '.4px' }}>
                            {msg.ts}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef}/>
              </div>

              {/* ── Suggestions (first message only) ── */}
              {messages.length <= 1 && (
                <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: T.textDim, letterSpacing: '2px',
                    textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>
                    {lang === 'zh' ? '快速提问' : 'Quick questions'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {visibleSuggs.map((s, i) => (
                      <button key={i} className="aib-sugg"
                        onClick={() => sendMessage(s)}
                        disabled={loading}
                        style={{
                          background: T.bgCardHover,
                          border: `1px solid ${T.border}`,
                          color: T.textMuted, padding: '6px 10px', fontSize: 11,
                          textAlign: 'left', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 7, borderRadius: 4,
                        }}>
                        <span style={{ color: HW.blue, flexShrink: 0, fontWeight: 700 }}>›</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', flex: 1 }}>{s}</span>
                      </button>
                    ))}
                  </div>
                  {suggs.length > 4 && (
                    <button onClick={() => setShowAllSugg(v => !v)}
                      aria-expanded={showAllSugg}
                      style={{
                        marginTop: 5, width: '100%', background: 'transparent',
                        border: `1px solid ${T.border}`, color: T.textDim,
                        fontSize: 10, padding: 4, cursor: 'pointer',
                        fontFamily: 'inherit', letterSpacing: '1px', borderRadius: 4,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}>
                      <ChevronDown size={10} style={{
                        transform: showAllSugg ? 'rotate(180deg)' : 'none',
                        transition: 'transform .2s',
                      }}/>
                      {showAllSugg
                        ? (lang === 'zh' ? '收起' : 'Less')
                        : (lang === 'zh' ? `更多 (${suggs.length - 4})` : `More (${suggs.length - 4})`)}
                    </button>
                  )}
                </div>
              )}

              {/* ── Error banner (A-1/A-2) ── */}
              {error && (
                <div style={{ margin: '0 11px 7px', padding: '7px 11px', fontSize: 11,
                  background: sevDim(ALARM.critical, '0E'),
                  border: `1px solid ${sevBd(ALARM.critical)}`,
                  color: ALARM.critical, borderRadius: 4, flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0 }}/>{error}
                </div>
              )}

              {/* ── Input area ── */}
              <div style={{
                padding: '9px 11px 13px',
                borderTop: `1px solid ${T.border}`,
                background: T.mode === 'dark' ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.02)',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
                  <textarea
                    ref={inputRef}
                    className="aib-input"
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder={
                      lang === 'zh'
                        ? '请输入问题… (Enter 发送，Shift+Enter 换行)'
                        : 'Ask about complaints, churn, 5G… (Enter to send)'
                    }
                    rows={1}
                    aria-label={lang === 'zh' ? '输入问题' : 'Ask the assistant'}
                    style={{
                      flex: 1, background: T.bgCardHover, color: T.text,
                      border: `1px solid ${T.border}`, borderRadius: 4,
                      padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
                      outline: 'none', resize: 'none', lineHeight: 1.45,
                      minHeight: FLOAT.control, maxHeight: 96, overflow: 'auto',
                    }}
                  />
                  {loading ? (
                    <button onClick={stopGeneration} aria-label="Stop generating"
                      title="Stop generating"
                      style={{
                        width: FLOAT.control, height: FLOAT.control, borderRadius: FLOAT.radius, border: 'none',
                        background: sevDim(ALARM.critical, '18'), color: ALARM.critical,
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0,
                      }}>
                      <StopCircle size={16}/>
                    </button>
                  ) : (
                    <button className="aib-send"
                      onClick={() => sendMessage()}
                      disabled={!input.trim()}
                      aria-label="Send"
                      style={{
                        width: FLOAT.control, height: FLOAT.control, borderRadius: FLOAT.radius, border: 'none',
                        background: input.trim() ? HW.red : HW.redDim,
                        color: '#fff',
                        cursor: input.trim() ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0,
                        transition: 'all .2s',
                        boxShadow: input.trim() ? `0 3px 12px ${HW.redGlow}` : 'none',
                      }}>
                      <Send size={14}/>
                    </button>
                  )}
                </div>

                {/* Footer — provider badge. A-5: SpiriCom. A-11: 10px. */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginTop: 5, fontSize: 10,
                  color: T.textDim, letterSpacing: '.4px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {isOffline ? (
                      <><CloudOff size={10} color={ALARM.minor}/>
                        <span style={{ color: ALARM.minor }}>offline · start ollama serve</span></>
                    ) : (
                      `SpiriCom NOC · ${provInfo?.provider || 'ollama'} / ${provInfo?.model || 'qwen2'}`
                    )}
                  </span>
                  {loading && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: HW.blue }}>
                      <Dot color={HW.blue} pulse/>Generating…
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FLOATING BUBBLE ── */}
      <button className="aib-fab"
        onClick={() => { setOpen(v => !v); setMinimised(false) }}
        aria-label={open
          ? 'Close AI assistant'
          : `Open NOC AI assistant${unread > 0 ? ` — ${unread} unread` : ''}`}
        title={open ? 'Close AI Assistant' : 'Open NOC AI Assistant'}
        style={{
          position: 'fixed', bottom: FLOAT.fabBottom(0), right: FLOAT.right,
          width: FLOAT.fab, height: FLOAT.fab, borderRadius: '50%', border: 'none',
          background: open
            ? `linear-gradient(135deg, ${HW.navy}, ${HW.navyMid})`
            : `linear-gradient(135deg, ${HW.red}, ${HW.navy})`,   // A-1: identity chrome
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open
            ? '0 4px 18px rgba(0,0,0,.5)'
            : `0 4px 22px ${HW.redGlow}`,
          zIndex: FLOAT.z.fabTop,
          animation: 'aib-pop .4s cubic-bezier(.22,1,.36,1)',
        }}>
        {open ? <X size={FLOAT.fabIcon}/> : <Bot size={FLOAT.fabIcon}/>}

        {/* Unread badge — replies are good news, not alarms → normal green */}
        {!open && unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            minWidth: 20, height: 20, borderRadius: 10,
            background: ALARM.normal,
            border: `2px solid ${T.bg}`,
            color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        {/* A-1: perpetual red pulse ring removed */}
      </button>
    </>
  )
}