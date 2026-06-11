"""
src/api/ai_api.py  — SpiriCom NOC AI Assistant backend
=======================================================

BUGS FIXED vs previous version
────────────────────────────────
BUG-1  NOC_SYSTEM_PROMPT was referenced but never defined → NameError → HTTP 500
       on every chat request.  Defined here with full SpiriCom context.

BUG-2  build_system_prompt() was defined but /chat endpoint never called it —
       it built its own inline parts[] without NOC_RESPONSE_SCHEMA.
       Fixed: /chat now calls build_system_prompt() exclusively.

BUG-3  DEFAULT_CONFIG provider='gemini' and model='gemini-2.0-flash'.
       Project uses Ollama/qwen2.  Defaults corrected to provider='ollama',
       model='qwen2'.

BUG-4  call_ollama() read base URL from cfg['api_key'] — the API-key field
       is for cloud API keys, not a local URL.  Now uses a dedicated
       'ollama_url' key in config (defaults to http://localhost:11434).

BUG-5  build_context_block() only read data/nlp/complaints.db and one
       anomaly parquet.  Now reads ALL SpiriCom outputs:
         - complaints_clean.parquet  (NB01 — main dataset)
         - analysis_results.json    (NB01 — overview stats)
         - churn_scores.parquet     (NB05 — risk scores)
         - shap_results.json        (NB06 — SHAP drivers)
         - forecast_results.json    (forecast — 5G/brand)
         - churn_features.parquet   (brand performance)
         - anomaly_results.parquet  (anomaly feed)

BUG-6  body.language was parsed but never forwarded to the Ollama system
       prompt.  qwen2 always replied in English.  Language instruction now
       injected at the top of the system prompt.

BUG-7  Ollama default model was 'llama3.2'.  Corrected to 'qwen2'.

BUG-8  NOC_RESPONSE_SCHEMA was defined but never injected.
       build_system_prompt() now always appends it.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import ssl
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Union

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("ai_api")

# ── Config storage ────────────────────────────────────────────────────────────
AI_CONFIG_PATH = Path("data/nlp/ai_config.json")
AI_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)

DEFAULT_CONFIG: dict = {
    "enabled":      True,
    "provider":     "ollama",
    "model":        "qwen2",
    "ollama_url":   "http://localhost:11434",
    "api_key":      "",
    "max_tokens":   1024,
    "temperature":  0.35,
    "system_prompt":"",
    "auto_context": True,
    "token_usage":  {"total_in": 0, "total_out": 0, "requests": 0},
}

_DEPRECATED_GEMINI = {
    "gemini-pro","gemini-1.5-flash","gemini-1.5-flash-latest",
    "gemini-1.5-pro","gemini-1.5-pro-latest",
}


def load_config() -> dict:
    if AI_CONFIG_PATH.exists():
        try:
            cfg = json.loads(AI_CONFIG_PATH.read_text())
            for k, v in DEFAULT_CONFIG.items():
                if k not in cfg:
                    cfg[k] = v
            if cfg.get("provider") == "gemini" and cfg.get("model") in _DEPRECATED_GEMINI:
                cfg["model"] = "gemini-2.0-flash"
                save_config(cfg)
            return cfg
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()


def save_config(cfg: dict) -> None:
    AI_CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


# ══════════════════════════════════════════════════════════════════════════════
# SSL helpers (unchanged from previous version — corporate proxy support)
# ══════════════════════════════════════════════════════════════════════════════

def _ssl_context() -> Union[bool, ssl.SSLContext]:
    ca = os.environ.get("SPIRICOMP_CA_BUNDLE", "").strip()
    if ca and Path(ca).exists():
        ctx = ssl.create_default_context(); ctx.load_verify_locations(ca); return ctx
    for ev in ("REQUESTS_CA_BUNDLE", "SSL_CERT_FILE"):
        cp = os.environ.get(ev, "").strip()
        if cp and Path(cp).exists():
            ctx = ssl.create_default_context(); ctx.load_verify_locations(cp); return ctx
    if os.environ.get("AI_VERIFY_SSL", "true").lower() in ("false", "0", "no"):
        logger.warning("SSL verification DISABLED (AI_VERIFY_SSL=false).")
        return False
    return True


def _make_client(timeout: int = 60) -> httpx.AsyncClient:
    s = _ssl_context()
    return httpx.AsyncClient(timeout=timeout, verify=s if isinstance(s, bool) else s)


# ══════════════════════════════════════════════════════════════════════════════
# BUG-1 FIX — NOC_SYSTEM_PROMPT (was referenced but never defined)
# ══════════════════════════════════════════════════════════════════════════════

NOC_SYSTEM_PROMPT = """\
You are **SpiriComp NOC Intelligence Assistant**, an expert AI embedded in the \
Huawei SpiriCom Network Operations Center (NOC) dashboard for Ooredoo Tunisia.

