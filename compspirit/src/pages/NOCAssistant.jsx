// src/pages/NOCAssistant.jsx


import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme }       from '../context/ThemeContext'
import {
  Send, StopCircle, RefreshCw, Copy, Check,
  Radio, Zap, Wifi, BarChart3, AlertTriangle,
  MessageSquare, Cpu, Globe, ChevronRight,
} from 'lucide-react'

// ── Anthropic API call ────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'



// ── NOC System Prompt ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are SpiriComp NOC Assistant — an expert AI engineer specialized in:

• Huawei telecom infrastructure (4G LTE, 5G NR, Core Network, RAN, iManager, U2000)
• Network Operations Center (NOC) workflows, incident management, escalation procedures
• Quality of Experience (QoE) and Quality of Service (QoS) analysis for mobile operators
• KPI/KQI analysis: RSRP, RSRQ, SINR, Throughput, Latency, Packet Loss, Jitter, MOS
• Complaint analytics and root cause analysis for telecom operators
• Tunisia telecom market: Ooredoo, Orange Tunisie, Tunisie Telecom
• ML models for anomaly detection, spike prediction, customer segmentation
• SpiriComp dashboard modules: Overview, Map, Anomalies, Forecasting, RCA, Segments, NLP

You are embedded in the SpiriComp Telecom Complaint Analytics Platform (PFE 2026, Huawei Technologies Tunisia).

Rules:
- Be concise and technical. Engineers don't need fluff.
- Use bullet points for lists. Use code blocks for commands/configs.
- Answer in the SAME language as the question (Arabic/French/English).
- For Arabic questions, respond in Arabic with technical terms kept in English.
- When discussing KPIs, always include units and acceptable thresholds.
- If asked about anomaly scores, reference the IsolationForest + Z-score consensus method used in SpiriComp.
- Format responses cleanly — use **bold** for key terms, \`code\` for technical values.
- For Chinese questions, respond in Simplified Chinese (中文) with technical terms kept in English.`

// ── Suggested prompts ─────────────────────────────────────────────────
const SUGGESTIONS = {
  fr: [
    { icon: AlertTriangle, text: "Qu'est-ce qu'un score d'anomalie > 0.85 signifie dans SpiriComp ?" },
    { icon: BarChart3,     text: "Quels sont les seuils normaux pour RSRP, RSRQ et SINR en LTE ?" },
    { icon: Wifi,          text: "Comment diagnostiquer une dégradation QoE dans une cellule Huawei ?" },
    { icon: Cpu,           text: "Explique la différence entre KPI et KQI dans un réseau mobile." },
    { icon: Globe,         text: "Quelles régions tunisiennes ont typiquement le plus de réclamations ?" },
    { icon: Zap,           text: "Comment fonctionne le pipeline NLP 6 étapes de SpiriComp ?" },
  ],
  ar: [
    { icon: AlertTriangle, text: "ما معنى درجة الشذوذ أكبر من 0.85 في SpiriComp؟" },
    { icon: BarChart3,     text: "ما هي العتبات الطبيعية لـ RSRP و RSRQ و SINR في شبكة LTE؟" },
    { icon: Wifi,          text: "كيف تشخص تدهور جودة التجربة في خلية Huawei؟" },
    { icon: Cpu,           text: "ما الفرق بين KPI و KQI في شبكة الجوال؟" },
    { icon: Globe,         text: "ما هي المناطق التونسية التي تسجل أكثر الشكاوى؟" },
    { icon: Zap,           text: "كيف يعمل خط أنابيب NLP ذو الـ 6 مراحل في SpiriComp؟" },
  ],
  en: [
    { icon: AlertTriangle, text: "What does an anomaly score > 0.85 mean in SpiriComp?" },
    { icon: BarChart3,     text: "What are normal thresholds for RSRP, RSRQ, and SINR in LTE?" },
    { icon: Wifi,          text: "How do I diagnose QoE degradation in a Huawei cell?" },
    { icon: Cpu,           text: "Explain the difference between KPI and KQI in a mobile network." },
    { icon: Globe,         text: "Which Tunisian regions typically have the most complaints?" },
    { icon: Zap,           text: "How does the SpiriComp 6-stage NLP pipeline work?" },
  ],
  zh: [
    { icon: AlertTriangle, text: "SpiriComp 中异常评分 > 0.85 意味着什么？" },
    { icon: BarChart3,     text: "LTE 网络中 RSRP、RSRQ 和 SINR 的正常阈值是多少？" },
    { icon: Wifi,          text: "如何诊断华为基站的 QoE 质量下降问题？" },
    { icon: Cpu,           text: "请解释移动网络中 KPI 和 KQI 的区别。" },
    { icon: Globe,         text: "突尼斯哪些地区通常投诉数量最多？" },
    { icon: Zap,           text: "SpiriComp 的 6 阶段 NLP 流水线是如何工作的？" },
  ],
}

