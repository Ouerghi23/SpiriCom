# src/api/ai_api.py
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import requests as rq
from fastapi import APIRouter, Body, HTTPException

from .artifact_cache import get_json, get_parquet

logger = logging.getLogger(__name__)
ai_router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])
router = ai_router  # alias

CFG_PATH = Path("data/ai_config.json")

DEFAULT_CFG: dict[str, Any] = {
    "enabled": True,
    "provider": "ollama",
    "model": "qwen2",
    "max_tokens": 800,
    "temperature": 0.35,
    "system_prompt": "",
    "auto_context": True,
    "ollama_url": "http://localhost:11434",
    "api_keys": {},          # per-provider, stored server-side only
    "token_usage": {"requests": 0, "total_in": 0, "total_out": 0},
}

BASE_SYSTEM = (
    "You are the SpiriCom NOC AI Assistant for Huawei Technologies "
    "Tunisia (PFE 2026). You analyse Ooredoo Tunisia network complaints, "
    "customer disengagement risk, 5G adoption, and network anomalies. "
    "Be concise and factual. Use the NOC DATA CONTEXT block when present; "
    "if a number is not in the context, say it is not available rather "
    "than inventing it. The disengagement label is a segmentation "
    "(dou<=Q20 OR duration<=Q20 on observed data), not measured churn - "
    "say 'disengagement' rather than 'churn' when precision matters."
)


# ── Config persistence ────────────────────────────────────────────────
def _load_cfg() -> dict:
    if CFG_PATH.exists():
        try:
            with open(CFG_PATH, encoding="utf-8") as f:
                cfg = {**DEFAULT_CFG, **json.load(f)}
            cfg["token_usage"] = {**DEFAULT_CFG["token_usage"],
                                  **cfg.get("token_usage", {})}
            return cfg
        except Exception as e:
            logger.error(f"ai_config.json unreadable: {e}")
    return dict(DEFAULT_CFG)


def _save_cfg(cfg: dict) -> None:
    CFG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CFG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def _mask(key: str) -> str:
    if not key:
        return ""
    return "••••••••" + key[-4:] if len(key) > 4 else "••••"


def _wc(s: str) -> int:
    return len(str(s).split())


# ── NOC context builder (AI-3) ────────────────────────────────────────
def _build_context() -> str:
    parts: list[str] = []

    eda = get_json(Path("data/outputs/churn_eda_v6.json"))
    if eda:
        parts.append(
            f"DISENGAGEMENT LABEL v6: {eda.get('labelled_customers'):,} labelled "
            f"of {eda.get('total_customers'):,} customers; "
            f"{eda.get('disengaged'):,} disengaged "
            f"({eda.get('disengaged_share_pct')}%, design parameter); "
            f"{eda.get('unlabelled_imputed'):,} unlabelled (imputed). "
            f"Thresholds: dou<={eda.get('thresholds', {}).get('dou_q20_bytes'):,} "
            f"bytes, duration<={eda.get('thresholds', {}).get('dur_q20_seconds')} s.")

    final = get_json(Path("data/outputs/disengagement_final.json"))
    if final:
        m = (final.get("test_metrics_clean", {})
             .get(final.get("selected_model", ""), {}))
        drivers = list((final.get("shap_top_drivers") or {}).items())[:5]
        parts.append(
            f"MODEL: {final.get('served_model')} - test PR-AUC "
            f"{m.get('pr_auc')}, ROC-AUC {m.get('roc_auc')}, F1 {m.get('f1')}, "
            f"threshold {final.get('calibration', {}).get('threshold')}. "
            "Top SHAP drivers: "
            + ", ".join(f"{k} ({v:.2f})" for k, v in drivers) + ".")

    risk = get_parquet(Path("models/disengagement_risk_scores_v2.parquet"))
    if risk is not None and len(risk):
        top = risk.sort_values("risk", ascending=False).head(5)
        rows = "; ".join(
            f"{r.msisdn} risk {min(float(r.risk), 0.99):.2f}"
            + (f" ({r.top_reasons})" if "top_reasons" in risk.columns
               and isinstance(r.top_reasons, str) else "")
            for r in top.itertuples())
        parts.append(f"TOP-5 HIGH-RISK SUBSCRIBERS (calibrated): {rows}.")

    cov = get_json(Path("data/outputs/coverage_5g.json"))
    if cov:
        k = cov.get("kpi", {})
        gaps = ", ".join(
            f"{g['province']} ({g['ratio_5g_pct']}% capable, "
            f"{round((g.get('churn_rate') or 0) * 100, 1)}% disengaged)"
            for g in (cov.get("coverage_gaps") or [])[:5])
        parts.append(
            f"5G COVERAGE: adoption {k.get('adoption_rate_pct')}% real usage "
            f"({k.get('subscribers_using_5g')} subs), NR-capable devices "
            f"{k.get('capable_devices_pct')}%. Worst coverage gaps: {gaps}. "
            "Note: traffic_5g is 91.8% imputed; the 5G forecast is pending "
            "the NB00 fix.")

    ana = get_json(Path("data/outputs/analysis_results.json"))
    if ana:
        tot = ana.get("total_complaints") or ana.get("n_complaints")
        if tot:
            parts.append(f"COMPLAINTS (NB01): {tot:,} total complaints analysed.")

    an = get_parquet(Path("models/anomaly/anomaly_results.parquet"))
    if an is not None and "anomaly_flag" in getattr(an, "columns", []):
        parts.append(
            f"ANOMALIES: {int(an['anomaly_flag'].sum()):,} flagged "
            f"({an['anomaly_flag'].mean() * 100:.1f}% of observations).")

    if not parts:
        return ""
    return "NOC DATA CONTEXT (live artifacts):\n- " + "\n- ".join(parts)