YOUR ROLE:
- Answer questions about telecom complaint data, network KPIs, anomaly detection, \
churn prediction, 5G adoption forecasting, and brand performance.
- Your knowledge comes from real data injected in the [LIVE CONTEXT] block below.
- Be precise, concise, and professional — you are talking to NOC engineers.
- When data is available in context, quote the exact numbers.
- When data is not available, say so clearly and suggest running the relevant notebook.

SPIRICOM PLATFORM CONTEXT:
- Operator : Ooredoo Tunisia
- Dataset  : 25,727 complaints (2025), 24 governorates, Tunisian cities
- ML models: NB01 (complaints), NB02 (KPIs), NB04 (sessions), \
NB05 (churn — LR primary, AUC=0.9136), NB06 (SHAP)
- Churn def: dou_total OR duration ≤ Q20 → 36.2% churn rate
- Top churn drivers (SHAP): ratio_5g=1.714, duration=1.365, traffic_diversity=0.483
- Risk tiers: CRITICAL (971), HIGH (511), MEDIUM (1979), LOW (1435)
- SLA alert : 48.8% of complaints are OPEN (exceeds 30% threshold)

RULES:
1. Always quote exact figures from the [LIVE CONTEXT] block when present.
2. If a query asks about data not in context, say: \
"Data not available — run [NB0X] and restart the API."
3. Keep responses under 300 words unless a detailed breakdown is requested.
4. For risk/anomaly topics, always state the severity level.
5. Never hallucinate numbers — say "not available" instead.
"""

# ── NOC structured response schema ────────────────────────────────────────────
NOC_RESPONSE_SCHEMA = """\

RESPONSE FORMAT (use for operational/diagnostic questions):
For alert/anomaly/churn questions use these sections where relevant:
  • SEVERITY: [P1-Critical | P2-High | P3-Medium | P4-Info]
  • FINDING: one-line summary
  • DETAILS: supporting data from context
  • ACTION: recommended next step
  • ETA: estimated resolution or "Monitoring required"
