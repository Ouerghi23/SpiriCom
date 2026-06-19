// src/pages/admin/ConfigureAI.jsx
import { useState, useEffect, useCallback } from 'react'
import { useTheme }   from '../../context/ThemeContext'
import { HW, ALARM, FONT, gapColor } from '../../components/UI'
import {
  Bot, Save, RefreshCw, Eye, EyeOff, CheckCircle,
  AlertTriangle, Zap, Trash2, Server, Key,
} from 'lucide-react'
import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const hdr  = () => {
  const tok = sessionStorage.getItem('spiricomp_token') ||
              localStorage.getItem('spiricomp_token') || ''
  return { Authorization: `Bearer ${tok}` }
}

const PROVIDERS = [
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    tag: 'FREE * LOCAL',
    tagColor: HW.blue,
    models: ['qwen2', 'qwen2.5', 'llama3.2', 'llama3.1', 'mistral', 'phi3', 'codellama'],
    fieldType: 'url',                       // BUG-2/4: URL, not a key
    fieldLabel: 'Ollama Base URL',
    fieldHint: 'Start Ollama first: ollama serve  →  ollama pull qwen2',
    fieldPlaceholder: 'http://localhost:11434',
    keyLink: 'https://ollama.com',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    tag: 'FREE TIER',
    tagColor: ALARM.normal,
    models: [
      'gemini-2.0-flash', 'gemini-2.0-flash-lite',
      'gemini-2.5-flash-preview-05-20', 'gemini-1.5-flash-8b',
    ],
    fieldType: 'key',
    fieldLabel: 'Gemini API Key',
    fieldHint: 'Get free key at Google AI Studio (15 req/min, 1M tokens/day free)',
    fieldPlaceholder: 'AIza...',
    keyLink: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    tag: 'PAID',
    tagColor: ALARM.minor,
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    fieldType: 'key',
    fieldLabel: 'Anthropic API Key',
    fieldHint: 'console.anthropic.com → API Keys',
    fieldPlaceholder: 'sk-ant-...',
    keyLink: 'https://console.anthropic.com',
  },
  {
    // CA-4: model list kept, generation artifacts removed
    id: 'groq',
    label: 'Groq (Free Tier)',
    tag: 'FREE * FAST',
    tagColor: '#F97316',
    models: [
      'llama-3.3-70b-versatile',   // production-ready 70B
      'llama-3.1-8b-instant',      // fastest (1,000+ tok/s)
      'qwen/qwen3-32b',            // Mixtral replacement
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
    ],
    fieldType: 'key',
    fieldLabel: 'Groq API Key',
    fieldHint: 'Get free key from console.groq.com (no credit card)',
    fieldPlaceholder: 'gsk_...',
    keyLink: 'https://console.groq.com/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    tag: 'PAID',
    tagColor: ALARM.minor,
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
    fieldType: 'key',
    fieldLabel: 'OpenAI API Key',
    fieldHint: 'platform.openai.com → API Keys',
    fieldPlaceholder: 'sk-...',
    keyLink: 'https://platform.openai.com/api-keys',
  },
]


function Fld({ label, hint, T, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: 'block', fontSize: 9, fontWeight: 800, color: T.textDim,
        letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 5,
          lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </div>
  )
}


function SectionHead({ label }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, color: HW.blue,
      letterSpacing: '3px', textTransform: 'uppercase',
      marginBottom: 14,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ width: 16, height: 1, background: HW.blue }}/>
      {label}
    </div>
  )
}

const inputStyle = (T) => ({
  width: '100%', background: T.bgCardHover, color: T.text,
  border: `1px solid ${T.border}`, padding: '9px 12px',
  fontSize: 12, fontFamily: 'inherit', outline: 'none',
  transition: 'border-color .2s',
})