LANG_RULE = {
    "zh": "Reply in Chinese (中文).",
    "fr": "Réponds en français.",
    "en": "",
}


# ── Provider calls ────────────────────────────────────────────────────
def _call_ollama(cfg, system, messages) -> str:
    url = (cfg.get("ollama_url") or "http://localhost:11434").rstrip("/")
    r = rq.post(f"{url}/api/chat", json={
        "model": cfg["model"],
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": False,
        "options": {"temperature": cfg["temperature"],
                    "num_predict": cfg["max_tokens"]},
    }, timeout=120)
    r.raise_for_status()
    return r.json()["message"]["content"]


def _call_openai_style(base_url, key, cfg, system, messages) -> str:
    r = rq.post(f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": cfg["model"],
                    "messages": [{"role": "system", "content": system}] + messages,
                    "max_tokens": cfg["max_tokens"],
                    "temperature": cfg["temperature"],
                }, timeout=90)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _call_anthropic(key, cfg, system, messages) -> str:
    r = rq.post("https://api.anthropic.com/v1/messages",
                headers={"x-api-key": key,
                         "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={
                    "model": cfg["model"],
                    "system": system,
                    "messages": messages,
                    "max_tokens": cfg["max_tokens"],
                    "temperature": cfg["temperature"],
                }, timeout=90)
    r.raise_for_status()
    return "".join(b.get("text", "") for b in r.json().get("content", []))


def _call_gemini(key, cfg, system, messages) -> str:
    contents = [{"role": "model" if m["role"] == "assistant" else "user",
                 "parts": [{"text": m["content"]}]} for m in messages]
    r = rq.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{cfg['model']}:generateContent?key={key}",
        json={
            "system_instruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": {"temperature": cfg["temperature"],
                                 "maxOutputTokens": cfg["max_tokens"]},
        }, timeout=90)
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def _dispatch(cfg, system, messages) -> str:
    p = cfg["provider"]
    key = cfg.get("api_keys", {}).get(p, "")
    if p == "ollama":
        return _call_ollama(cfg, system, messages)
    if not key:
        raise HTTPException(400, f"No API key configured for {p}")
    if p == "groq":
        return _call_openai_style("https://api.groq.com/openai/v1",
                                  key, cfg, system, messages)
    if p == "openai":
        return _call_openai_style("https://api.openai.com/v1",
                                  key, cfg, system, messages)
    if p == "anthropic":
        return _call_anthropic(key, cfg, system, messages)
    if p == "gemini":
        return _call_gemini(key, cfg, system, messages)
    raise HTTPException(400, f"Unknown provider: {p}")