// ── Markdown-lite renderer ────────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="noc-code-block"><code class="lang-${lang}">${code.trim()}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code class="noc-inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="noc-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="noc-h2">$1</h2>')
    .replace(/^• (.+)$/gm, '<li class="noc-li">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="noc-li">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="noc-li noc-li-num">$1. $2</li>')
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul class="noc-ul">${m}</ul>`)
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

// ── Copy button ────────────────────────────────────────────────────────
function CopyBtn({ text, T }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button onClick={copy} title="Copy" style={{
      background:'transparent', border:`1px solid ${T.border}`,
      // BUG-2: fallback for T.green
      color: copied ? (T.green||'#22C55E') : T.textDim,
      cursor:'pointer', width:26, height:26,
      display:'flex', alignItems:'center', justifyContent:'center',
      transition:'all .2s', borderRadius:4, flexShrink:0,
    }}>
      {copied ? <Check size={11}/> : <Copy size={11}/>}
    </button>
  )
}

// ── Single message bubble ──────────────────────────────────────────────
function MessageBubble({ msg, T, isStreaming }) {
  const isUser = msg.role === 'user'
  const html   = isUser ? null : renderMarkdown(msg.content)

  return (
    <div style={{
      display:'flex', gap:12,
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems:'flex-start',
      animation:'noc-msg-in .3s cubic-bezier(.22,1,.36,1)',
    }}>
      {/* Avatar */}
      <div style={{
        width:32, height:32, borderRadius:'50%', flexShrink:0,
        background: isUser
          ? 'linear-gradient(135deg,#CF0A2C,#9F0822)'
          : 'linear-gradient(135deg,#1A3A6A,#2F81F7)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:11, fontWeight:800, color:'#fff', letterSpacing:'.5px',
        border:`1px solid ${isUser ? 'rgba(207,10,44,.4)' : 'rgba(47,129,247,.4)'}`,
      }}>
        {isUser ? 'NOC' : 'AI'}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth:'78%', minWidth:60,
        background: isUser
          ? T.mode === 'dark' ? 'rgba(207,10,44,.12)' : 'rgba(207,10,44,.08)'
          : T.bgCard,
        border:`1px solid ${isUser ? 'rgba(207,10,44,.25)' : T.border}`,
        borderRadius: isUser ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
        padding:'12px 14px', position:'relative',
      }}>
        {isUser ? (
          <p style={{ margin:0, fontSize:13, lineHeight:1.6,
            color:T.text, wordBreak:'break-word' }}>
            {msg.content}
          </p>
        ) : (
          <>
            <div
              className="noc-markdown"
              style={{ fontSize:13, lineHeight:1.7, color:T.text, wordBreak:'break-word' }}
              dangerouslySetInnerHTML={{ __html: isStreaming
                ? renderMarkdown(msg.content) + '<span class="noc-cursor">▍</span>'
                : html }}
            />
            {!isStreaming && msg.content && (
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
                <CopyBtn text={msg.content} T={T}/>
              </div>
            )}
          </>
        )}
        {msg.ts && (
          <div style={{ fontSize:9, color:T.textDim, marginTop:6,
            textAlign: isUser ? 'left' : 'right', letterSpacing:'.5px' }}>
            {msg.ts}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function NOCAssistant() {
  const { t, i18n }  = useTranslation()
  const { theme: T } = useTheme()

  // BUG-3: stable fallback constants to avoid repeated T.primary||... everywhere
  const PRIMARY = T.primary || '#3B82F6'

  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error,     setError]     = useState(null)
  const [lang,      setLang]      = useState('en')

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const abortRef     = useRef(null)

  // BUG-5: ref always holds latest messages so sendMessage doesn't need
  // `messages` as a dep — prevents stale-history on rapid sends
  const messagesRef = useRef(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])

  const suggestions = SUGGESTIONS[lang] || SUGGESTIONS.fr

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  // BUG-1: Welcome message only when messages array is EMPTY.
  // Previously this ran on every lang change and wiped the conversation.
  // Now it uses a functional updater: if messages already has content,
  // it returns the array unchanged.
  useEffect(() => {
    const welcomeContent = lang === 'zh'
      ? '欢迎使用 **SpiriComp NOC 智能助手** 👋\n\n我是专注于以下领域的 AI 助手：\n- 华为基础设施 (4G/5G/RAN/核心网)\n- QoE/QoS 分析与 KPI 阈值\n- NOC 故障诊断与升级处理\n- SpiriComp 分析平台\n\n请提问或从下方选择建议。'
      : lang === 'ar'
      ? 'مرحباً بك في **SpiriComp NOC Assistant** 👋\n\nأنا مساعد ذكاء اصطناعي متخصص في:\n- شبكات Huawei (4G/5G)\n- تحليل جودة التجربة QoE\n- مركز عمليات الشبكة NOC\n- شبكات الاتصالات التونسية\n\nاكتب سؤالك أو اختر اقتراحاً من الأسفل.'
      : lang === 'en'
      ? "Welcome to **SpiriComp NOC Assistant** 👋\n\nI'm an AI specialized in:\n- Huawei infrastructure (4G/5G/RAN/Core)\n- QoE/QoS analysis and KPI thresholds\n- NOC incident diagnosis and escalation\n- SpiriComp analytics platform\n\nAsk me anything or pick a suggestion below."
      : "Bienvenue dans **SpiriComp NOC Assistant** 👋\n\nJe suis un assistant IA spécialisé en :\n- Infrastructure Huawei (4G/5G/RAN/Core)\n- Analyse QoE/QoS et seuils KPI\n- Diagnostic d'incidents NOC\n- Plateforme SpiriComp\n\nPosez une question ou choisissez une suggestion ci-dessous."

    setMessages(prev => {
      // BUG-1: don't replace existing conversation on language change
      if (prev.length > 0) return prev
      return [{
        role: 'assistant',
        content: welcomeContent,
        ts: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        id: 'welcome',
      }]
    })
  }, [lang])

  // BUG-5: sendMessage no longer has `messages` as a dep — uses messagesRef
const sendMessage = useCallback(async (text) => {
  const userText = (text || input).trim()
  if (!userText || streaming) return
 
  setInput('')
  setError(null)
 
  const userMsg = {
    role: 'user', content: userText,
    ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    id: Date.now(),
  }
  const assistantMsg = { role: 'assistant', content: '', ts: '', id: Date.now() + 1 }
 
  setMessages(prev => [...prev, userMsg, assistantMsg])
  setStreaming(true)

    // BUG-5: read current messages from ref — always fresh, not stale closure
  const history = messagesRef.current
    .filter(m => m.id !== 'welcome')
    .map(m => ({ role: m.role, content: m.content }))
  history.push({ role: 'user', content: userText })
 
  try {
   const controller = new AbortController()
      abortRef.current = controller

      // NA-BUG-1/3 fix: call the FastAPI backend, not Anthropic directly.
      // The backend applies: API key, provider routing (Ollama/Groq/Claude/…),
      // NOC context injection (churn scores, anomalies, 5G coverage),
      // admin system prompt additions, token usage tracking, and the
      // enabled/disabled flag set in ConfigureAI.
      const tok = sessionStorage.getItem('spiricomp_token') ||
                  localStorage.getItem('spiricomp_token') || ''

      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        signal:  controller.signal,
        body: JSON.stringify({
          messages:       history,
          language:       lang,
          inject_context: true,    // injects live NOC data from artifacts
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.detail || `HTTP ${response.status}`)
      }

      // Backend returns { reply, elapsed, provider, model }
      const full = data.reply || '…'
 
    setMessages(prev => {
      const updated = [...prev]
      const last    = updated[updated.length - 1]
      if (last?.role === 'assistant') {
        updated[updated.length - 1] = {
          ...last, content: full,
          ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      }
      return updated
    })

} catch (err) {
    if (err.name === 'AbortError') return
    setError(err.message || 'Connection error')
    setMessages(prev => {
      const updated = [...prev]
      if (updated[updated.length - 1]?.role === 'assistant') {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `⚠️ ${err.message}`,
          ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      }
      return updated
    })
  } finally {
    setStreaming(false)
    abortRef.current = null
    setTimeout(() => inputRef.current?.focus(), 100)
  }
  // BUG-5: `messages` removed from deps — read via messagesRef instead
  }, [input, streaming, lang])


  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const stopStreaming = () => {
    abortRef.current?.abort()
    setStreaming(false)
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
    setStreaming(false)
    abortRef.current?.abort()
    // After clearing, the welcome useEffect won't re-fire (lang didn't change),
    // so we set the welcome message directly here.
    setTimeout(() => {
      setMessages([{
        role:'assistant',
        content: lang === 'zh'
          ? '新对话已开始。有什么我可以帮您解决的？'
          : lang === 'ar'
          ? 'محادثة جديدة. كيف يمكنني مساعدتك؟'
          : lang === 'en' ? 'New conversation. How can I help?'
          : 'Nouvelle conversation. Comment puis-je vous aider ?',
        ts: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        id: 'welcome',
      }])
    }, 50)
  }

  const lastIsStreaming = streaming && messages[messages.length - 1]?.role === 'assistant'

  return (
    <div style={{ padding:'40px 48px 0', maxWidth:1600, margin:'0 auto',
      height:'calc(100vh - 68px)', display:'flex', flexDirection:'column',
      background:T.bg, transition:'background .3s' }}>

      <style>{`
        @keyframes noc-msg-in {
          from { opacity:0; transform:translateY(10px) }
          to   { opacity:1; transform:translateY(0) }
        }
        @keyframes noc-cursor-blink {
          0%,100% { opacity:1 } 50% { opacity:0 }
        }
        .noc-cursor {
          display:inline-block;
          color:${PRIMARY};
          animation:noc-cursor-blink .7s ease-in-out infinite;
          font-weight:400; margin-left:2px;
        }
        .noc-markdown h2.noc-h2 {
          font-family:'Barlow Condensed',sans-serif; font-size:16px; font-weight:800;
          color:${T.text}; margin:14px 0 6px; letter-spacing:-.3px;
        }
        .noc-markdown h3.noc-h3 {
          font-size:13px; font-weight:700; color:${T.text}; margin:10px 0 4px;
        }
        .noc-markdown ul.noc-ul { margin:8px 0; padding:0; list-style:none; }
        .noc-markdown li.noc-li {
          padding:3px 0 3px 16px; position:relative;
          color:${T.text}; font-size:13px; line-height:1.65;
        }
        .noc-markdown li.noc-li::before {
          content:''; position:absolute; left:4px; top:11px;
          width:5px; height:5px; border-radius:50%; background:#CF0A2C;
        }
        .noc-markdown li.noc-li-num::before { display:none; }
        .noc-markdown li.noc-li-num { padding-left:4px; }
        pre.noc-code-block {
          background:${T.mode==='dark'?'#050508':'#F0F2F8'};
          border:1px solid ${T.border}; border-radius:6px;
          padding:12px 14px; overflow-x:auto; margin:10px 0;
          font-family:'JetBrains Mono','Fira Code',monospace;
        }
        code.lang- { font-size:11px; color:#22D3EE; line-height:1.6; }
        code.noc-inline-code {
          background:${T.mode==='dark'?'rgba(255,255,255,.06)':'rgba(0,0,0,.07)'};
          border:1px solid ${T.border}; border-radius:3px;
          padding:1px 6px; font-size:11.5px; color:#22D3EE;
          font-family:'JetBrains Mono','Fira Code',monospace;
        }
        .noc-input-row { display:flex; gap:8px; align-items:flex-end; }
        .noc-textarea {
          flex:1; background:${T.bgCard}; color:${T.text};
          border:1px solid ${T.border}; border-radius:10px;
          padding:12px 16px; font-size:13px; font-family:'Inter',system-ui;
          outline:none; resize:none; line-height:1.5; min-height:46px; max-height:140px;
          transition:border-color .2s, box-shadow .2s;
        }
        .noc-textarea:focus {
          border-color:#CF0A2C;
          box-shadow:0 0 0 3px rgba(207,10,44,.1);
        }
        .noc-textarea::placeholder { color:${T.textDim}; }
        .noc-send-btn {
          width:44px; height:44px; border-radius:10px; border:none; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          background:linear-gradient(135deg,#D90B2E,#CF0A2C); color:#fff;
          transition:all .2s; flex-shrink:0;
          box-shadow:0 4px 14px rgba(207,10,44,.3);
        }
        .noc-send-btn:hover:not(:disabled) {
          background:linear-gradient(135deg,#E8102F,#D90B2E);
          transform:translateY(-1px); box-shadow:0 6px 20px rgba(207,10,44,.4);
        }
        .noc-send-btn:disabled { background:${T.border}; cursor:not-allowed; box-shadow:none; transform:none; }
        .noc-stop-btn {
          width:44px; height:44px; border-radius:10px;
          border:1px solid rgba(239,68,68,.35); cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          background:rgba(239,68,68,.08); color:#EF4444;
          transition:all .2s; flex-shrink:0;
        }
        .noc-stop-btn:hover { background:rgba(239,68,68,.15); }
        .noc-suggestion {
          display:flex; align-items:center; gap:8px; padding:8px 14px;
          background:${T.bgCard}; border:1px solid ${T.border};
          border-radius:8px; cursor:pointer; transition:all .2s;
          font-size:12px; color:${T.textMuted}; text-align:left;
          font-family:'Inter',system-ui; white-space:nowrap;
        }
        .noc-suggestion:hover {
          border-color:rgba(207,10,44,.3);
          background:rgba(207,10,44,.04);
          color:${T.text};
        }
        .noc-lang-btn {
          padding:5px 14px; border-radius:6px; font-size:10px; font-weight:700;
          letter-spacing:1px; text-transform:uppercase; cursor:pointer;
          transition:all .2s; font-family:'Inter',system-ui;
          border:1px solid ${T.border}; background:transparent; color:${T.textMuted};
        }
        .noc-lang-btn.active { background:#CF0A2C; border-color:#CF0A2C; color:#fff; }
        .noc-lang-btn:hover:not(.active) { border-color:rgba(207,10,44,.3); color:${T.text}; }
        .noc-messages::-webkit-scrollbar { width:4px; }
        .noc-messages::-webkit-scrollbar-track { background:transparent; }
        .noc-messages::-webkit-scrollbar-thumb { background:${T.border}; border-radius:2px; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
        borderBottom:`1px solid ${T.border}`, paddingBottom:20, marginBottom:0,
        flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7,
              background:'rgba(47,129,247,.1)', border:'1px solid rgba(47,129,247,.28)', padding:'5px 12px' }}>
              <Cpu size={10} color="#5B9FFA"/>
              <span style={{ fontSize:9, fontWeight:800, letterSpacing:'2.5px',
                textTransform:'uppercase', color:'#5B9FFA' }}>
                AI ASSISTANT · LIVE
              </span>
            </div>
            <span style={{ fontSize:10, color:T.textDim, letterSpacing:'1.5px' }}>
              Claude Sonnet · Huawei NOC Expert
            </span>
          </div>
          <h1 style={{ fontFamily:"'Barlow Condensed',sans-serif",
            fontSize:'clamp(24px,3vw,46px)', fontWeight:900,
            letterSpacing:'-1.5px', lineHeight:1, color:T.text, margin:0 }}>
            NOC <span style={{ color:'#CF0A2C', fontStyle:'italic' }}>INTELLIGENCE</span>
          </h1>
          <p style={{ fontSize:13, color:T.textMuted, marginTop:6, fontWeight:300 }}>
            Assistant IA spécialisé Huawei · QoE · Telecom · SpiriComp
          </p>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          {/* EN ↔ ZH toggle — matches other dashboard pages */}
          <div style={{ display:'flex', background:T.bgCard,
            border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
            {[
              { code:'en', label:'EN' },
              { code:'zh', label:'中文' },
            ].map(({ code, label }) => (
              <button key={code}
                onClick={() => setLang(code)}
                style={{
                  padding:'6px 16px', border:'none', cursor:'pointer',
                  fontSize:11, fontWeight:700, letterSpacing:'.5px',
                  fontFamily:"'Inter',system-ui", transition:'all .2s',
                  background: lang===code ? '#CF0A2C' : 'transparent',
                  color:      lang===code ? '#fff'    : T.textMuted,
                  borderRight: code==='en' ? `1px solid ${T.border}` : 'none',
                }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ width:1, height:24, background:T.border }}/>

          {/* BUG-3+4: PRIMARY constant with fallback */}
          <button onClick={clearChat} title="New chat" style={{
            background:'transparent', border:`1px solid ${T.border}`,
            color:T.textMuted, cursor:'pointer', width:32, height:32,
            display:'flex', alignItems:'center', justifyContent:'center',
            borderRadius:8, transition:'all .2s',
          }}
            onMouseOver={e=>{ e.currentTarget.style.borderColor=PRIMARY; e.currentTarget.style.color=PRIMARY }}
            onMouseOut={e=>{  e.currentTarget.style.borderColor=T.border;  e.currentTarget.style.color=T.textMuted }}>
            <RefreshCw size={13}/>
          </button>
        </div>
      </div>

      {/* ── MESSAGES ── */}
      <div className="noc-messages" style={{
        flex:1, overflowY:'auto', padding:'20px 0',
        display:'flex', flexDirection:'column', gap:16,
      }}>
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id || i}
            msg={msg}
            T={T}
            isStreaming={lastIsStreaming && i === messages.length - 1}
          />
        ))}

        {/* Typing indicator */}
        {streaming && messages[messages.length-1]?.content === '' && (
          <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
              background:'linear-gradient(135deg,#1A3A6A,#2F81F7)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:800, color:'#fff' }}>
              AI
            </div>
            <div style={{ background:T.bgCard, border:`1px solid ${T.border}`,
              borderRadius:'2px 12px 12px 12px', padding:'14px 18px',
              display:'flex', alignItems:'center', gap:6 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width:7, height:7, borderRadius:'50%',
                  // BUG-3: PRIMARY with fallback
                  background: PRIMARY,
                  animation:`noc-cursor-blink 1.2s ${i*.2}s ease-in-out infinite`,
                }}/>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {/* ── SUGGESTIONS ── */}
      {messages.length <= 1 && (
        <div style={{ paddingBottom:12 }}>
          <div style={{ fontSize:9, color:T.textDim, letterSpacing:'2px',
            textTransform:'uppercase', marginBottom:10, fontWeight:700,
            display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:16, height:1, background:T.textDim, display:'inline-block' }}/>
            Suggestions
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {suggestions.map((s, i) => (
              <button key={i} className="noc-suggestion"
                onClick={() => sendMessage(s.text)}
                disabled={streaming}>
                <s.icon size={12} color="#CF0A2C" style={{ flexShrink:0 }}/>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', maxWidth:260 }}>
                  {s.text}
                </span>
                <ChevronRight size={10} color={T.textDim} style={{ flexShrink:0 }}/>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── INPUT ── */}
      <div style={{ paddingTop:12, paddingBottom:24,
        borderTop:`1px solid ${T.border}`, background:T.bg, transition:'background .3s' }}>
        <div className="noc-input-row">
          <textarea
            ref={inputRef}
            className="noc-textarea"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              lang === 'zh' ? '请输入您的问题…（Enter 发送，Shift+Enter 换行）'
              : lang === 'ar' ? 'اكتب سؤالك… (Enter للإرسال، Shift+Enter للسطر الجديد)'
              : lang === 'en' ? 'Ask a question… (Enter to send, Shift+Enter for newline)'
              : 'Posez une question… (Enter pour envoyer, Shift+Enter pour aller à la ligne)'
            }
            rows={1}
            disabled={streaming}
            dir={lang === 'ar' ? 'rtl' : 'ltr'}  
          />

          {streaming ? (
            <button className="noc-stop-btn" onClick={stopStreaming} title="Stop">
              <StopCircle size={18}/>
            </button>
          ) : (
            <button className="noc-send-btn" onClick={() => sendMessage()}
              disabled={!input.trim()} title="Send">
              <Send size={16}/>
            </button>
          )}
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
          <span style={{ fontSize:9, color:T.textDim, letterSpacing:'1px' }}>
            {lang === 'zh' ? '由 Claude Sonnet · Anthropic 驱动'
             : lang === 'ar' ? 'مشغّل بـ Claude Sonnet · Anthropic'
             : lang === 'en' ? 'Powered by Claude Sonnet · Anthropic'
             : 'Propulsé par Claude Sonnet · Anthropic'}
          </span>
          <span style={{ fontSize:9, color:T.textDim, letterSpacing:'1px' }}>
            {streaming ? (
              // BUG-3: PRIMARY with fallback
              <span style={{ color:PRIMARY }}>● Génération en cours…</span>
            ) : (
              <span>SpiriComp NOC · PFE 2026</span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}