For general data queries (counts, rankings, trends), plain structured text is fine.
"""


# ══════════════════════════════════════════════════════════════════════════════
# BUG-5 FIX — build_context_block: full SpiriCom data sources
# ══════════════════════════════════════════════════════════════════════════════

def build_context_block() -> str:
    """
    Inject live SpiriCom stats into the system prompt.
    Reads from all notebook outputs: complaints, churn, forecast, brand, SHAP.
    Gracefully skips any source that doesn't exist yet.
    """
    lines: list[str] = [
        f"[LIVE CONTEXT — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}]"
    ]

    # ── 1. NB01 analysis_results.json ────────────────────────────────
    for p in [Path("data/outputs/analysis_results.json"),
              Path("models/analysis_results.json")]:
        if p.exists():
            try:
                ar = json.loads(p.read_text())
                ov = ar.get("overview", ar)
                lines.append(
                    f"Complaints overview: {ov.get('total_complaints','?')} total, "
                    f"{ov.get('open_complaints','?')} open, "
                    f"{ov.get('unique_subscribers','?')} unique subscribers"
                )
                if "top_cities" in ar:
                    top = ", ".join(
                        f"{c['city']}({c['count']})"
                        for c in ar["top_cities"][:5]
                    )
                    lines.append(f"Top 5 cities by complaints: {top}")
                if "top_categories" in ar:
                    cats = ", ".join(
                        f"{c['category']}({c['count']})"
                        for c in ar["top_categories"][:5]
                    )
                    lines.append(f"Top complaint types: {cats}")
                if "monthly_trend" in ar:
                    months = ar["monthly_trend"]
                    if months:
                        last = months[-1]
                        lines.append(
                            f"Latest month: {last.get('month','?')} — "
                            f"{last.get('count','?')} complaints"
                        )
                break
            except Exception as e:
                logger.debug("analysis_results.json context: %s", e)

    # ── 2. complaints_clean.parquet (NB01 main dataset) ──────────────
    for p in [Path("data/outputs/complaints_clean.parquet"),
              Path("data/complaints_clean.parquet")]:
        if p.exists():
            try:
                import pandas as pd
                df = pd.read_parquet(str(p))
                total   = len(df)
                open_c  = int((df["status"].str.upper() == "OPEN").sum()) if "status" in df else "?"
                unresp  = int(df["is_unresolved"].sum()) if "is_unresolved" in df else "?"
                lines.append(
                    f"Complaints dataset: {total} records loaded, "
                    f"{open_c} open, {unresp} unresolved"
                )
                if "province" in df.columns:
                    top_prov = df["province"].value_counts().head(3)
                    lines.append(
                        "Top provinces: " +
                        ", ".join(f"{p}({n})" for p, n in top_prov.items())
                    )
                if "sub_sub_category" in df.columns:
                    top_types = df["sub_sub_category"].value_counts().head(5)
                    lines.append(
                        "Top complaint sub-types: " +
                        ", ".join(f"{t}({n})" for t, n in top_types.items())
                    )
                break
            except Exception as e:
                logger.debug("complaints_clean.parquet context: %s", e)

    # ── 3. NB05 churn_scores.parquet ─────────────────────────────────
    for p in [Path("data/outputs/churn_scores.parquet"),
              Path("models/churn_scores.parquet")]:
        if p.exists():
            try:
                import pandas as pd
                cs = pd.read_parquet(str(p))
                total_c = len(cs)
                if "risk_level" in cs.columns:
                    rc = cs["risk_level"].value_counts().to_dict()
                    lines.append(
                        f"Churn model: {total_c} customers — "
                        f"CRITICAL={rc.get('CRITICAL',0)}, HIGH={rc.get('HIGH',0)}, "
                        f"MEDIUM={rc.get('MEDIUM',0)}, LOW={rc.get('LOW',0)}"
                    )
                if "churn_prob" in cs.columns:
                    churn_rate = round(float((cs["churn_prob"] >= 0.5).mean()) * 100, 1)
                    avg_risk   = round(float(cs["churn_prob"].mean()) * 100, 1)
                    lines.append(
                        f"Churn rate: {churn_rate}%, avg risk score: {avg_risk}%"
                    )
                # Top 3 high-risk MSISDNs
                if "churn_prob" in cs.columns and "msisdn" in cs.columns:
                    top3 = cs.nlargest(3, "churn_prob")[["msisdn","churn_prob","risk_level"]]
                    top3_str = ", ".join(
                        f"{r['msisdn']}({r['churn_prob']:.2f})" for _, r in top3.iterrows()
                    )
                    lines.append(f"Highest-risk subscribers (top 3): {top3_str}")
                break
            except Exception as e:
                logger.debug("churn_scores.parquet context: %s", e)

    # ── 4. NB06 shap_results.json ─────────────────────────────────────
    for p in [Path("data/outputs/shap_results.json"),
              Path("models/shap_results.json")]:
        if p.exists():
            try:
                shap = json.loads(p.read_text())
                feats = shap.get("top_features") or shap.get("features", [])
                if feats:
                    top5 = feats[:5]
                    feat_str = ", ".join(
                        f"{f.get('feature','?')}={f.get('importance',f.get('value','?'))}"
                        for f in top5
                    )
                    lines.append(f"Top SHAP churn drivers: {feat_str}")
                break
            except Exception as e:
                logger.debug("shap_results.json context: %s", e)

    # ── 5. forecast_results.json ──────────────────────────────────────
    for p in [Path("data/outputs/forecast_results.json"),
              Path("models/forecast_results.json")]:
        if p.exists():
            try:
                fr = json.loads(p.read_text())
                if "5g_forecast" in fr:
                    fg = fr["5g_forecast"]
                    lines.append(
                        f"5G forecast: current adoption={fg.get('current_pct','?')}%, "
                        f"trend={fg.get('trend','?')}, "
                        f"next_month_est={fg.get('next_month_pct','?')}%"
                    )
                if "summary" in fr:
                    sm = fr["summary"]
                    lines.append(
                        f"Forecast summary: best_model={sm.get('best_model','?')}, "
                        f"avg_mae={sm.get('avg_mae','?')}"
                    )
                break
            except Exception as e:
                logger.debug("forecast_results.json context: %s", e)

    # ── 6. Brand performance from churn_features.parquet ─────────────
    for p in [Path("data/outputs/churn_features.parquet"),
              Path("models/churn_features.parquet")]:
        if p.exists():
            try:
                import pandas as pd
                cf = pd.read_parquet(str(p))
                if "brand" in cf.columns and "churn_prob" in cf.columns:
                    brand_churn = (cf.groupby("brand")["churn_prob"]
                                   .mean().sort_values(ascending=False))
                    top3 = brand_churn.head(3)
                    lines.append(
                        "Brand churn risk (top 3): " +
                        ", ".join(f"{b}={v:.1%}" for b, v in top3.items())
                    )
                break
            except Exception as e:
                logger.debug("churn_features.parquet context: %s", e)

    # ── 7. Anomaly results ────────────────────────────────────────────
    for p in [Path("data/outputs/anomaly_results.parquet"),
              Path("models/anomaly/anomaly_results.parquet")]:
        if p.exists():
            try:
                import pandas as pd
                an = pd.read_parquet(str(p))
                if "anomaly_flag" in an.columns:
                    total_an  = int(an["anomaly_flag"].sum())
                    total_rec = len(an)
                    pct       = round(total_an / total_rec * 100, 1) if total_rec else 0
                    lines.append(f"Anomalies: {total_an}/{total_rec} ({pct}%) flagged")
                    if "region" in an.columns and total_an > 0:
                        worst = an[an["anomaly_flag"] == 1]["region"].value_counts()
                        lines.append(
                            "Most anomalous regions: " +
                            ", ".join(f"{r}({n})" for r, n in worst.head(3).items())
                        )
                break
            except Exception as e:
                logger.debug("anomaly context: %s", e)

    # ── 8. NLP complaints DB (live submissions) ───────────────────────
    for db_path in [Path("data/nlp/complaints.db"), Path("data/complaints.db")]:
        if db_path.exists():
            try:
                conn = sqlite3.connect(str(db_path))
                conn.row_factory = sqlite3.Row
                total  = conn.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]
                open_n = conn.execute(
                    "SELECT COUNT(*) FROM complaints WHERE status='open'"
                ).fetchone()[0]
                lines.append(f"NLP submissions: {total} total, {open_n} open")
                recent = conn.execute(
                    "SELECT COUNT(*) FROM complaints "
                    "WHERE submitted_at >= datetime('now','-24 hours')"
                ).fetchone()[0]
                lines.append(f"NLP submissions last 24h: {recent}")
                conn.close()
                break
            except Exception as e:
                logger.debug("complaints DB context: %s", e)

    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# BUG-2 FIX — build_system_prompt: single authoritative function, always called
# BUG-6 FIX — language instruction injected here
# BUG-8 FIX — NOC_RESPONSE_SCHEMA always appended
# ══════════════════════════════════════════════════════════════════════════════

_LANG_INSTRUCTIONS = {
    "zh": (
        "\nIMPORTANT: Respond in CHINESE (简体中文). "
        "All text in your reply must be in Chinese except technical terms "
        "(model names, metric names, city names, numbers)."
    ),
    "en": "\nRespond in English.",
}


def build_system_prompt(cfg: dict, language: str = "en",
                        inject_ctx: bool = True) -> str:
    """
    Build the complete system prompt for one chat request.
    Always called — no more inline part-building in /chat endpoint.
    """
    parts = [NOC_SYSTEM_PROMPT]

    # Language instruction (BUG-6)
    lang_instr = _LANG_INSTRUCTIONS.get(language, _LANG_INSTRUCTIONS["en"])
    parts.append(lang_instr)

    # Custom admin instructions
    if cfg.get("system_prompt"):
        parts.append(f"\nAdditional instructions from admin:\n{cfg['system_prompt']}")

    # NOC response schema (BUG-8)
    parts.append(NOC_RESPONSE_SCHEMA)

    # Live data context (BUG-5)
    if inject_ctx and cfg.get("auto_context", True):
        parts.append(f"\n{build_context_block()}")

    return "\n".join(parts)


# ── Pydantic models ───────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role:    str
    content: str


class ChatRequest(BaseModel):
    messages:       list[ChatMessage]
    language:       str  = "en"
    inject_context: bool = True


class ConfigUpdate(BaseModel):
    enabled:       Optional[bool]  = None
    provider:      Optional[str]   = None
    model:         Optional[str]   = None
    ollama_url:    Optional[str]   = None
    api_key:       Optional[str]   = None
    max_tokens:    Optional[int]   = None
    temperature:   Optional[float] = None
    system_prompt: Optional[str]   = None
    auto_context:  Optional[bool]  = None


# ══════════════════════════════════════════════════════════════════════════════
# PROVIDER CALLERS
# ══════════════════════════════════════════════════════════════════════════════

async def call_ollama(messages: list[dict], system: str, cfg: dict) -> str:
    """
    BUG-4 FIX: base URL now comes from cfg['ollama_url'], not cfg['api_key'].
    BUG-7 FIX: default model is now 'qwen2'.
    """
    model    = cfg.get("model", "qwen2")
    base_url = cfg.get("ollama_url", "http://localhost:11434").rstrip("/")
    payload  = {
        "model":    model,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream":   False,
        "options": {
            "temperature": cfg.get("temperature", 0.35),
            "num_predict": cfg.get("max_tokens", 1024),
        },
    }
    async with _make_client(timeout=120) as client:
        r = await client.post(f"{base_url}/api/chat", json=payload)
    if r.status_code != 200:
        detail = r.text[:400]
        if "model" in detail.lower() and "not found" in detail.lower():
            raise HTTPException(
                404,
                f"Ollama model '{model}' not found. "
                f"Run: ollama pull {model}"
            )
        raise HTTPException(r.status_code, f"Ollama error: {detail}")
    data = r.json()
    return data.get("message", {}).get("content", "")


async def call_gemini(messages: list[dict], system: str, cfg: dict) -> str:
    key = cfg.get("api_key") or os.environ.get("GEMINI_API_KEY", "")
    if not key or "••" in key:
        raise HTTPException(400,
            "Gemini API key not configured. "
            "Go to Admin Panel → Configure AI → paste your key.")
    model    = cfg.get("model", "gemini-2.0-flash")
    url      = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:generateContent?key={key}")
    contents = [
        {"role": "user" if m["role"] == "user" else "model",
         "parts": [{"text": m["content"]}]}
        for m in messages
    ]
    payload  = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents":           contents,
        "generationConfig": {
            "maxOutputTokens": cfg.get("max_tokens", 1024),
            "temperature":     cfg.get("temperature", 0.35),
        },
    }
    async with _make_client(timeout=30) as client:
        r = await client.post(url, json=payload)
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"Gemini error: {r.text[:300]}")
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


async def call_anthropic(messages: list[dict], system: str, cfg: dict) -> str:
    key = cfg.get("api_key") or os.environ.get("ANTHROPIC_API_KEY", "")
    if not key or "••" in key:
        raise HTTPException(400, "Anthropic API key not configured.")
    payload = {
        "model":      cfg.get("model", "claude-sonnet-4-20250514"),
        "max_tokens": cfg.get("max_tokens", 1024),
        "system":     system,
        "messages":   messages,
    }
    async with _make_client(timeout=30) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json=payload,
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"Anthropic error: {r.text[:300]}")
    return r.json()["content"][0]["text"]

async def call_groq(messages: list[dict], system: str, cfg: dict) -> str:
    """Call Groq API (free tier, OpenAI-compatible)"""
    key = cfg.get("api_key") or os.environ.get("GROQ_API_KEY", "")
    
    if not key or "••" in key:
        raise HTTPException(400, "Groq API key not configured")
    
    payload = {
        "model":       cfg.get("model", "llama-3.3-70b-versatile"),  # ✅ Updated default
        "max_tokens":  cfg.get("max_tokens", 1024),
        "temperature": cfg.get("temperature", 0.35),
        "messages":    [{"role": "system", "content": system}] + messages,
    }
    # Use the existing SSL context from your helper
    ssl_config = _ssl_context()
    
    # _ssl_context() returns:
    # - False if SSL is disabled
    # - SSLContext if custom CA is set  
    # - True for default SSL verification
    
    async with httpx.AsyncClient(timeout=30, verify=ssl_config) as client:
        try:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                },
                json=payload,
            )
        except Exception as e:
            logger.error(f"Groq connection error: {e}")
            raise HTTPException(503, f"Cannot reach Groq API: {str(e)}")
    
    if r.status_code != 200:
        error_detail = r.text[:300]
        if "rate_limit" in error_detail.lower():
            raise HTTPException(429, f"Groq rate limit exceeded: {error_detail}")
        elif "invalid_api_key" in error_detail.lower() or "unauthorized" in error_detail.lower():
            raise HTTPException(401, "Invalid Groq API key. Check your key at console.groq.com")
        elif "model" in error_detail.lower() and "not found" in error_detail.lower():
            raise HTTPException(404, f"Model '{payload['model']}' not available on Groq")
        else:
            raise HTTPException(r.status_code, f"Groq error: {error_detail}")
    
    return r.json()["choices"][0]["message"]["content"]

async def call_openai(messages: list[dict], system: str, cfg: dict) -> str:
    key = cfg.get("api_key") or os.environ.get("OPENAI_API_KEY", "")
    if not key:
        raise HTTPException(400, "OpenAI API key not configured.")
    payload = {
        "model":       cfg.get("model", "gpt-4o-mini"),
        "max_tokens":  cfg.get("max_tokens", 1024),
        "temperature": cfg.get("temperature", 0.35),
        "messages":    [{"role": "system", "content": system}] + messages,
    }
    async with _make_client(timeout=30) as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
            json=payload,
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"OpenAI error: {r.text[:300]}")
    return r.json()["choices"][0]["message"]["content"]


# ── Fallback response when Ollama is unreachable ─────────────────────────────────
def _offline_fallback(question: str) -> str:
    """
    Return a helpful canned response when Ollama is unreachable.
    Reads from whatever context files exist to give real numbers.
    """
    ctx = build_context_block()
    return (
        "⚠️ **AI provider offline** — Ollama is not reachable.\n\n"
        "Here is what I can tell you from the data files directly:\n\n"
        f"```\n{ctx}\n```\n\n"
        "**To restore AI responses:**\n"
        "1. Start Ollama: `ollama serve`\n"
        "2. Pull the model: `ollama pull qwen2`\n"
        "3. Refresh this page."
    )


# ══════════════════════════════════════════════════════════════════════════════
# ROUTER
# ══════════════════════════════════════════════════════════════════════════════

ai_router = APIRouter(prefix="/api/ai", tags=["AI"])


@ai_router.post("/chat")
async def ai_chat(body: ChatRequest):
    cfg = load_config()

    if not cfg.get("enabled", True):
        raise HTTPException(503, "AI Assistant is currently disabled by the administrator.")

    system = build_system_prompt(cfg, body.language, body.inject_context)
    msgs   = [{"role": m.role, "content": m.content} for m in body.messages]

    provider = cfg.get("provider", "ollama")
    t0       = time.monotonic()

    try:
        if provider == "ollama":
            reply = await call_ollama(msgs, system, cfg)
        elif provider == "anthropic":
            reply = await call_anthropic(msgs, system, cfg)
        elif provider == "openai":
            reply = await call_openai(msgs, system, cfg)
        elif provider == "groq":
            reply = await call_groq(msgs, system, cfg)
        elif provider == "gemini":
            reply = await call_gemini(msgs, system, cfg)
        else:
            raise HTTPException(400, f"Unknown provider: {provider}")

    except HTTPException:
        raise
    except ssl.SSLCertVerificationError as exc:
        logger.error("SSL error: %s", exc)
        raise HTTPException(500,
            "SSL certificate verification failed (corporate proxy). "
            "Set AI_VERIFY_SSL=false and restart uvicorn."
        ) from exc
    except (httpx.ConnectError, httpx.ConnectTimeout, ConnectionRefusedError) as exc:
        logger.warning("AI provider unreachable (%s): %s", provider, exc)
        
        # Only fall back to offline mode for Ollama
        if provider == "ollama":
            reply = _offline_fallback(
                body.messages[-1].content if body.messages else ""
            )
            return {
                "reply":    reply,
                "provider": "offline_fallback",
                "model":    None,
                "elapsed":  round(time.monotonic() - t0, 2),
            }
        else:
            # For cloud providers, raise a clear error
            raise HTTPException(503, 
                f"Cannot reach {provider} API. Check your API key and network connection.\n"
                f"Original error: {str(exc)}"
            )
    except Exception as exc:
        msg = str(exc)
        if "CERTIFICATE_VERIFY_FAILED" in msg or "SSL" in msg:
            raise HTTPException(500,
                "SSL error — set AI_VERIFY_SSL=false and restart.") from exc
        logger.exception("AI chat error")
        raise HTTPException(500, f"AI provider error: {exc}") from exc

    elapsed = round(time.monotonic() - t0, 2)
    cfg["token_usage"]["requests"] += 1
    cfg["token_usage"]["total_in"]  += sum(len(m["content"].split()) for m in msgs)
    cfg["token_usage"]["total_out"] += len(reply.split())
    save_config(cfg)

    return {
        "reply":    reply,
        "provider": provider,
        "model":    cfg.get("model"),
        "elapsed":  elapsed,
    }


@ai_router.get("/config")
def get_ai_config():
    cfg  = load_config()
    safe = {**cfg}
    if safe.get("api_key"):
        k = safe["api_key"]
        safe["api_key"] = k[:6] + "••••••" + k[-2:] if len(k) > 8 else "••••••••"
    return safe


@ai_router.post("/config")
def update_ai_config(body: ConfigUpdate):
    cfg     = load_config()
    updates = body.model_dump(exclude_none=True)
    cfg.update(updates)
    save_config(cfg)
    return {"message": "Configuration saved", "provider": cfg["provider"]}


@ai_router.delete("/config/reset-usage")
def reset_usage():
    cfg = load_config()
    cfg["token_usage"] = {"total_in": 0, "total_out": 0, "requests": 0}
    save_config(cfg)
    return {"message": "Usage stats reset"}


@ai_router.get("/status")
def ai_status():
    cfg = load_config()
    ssl_mode = (
        "disabled" if os.environ.get("AI_VERIFY_SSL", "true").lower() in ("false", "0", "no")
        else "custom_ca" if any(
            os.environ.get(e) for e in ("SPIRICOMP_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "SSL_CERT_FILE")
        )
        else "default"
    )
    return {
        "enabled":    cfg.get("enabled", True),
        "provider":   cfg.get("provider"),
        "model":      cfg.get("model"),
        "ollama_url": cfg.get("ollama_url", "http://localhost:11434"),
        "has_key":    bool(cfg.get("api_key") or
                          os.environ.get(f"{cfg.get('provider','').upper()}_API_KEY")),
        "ssl_mode":   ssl_mode,
        "usage":      cfg.get("token_usage", {}),
    }