def _offline_reply(lang: str) -> str:
    ctx = _build_context()
    head = {"zh": "AI 服务当前离线。以下是缓存的 NOC 数据摘要：",
            "fr": "Le service IA est hors ligne. Résumé des données NOC en cache :",
            "en": "The AI provider is unreachable. Here is the cached NOC data summary:"
            }.get(lang, "The AI provider is unreachable. Cached NOC summary:")
    if not ctx:
        return head + "\n\n(no cached artifacts found - run the notebooks)"
    return f"{head}\n\n{ctx}\n\n" + (
        "Start the provider (e.g. `ollama serve`) and retry for full answers.")


# ── Endpoints ─────────────────────────────────────────────────────────
@ai_router.get("/status")
def ai_status():
    cfg = _load_cfg()
    return {
        "enabled": cfg["enabled"],
        "provider": cfg["provider"],
        "model": cfg["model"],
        "has_key": (cfg["provider"] == "ollama"
                    or bool(cfg.get("api_keys", {}).get(cfg["provider"]))),
    }


@ai_router.get("/config")
def get_config():
    cfg = _load_cfg()
    return {
        "enabled": cfg["enabled"],
        "provider": cfg["provider"],
        "model": cfg["model"],
        "max_tokens": cfg["max_tokens"],
        "temperature": cfg["temperature"],
        "system_prompt": cfg["system_prompt"],
        "auto_context": cfg["auto_context"],
        "ollama_url": cfg["ollama_url"],
        # AI-2: masked, per current provider
        "api_key": _mask(cfg.get("api_keys", {}).get(cfg["provider"], "")),
        "token_usage": cfg["token_usage"],
    }


@ai_router.post("/config")
def save_config(payload: dict = Body(...)):
    cfg = _load_cfg()
    for k in ("enabled", "provider", "model", "max_tokens",
              "temperature", "system_prompt", "auto_context"):
        if k in payload:
            cfg[k] = payload[k]
    if cfg.get("model") == "__custom__":
        raise HTTPException(400, "Enter a custom model name before saving")
    if "ollama_url" in payload and payload["ollama_url"]:
        cfg["ollama_url"] = str(payload["ollama_url"]).strip()
    # AI-2: only store a real, unmasked key
    new_key = payload.get("api_key")
    if new_key and "••" not in new_key:
     cfg.setdefault("api_keys", {})[cfg["provider"]] = new_key.strip()
    _save_cfg(cfg)
    return {"ok": True}


@ai_router.delete("/config/reset-usage")
def reset_usage():
    cfg = _load_cfg()
    cfg["token_usage"] = dict(DEFAULT_CFG["token_usage"])
    _save_cfg(cfg)
    return {"ok": True}


@ai_router.post("/chat")
def ai_chat(payload: dict = Body(...)):
    cfg = _load_cfg()
    if not cfg["enabled"]:
        raise HTTPException(403, "AI assistant is disabled by the administrator")

    messages = [{"role": m.get("role", "user"),
                 "content": str(m.get("content", ""))}
                for m in payload.get("messages", []) if m.get("content")]
    if not messages:
        raise HTTPException(400, "messages is empty")
    lang = payload.get("language", "en")
    inject = bool(payload.get("inject_context", True)) and cfg["auto_context"]

    system = BASE_SYSTEM
    if cfg.get("system_prompt"):
        system += "\n\nADMIN INSTRUCTIONS:\n" + cfg["system_prompt"]
    if LANG_RULE.get(lang):
        system += "\n\n" + LANG_RULE[lang]
    if inject:
        ctx = _build_context()
        if ctx:
            system += "\n\n" + ctx

    t0 = time.time()
    try:
        reply = _dispatch(cfg, system, messages)
        provider, model = cfg["provider"], cfg["model"]
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"AI provider call failed ({cfg['provider']}): {e}")
        reply, provider, model = _offline_reply(lang), "offline_fallback", "cached-data"

    elapsed = round(time.time() - t0, 2)

    # Usage in approximate words (the UI labels them '~w')
    cfg = _load_cfg()
    u = cfg["token_usage"]
    u["requests"] += 1
    u["total_in"] += _wc(system) + sum(_wc(m["content"]) for m in messages)
    u["total_out"] += _wc(reply)
    _save_cfg(cfg)

    return {"reply": reply, "elapsed": elapsed,
            "provider": provider, "model": model}