export default function ConfigureAI() {
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)

  const [cfg,        setCfg]        = useState(null)
  const [status,     setStatus]     = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState(null)
  const [showKey,    setShowKey]    = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [testRes,    setTestRes]    = useState(null)
  const [keyChanged, setKeyChanged] = useState(false)


  const [ollamaUrl,   setOllamaUrl]   = useState('http://localhost:11434')
  const [customModel, setCustomModel] = useState('')   

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgR, stR] = await Promise.all([
        axios.get(`${BASE}/api/ai/config`, { headers: hdr() }),
        axios.get(`${BASE}/api/ai/status`, { headers: hdr() }),
      ])
      setCfg(cfgR.data)
      setStatus(stR.data)
      if (cfgR.data.ollama_url) setOllamaUrl(cfgR.data.ollama_url)   
      const prov   = PROVIDERS.find(p => p.id === cfgR.data.provider)
      const inList = prov?.models.includes(cfgR.data.model)
      if (!inList && cfgR.data.model) setCustomModel(cfgR.data.model) 
    } catch (err) {
        console.error("API read error:", err);  
      setError(err.response?.data?.detail || 'Failed to load AI config')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const saveConfig = async () => {
    setError(null); setSaved(false)

    
    const effectiveModel = customModel.trim() ||
      (cfg.model !== '__custom__' ? cfg.model : '')
    if (!effectiveModel) {
      setError('Enter a custom model name before saving')
      return
    }

    setSaving(true)
    try {
      const payload = {
        enabled:       cfg.enabled,
        provider:      cfg.provider,
        model:         effectiveModel,
        max_tokens:    cfg.max_tokens,
        temperature:   cfg.temperature,
        system_prompt: cfg.system_prompt,
        auto_context:  cfg.auto_context,
      }

      if (cfg.provider === 'ollama') {
    
        payload.ollama_url = ollamaUrl.trim() || 'http://localhost:11434'
      } else if (keyChanged && cfg.api_key && !cfg.api_key.includes('••')) {
        payload.api_key = cfg.api_key
      }

      await axios.post(`${BASE}/api/ai/config`, payload, { headers: hdr() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      setKeyChanged(false)
      setCustomModel('')
      fetchConfig()
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const testConnection = async () => {
    setTesting(true); setTestRes(null)
    try {
      // CA-2: correct brand, no glyph
      const r = await axios.post(`${BASE}/api/ai/chat`, {
        messages: [{ role: 'user',
          content: 'Reply with exactly: "SpiriCom AI online"' }],
        language: 'en',
        inject_context: false,
      }, { headers: hdr() })
      setTestRes({ ok: true, msg: r.data.reply, elapsed: r.data.elapsed,
                   provider: r.data.provider, model: r.data.model })
    } catch (err) {
      setTestRes({ ok: false, msg: err.response?.data?.detail || err.message })
    } finally { setTesting(false) }
  }

  const resetUsage = async () => {
    try {
      await axios.delete(`${BASE}/api/ai/config/reset-usage`, { headers: hdr() })
      fetchConfig()
    } catch {}
  }


  const provider = PROVIDERS.find(p => p.id === cfg?.provider) || PROVIDERS[0]
  const isOllama = cfg?.provider === 'ollama'
  const usage    = cfg?.token_usage || {}


  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>
      <RefreshCw size={20} color={T.textDim} style={{
        animation: 'noc-spin .8s linear infinite',
        display: 'block', margin: '0 auto 10px',
      }}/>
      Loading AI configuration…
    </div>
  )

  if (!cfg) return (
    <div style={{ padding: 40 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(220,38,38,.08)',
        border: '1px solid rgba(220,38,38,.25)',
        padding: '14px 18px', fontSize: 12, color: ALARM.critical,
      }}>
        <AlertTriangle size={14} color={ALARM.critical}/>
        {error || 'Could not load config — is the backend running?'}
      </div>
    </div>
  )


  return (
    <div style={{
      padding: '32px 36px 80px', background: T.bg,
      minHeight: 'calc(100vh - 64px)', color: T.text,
    }}>
      {/* CA-5: one focus rule replaces per-input JS mutation */}
      <style>{`
        .ca-input:focus { border-color: ${HW.blue} !important; }
        .ca-reset { transition: all .2s; }
        .ca-reset:hover { border-color: ${ALARM.critical} !important;
          color: ${ALARM.critical} !important; }
      `}</style>

      
      <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 22,
        marginBottom: 28 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: HW.blueDim, border: `1px solid ${HW.blueBd}`,
          padding: '5px 12px', marginBottom: 14,
        }}>
          <Bot size={12} color={HW.blue}/>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '2.5px',
            textTransform: 'uppercase', color: HW.blue }}>
            AI Configuration
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
          <div>
            {/* The ONE brand-red element on this page */}
            <h1 style={{
              fontFamily: FONT.display,
              fontSize: 'clamp(24px,3vw,44px)', fontWeight: 900,
              letterSpacing: '-1.5px', lineHeight: 1, color: T.text,
              margin: '0 0 6px',
            }}>
              CONFIGURE <span style={{ color: HW.blue, fontStyle: 'italic' }}>AI</span>
            </h1>
            <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>
              LLM provider · API keys · system prompt · token usage
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={testConnection} disabled={testing} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: HW.blueDim, border: `1px solid ${HW.blueBd}`,
              color: HW.blue, padding: '8px 14px', fontSize: 11,
              fontWeight: 700,
              cursor: testing ? 'not-allowed' : 'pointer',
              opacity: testing ? 0.6 : 1,
            }}>
              <Zap size={12} style={{ animation: testing
                ? 'noc-spin .8s linear infinite' : undefined }}/>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>

            {/* CA-1: primary action = blue, not legacy red */}
            <button onClick={saveConfig} disabled={saving} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: saving ? T.border
                : 'linear-gradient(135deg, #0093D5, #0070A8)',
              border: 'none', color: '#fff',
              padding: '8px 18px', fontSize: 11, fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer',
              letterSpacing: '1px', textTransform: 'uppercase',
            }}>
              {saving
                ? <><RefreshCw size={12}
                    style={{ animation: 'noc-spin .8s linear infinite' }}/> Saving…</>
                : saved
                ? <><CheckCircle size={12}/> Saved!</>
                : <><Save size={12}/> Save Config</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(220,38,38,.08)',
          border: '1px solid rgba(220,38,38,.25)',
          padding: '12px 16px', marginBottom: 20, fontSize: 12,
          color: ALARM.critical,
        }}>
          <AlertTriangle size={13} color={ALARM.critical}/>{error}
        </div>
      )}

      {/*  Test result banner — CA-2: icon carries the meaning  */}
      {testRes && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: testRes.ok ? 'rgba(22,163,74,.08)' : 'rgba(220,38,38,.08)',
          border: `1px solid ${testRes.ok
            ? 'rgba(22,163,74,.3)' : 'rgba(220,38,38,.3)'}`,
          padding: '12px 16px', marginBottom: 20, fontSize: 12,
          color: testRes.ok ? ALARM.normal : ALARM.critical,
        }}>
          {testRes.ok
            ? <CheckCircle size={13} color={ALARM.normal}/>
            : <AlertTriangle size={13} color={ALARM.critical}/>}
          <span>
            {testRes.ok
              ? `${testRes.msg}  (${testRes.elapsed}s · ${testRes.provider}/${testRes.model})`
              : testRes.msg}
          </span>
        </div>
      )}

      {/*  Two-column layout  */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

       
        <div>
          {/* Enable toggle */}
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            padding: '18px 20px', marginBottom: 16,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
              background: `linear-gradient(90deg, transparent, ${cfg.enabled
                ? ALARM.normal : ALARM.unknown}, transparent)`,
            }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text,
                  marginBottom: 4 }}>
                  AI Assistant
                </div>
                <div style={{ fontSize: 10, color: T.textDim }}>
                  Enable/disable the floating chat bubble for all users
                </div>
              </div>
              {/* CA-6: switch semantics */}
              <button role="switch" aria-checked={cfg.enabled}
                aria-label="AI Assistant enabled"
                onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
                style={{
                  width: 48, height: 26, borderRadius: 13,
                  background: cfg.enabled
                    ? ALARM.normal : 'rgba(148,163,184,.3)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'all .25s',
                }}>
                <span style={{
                  position: 'absolute', top: 3,
                  left: cfg.enabled ? 'calc(100% - 23px)' : '3px',
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'all .25s',
                  boxShadow: '0 1px 4px rgba(0,0,0,.3)',
                }}/>
              </button>
            </div>
          </div>

          {/* Provider selection — CA-1: selection = blue */}
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            padding: '18px 20px', marginBottom: 16,
          }}>
            <SectionHead label="LLM Provider"/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PROVIDERS.map(p => {
                const active = cfg.provider === p.id
                return (
                  <button key={p.id}
                    aria-pressed={active}
                    onClick={() => {
                 
                      setCfg(c => ({
                        ...c,
                        provider: p.id,
                        model: p.models[0],
                        api_key: p.fieldType === 'key' ? '' : c.api_key,
                      }))
                      setKeyChanged(false)
                      setCustomModel('')
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px',
                      background: active ? HW.blueDim : T.bgCardHover,
                      border: `1px solid ${active ? HW.blueBd : T.border}`,
                      cursor: 'pointer', transition: 'all .2s',
                      textAlign: 'left', fontFamily: 'inherit',
                    }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: active ? HW.blue : 'rgba(148,163,184,.3)',
                      transition: 'all .2s',
                    }}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700,
                        color: active ? T.text : T.textMuted }}>
                        {p.label}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '1.5px',
                      padding: '2px 8px',
                      background: `${p.tagColor}18`,
                      border: `1px solid ${p.tagColor}40`,
                      color: p.tagColor,
                    }}>
                      {p.tag}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Model + credential field */}
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            padding: '18px 20px',
          }}>
            <SectionHead label="Model & Credentials"/>

            <Fld label="Model" T={T}>
              <div style={{ position: 'relative' }}>
                <select value={cfg.model} className="ca-input"
                  aria-label="Model"
                  onChange={e => {
                    setCfg(c => ({ ...c, model: e.target.value }))
                    setCustomModel('')
                  }}
                  style={{
                    width: '100%', appearance: 'none',
                    background: T.bgCardHover, color: T.text,
                    border: `1px solid ${T.border}`,
                    padding: '9px 30px 9px 12px',
                    fontSize: 12, fontFamily: 'inherit',
                    outline: 'none', cursor: 'pointer',
                    transition: 'border-color .2s',
                  }}>
                  {provider.models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  {/* BUG-6: surface current non-listed model */}
                  {cfg.model && cfg.model !== '__custom__' &&
                    !provider.models.includes(cfg.model) && (
                    <option value={cfg.model}>{cfg.model} (current)</option>
                  )}
                  <option value="__custom__">Custom model name…</option>
                </select>
              </div>

              {(cfg.model === '__custom__' || customModel) && (
                <input
                  className="ca-input"
                  value={customModel}
                  aria-label="Custom model name"
                  onChange={e => {
                    setCustomModel(e.target.value)
                    setCfg(c => ({ ...c,
                      model: e.target.value || '__custom__' }))
                  }}
                  placeholder={isOllama
                    ? 'e.g. qwen2, qwen2.5, llama3.2' : 'model name'}
                  style={{ ...inputStyle(T), marginTop: 6 }}
                />
              )}
            </Fld>

            {/* BUG-2/4: Ollama URL input vs cloud key input */}
            {isOllama ? (
              <Fld label="Ollama Base URL" hint={provider.fieldHint} T={T}>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 11, top: '50%',
                    transform: 'translateY(-50%)', pointerEvents: 'none',
                  }}>
                    <Server size={12} color={T.textDim}/>
                  </div>
                  <input
                    type="text" className="ca-input"
                    value={ollamaUrl}
                    aria-label="Ollama Base URL"
                    onChange={e => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    style={{ ...inputStyle(T), paddingLeft: 30 }}
                  />
                </div>
                <div style={{ marginTop: 6, display: 'flex',
                  alignItems: 'center', gap: 6, fontSize: 10 }}>
                  <span style={{ color: T.textDim }}>Installed models:</span>
                  <code style={{ fontSize: 10, color: HW.blueLight,
                    fontFamily: 'monospace' }}>
                    ollama list
                  </code>
                </div>
              </Fld>
            ) : (
              <Fld label={provider.fieldLabel} hint={provider.fieldHint} T={T}>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 11, top: '50%',
                    transform: 'translateY(-50%)', pointerEvents: 'none',
                  }}>
                    <Key size={12} color={T.textDim}/>
                  </div>
                  <input
                    type={showKey ? 'text' : 'password'} className="ca-input"
                    value={cfg.api_key || ''}
                    aria-label={provider.fieldLabel}
                    onChange={e => {
                      setCfg(c => ({ ...c, api_key: e.target.value }))
                      setKeyChanged(true)
                    }}
                    placeholder={provider.fieldPlaceholder}
                    style={{ ...inputStyle(T), paddingLeft: 30,
                      paddingRight: 40 }}
                  />
                  <button type="button" onClick={() => setShowKey(v => !v)}
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    style={{
                      position: 'absolute', right: 10, top: '50%',
                      transform: 'translateY(-50%)', background: 'transparent',
                      border: 'none', cursor: 'pointer', color: T.textDim,
                      padding: 0,
                    }}>
                    {showKey ? <EyeOff size={13}/> : <Eye size={13}/>}
                  </button>
                </div>
                {provider.keyLink && (
                  <a href={provider.keyLink} target="_blank" rel="noreferrer"
                    style={{ fontSize: 10, color: HW.blue, marginTop: 4,
                      display: 'inline-block', textDecoration: 'none' }}>
                    Get API key →
                  </a>
                )}
              </Fld>
            )}
          </div>
        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div>
          {/* Generation settings — CA-1: slider accents = blue */}
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            padding: '18px 20px', marginBottom: 16,
          }}>
            <SectionHead label="Generation Settings"/>

            <Fld label={`Max Tokens — ${cfg.max_tokens}`} T={T}>
              <input type="range" min={200} max={2000} step={100}
                value={cfg.max_tokens}
                aria-label="Max tokens"
                onChange={e => setCfg(c => ({ ...c, max_tokens: +e.target.value }))}
                style={{ width: '100%', accentColor: HW.blue,
                  cursor: 'pointer' }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                fontSize: 9, color: T.textDim, marginTop: 3 }}>
                <span>200 (concise)</span><span>2000 (detailed)</span>
              </div>
            </Fld>

            <Fld label={`Temperature — ${cfg.temperature}`}
              hint="0 = deterministic · 0.35 recommended for NOC · 1 = creative"
              T={T}>
              <input type="range" min={0} max={1} step={0.05}
                value={cfg.temperature}
                aria-label="Temperature"
                onChange={e => setCfg(c => ({ ...c, temperature: +e.target.value }))}
                style={{ width: '100%', accentColor: HW.blue,
                  cursor: 'pointer' }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                fontSize: 9, color: T.textDim, marginTop: 3 }}>
                <span>0 (precise)</span><span>1 (creative)</span>
              </div>
            </Fld>

            {/* Auto-context toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', borderTop: `1px solid ${T.border}`,
              paddingTop: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text,
                  marginBottom: 3 }}>
                  Auto-inject context
                </div>
                <div style={{ fontSize: 10, color: T.textDim, maxWidth: 220 }}>
                  Inject complaint stats, churn scores, anomalies, and
                  forecasts into every prompt
                </div>
              </div>
              <button role="switch" aria-checked={cfg.auto_context}
                aria-label="Auto-inject context"
                onClick={() => setCfg(c => ({ ...c,
                  auto_context: !c.auto_context }))}
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: cfg.auto_context
                    ? HW.blue : 'rgba(148,163,184,.3)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'all .25s', flexShrink: 0, marginLeft: 12,
                }}>
                <span style={{
                  position: 'absolute', top: 2,
                  left: cfg.auto_context ? 'calc(100% - 21px)' : '2px',
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'all .25s',
                  boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                }}/>
              </button>
            </div>
          </div>

          {/* Custom system prompt */}
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            padding: '18px 20px', marginBottom: 16,
          }}>
            <SectionHead label="Custom System Prompt"/>
            <Fld label="Additional instructions (appended to base NOC prompt)" T={T}>
              <textarea
                className="ca-input"
                value={cfg.system_prompt || ''}
                aria-label="Custom system prompt"
                onChange={e => setCfg(c => ({ ...c,
                  system_prompt: e.target.value }))}
                placeholder={
                  "e.g. Always respond in formal French.\n" +
                  "Focus on Tunis region only.\n" +
                  "Escalate anything with urgency > 0.9 to NOC lead."
                }
                rows={5}
                style={{
                  width: '100%', background: T.bgCardHover, color: T.text,
                  border: `1px solid ${T.border}`, padding: '10px 12px',
                  fontSize: 12, fontFamily: 'inherit', outline: 'none',
                  resize: 'vertical', lineHeight: 1.5,
                  transition: 'border-color .2s',
                }}
              />
            </Fld>
          </div>

          {/* Token usage — CA-6: gapColor, token KPI colors */}
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start' }}>
              <SectionHead label="Token Usage"/>
              <button onClick={resetUsage} className="ca-reset" style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'transparent', border: `1px solid ${T.border}`,
                color: T.textDim, cursor: 'pointer', padding: '4px 10px',
                fontSize: 10, fontWeight: 700,
              }}>
                <Trash2 size={10}/> Reset
              </button>
            </div>

            <div style={{ display: 'grid',
              gridTemplateColumns: 'repeat(3,1fr)',
              gap: 1, background: GAP }}>
              {[
                { l: 'Requests',    v: usage.requests  || 0, c: HW.blue       },
                { l: 'Input (~w)',  v: usage.total_in  || 0, c: HW.blueLight  },
                { l: 'Output (~w)', v: usage.total_out || 0, c: ALARM.normal  },
              ].map(k => (
                <div key={k.l} style={{
                  background: T.bgCardHover, padding: '14px 12px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, color: T.textDim,
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                    marginBottom: 6 }}>
                    {k.l}
                  </div>
                  <div style={{
                    fontFamily: FONT.display,
                    fontSize: 24, fontWeight: 900, color: k.c,
                  }}>
                    {k.v.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, fontSize: 10, color: T.textDim,
              lineHeight: 1.6 }}>
              <strong style={{ color: T.text }}>Provider:</strong>{' '}
              {status?.provider || cfg.provider} / {status?.model || cfg.model}
              <br/>
              {/* CA-2: dot spans / icons instead of glyph characters */}
              {isOllama ? (
                <span style={{ color: HW.blue, display: 'inline-flex',
                  alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%',
                    background: HW.blue, display: 'inline-block' }}/>
                  Local — no token cost · Ollama URL: {ollamaUrl}
                </span>
              ) : status?.has_key ? (
                <span style={{ color: ALARM.normal, display: 'inline-flex',
                  alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%',
                    background: ALARM.normal, display: 'inline-block' }}/>
                  API key configured
                </span>
              ) : (
                <span style={{ color: ALARM.minor, display: 'inline-flex',
                  alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={10}/>
                  No API key — configure above
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}