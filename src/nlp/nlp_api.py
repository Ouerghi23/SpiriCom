"""
src/nlp/nlp_api.py
"""
from __future__ import annotations
import logging
import os
import httpx
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from src.nlp.multilingual_nlp_pipeline import MultilingualNLPPipeline
from src.nlp.complaint_db import ComplaintDB

# FIX-1: logger doit venir de logging, PAS de fastapi
logger = logging.getLogger("nlp_api")

# ── n8n webhook helper ────────────────────────────────────────────────
# FIX-2: une seule définition (était définie deux fois)
async def _trigger_n8n(record: dict, nlp: dict) -> None:
    """Appelle n8n uniquement pour les plaintes très urgentes."""
    webhook_url = os.getenv("N8N_WEBHOOK_URL", "")
    if not webhook_url:
        return
    try:
        async with httpx.AsyncClient(timeout=5, verify=False) as client:
            await client.post(webhook_url, json={
                "event":        "urgent_complaint",
                "complaint_id": record["complaint_id"],
                "urgency":      nlp.get("urgency_level"),
                "category":     nlp.get("category"),
                "city":         record.get("city") or "Inconnue",
                "msisdn":       record.get("msisdn") or "—",
                "text":         record.get("text_original", "")[:200],
                "sentiment":    nlp.get("sentiment"),
                "segment":      record.get("segment"),
                "language":     nlp.get("language"),
            })
        logger.info("n8n triggered → %s", record["complaint_id"])
    except Exception as exc:
        logger.warning("n8n webhook failed (non-fatal): %s", exc)

# ── Auth import — fail-closed ─────────────────────────────────────────
# FIX-3: fallbacks au niveau MODULE (pas à l'intérieur d'une fonction)
try:
    from src.nlp.auth_api import current_user, log_action, client_ip
except Exception as _exc:
    logger.error(
        "auth_api unavailable — complaint status/delete endpoints "
        "disabled (fail-closed): %s", _exc)

    def current_user():
        raise HTTPException(503, "Authentication service unavailable")

    def log_action(*args, **kwargs):
        return None

    def client_ip(*args, **kwargs):
        return "unknown"

# ── Notification imports — defensive ─────────────────────────────────
try:
    from src.api.notification_service import emit_notification
except Exception as _exc:
    logger.warning("notifications_api unavailable: %s", _exc)
    def emit_notification(*args, **kwargs):
        return None

try:
    from src.api.customer_notifier import notify_customer
except Exception as _e:
    logger.warning("customer_notifier unavailable: %s", _e)
    async def notify_customer(*a, **k): return {"notified": False}

# ── Router + pipeline ─────────────────────────────────────────────────
router = APIRouter(tags=["Complaints", "NLP", "Analytics"])
_pipe  = MultilingualNLPPipeline()
_db    = ComplaintDB()

URGENCY_SEVERITY = {
    "très urgent": "critical",
    "urgent":      "major",
    "normal":      "minor",
}

STATUS_LABEL = {
    "open":        "Pending",
    "in_progress": "In Progress",
    "resolved":    "Resolved",
    "closed":      "Closed",
}

# ── Pydantic models ───────────────────────────────────────────────────
class ComplaintSubmit(BaseModel):
    text:     str           = Field(..., min_length=5, max_length=3000)
    msisdn:   Optional[str] = None
    city:     Optional[str] = None
    segment:  Optional[str] = None
    sub_type: Optional[str] = None   # 'question' | 'complaint' | 'feedback' | None
    channel:  Optional[str] = "web"

class StatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(open|in_progress|resolved|closed)$")

# ── Routes ────────────────────────────────────────────────────────────
@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root():
    return """<html><body style="font-family:Arial;max-width:500px;margin:40px auto">
    <h2>Huawei SpiriCom NLP API</h2>
    <ul>
      <li><a href="/form">Complaint Form</a></li>
      <li><a href="/docs">API Documentation</a></li>
      <li><a href="/api/complaints/stats">Live Stats</a></li>
      <li><a href="/api/complaints">All Complaints</a></li>
    </ul>
    </body></html>"""


@router.post("/api/complaints/submit", tags=["Complaints"])
async def submit_complaint(c: ComplaintSubmit):
    nlp = _pipe.analyze(c.text)
    cid = _db._generate_id()

    record = {
        "complaint_id":  cid,
        "submitted_at":  datetime.now().isoformat(),
        "msisdn":        c.msisdn,
        "city_input":    c.city,
        "segment":       c.segment,
        "sub_type":      c.sub_type,
        "channel":       c.channel or "web",
        "text_original": c.text,
        **nlp,
    }

    # FIX-CITY: fallback to form city if NLP didn't detect one
    if not record.get("city") and c.city:
        record["city"] = c.city

    # Override NLP classification when user explicitly chose a type
    if c.sub_type == "question":
        record["is_complaint"]  = False
        record["nlp_category"]  = record.get("nlp_category") or "Question"
        record["urgency_level"] = "normal"
    elif c.sub_type == "complaint":
        record["is_complaint"] = True
    elif c.sub_type == "feedback":
        record["is_complaint"] = False

    _db.insert(record)
    logger.info("NLP keys: %s", list(nlp.keys()))
    logger.info("urgency_level = %r", nlp.get("urgency_level"))
    logger.info("nlp_urgency_level = %r", nlp.get("nlp_urgency_level"))
    logger.info("N8N_WEBHOOK_URL = %r", os.getenv("N8N_WEBHOOK_URL")) 
    urgency = nlp.get("urgency_level") or nlp.get("nlp_urgency_level") or ""


    # ── n8n dispatch — très urgent seulement ──────────────────────
    if urgency in ("très urgent", "urgent"):
        await _trigger_n8n(record, {**nlp, "urgency_level": urgency})
        
    # ──────────────────────────────────────────────────────────────

    is_complaint = record.get("is_complaint")
    notif_type   = "new_complaint" if is_complaint else "new_feedback"
    title        = f"New complaint #{cid}" if is_complaint else f"New feedback #{cid}"
    city         = record.get("city") or "Unknown city"
    severity     = URGENCY_SEVERITY.get(nlp.get("urgency_level"), "minor")

    emit_notification(
        "engineer", notif_type, title,
        f"From {city} · {nlp.get('category', 'Uncategorized')}",
        severity, {"url": "/complaint-map", "id": cid},
    )

    resp_hours = {"très urgent": 2, "urgent": 8, "normal": 24}.get(
        record.get("urgency_level", "normal"), 24)
    lang_label = {"ar": "العربية", "fr": "Français", "en": "English"}.get(
        nlp["language"], nlp["language"])

    return {
        "complaint_id":             cid,
        "is_complaint":             record.get("is_complaint"),
        "sub_type":                 c.sub_type,
        "language_detected":        lang_label,
        "category":                 record.get("nlp_category"),
        "sentiment":                nlp["sentiment"],
        "urgency_level":            record.get("urgency_level"),
        "urgency_score":            nlp["urgency_score"],
        "city_detected":            record.get("city"),
        "estimated_response_hours": resp_hours,
        "message": (
            f"{'Réclamation' if record.get('is_complaint') else 'Message'} "
            f"enregistré (ID: {cid}). "
            f"{'Délai: ' + str(resp_hours) + 'h.' if record.get('is_complaint') else 'Merci.'}"
        ),
    }


@router.post("/api/complaints/analyze", tags=["NLP"])
async def analyze_only(c: ComplaintSubmit):
    return _pipe.analyze(c.text)


@router.get("/api/complaints/stats", tags=["Analytics"])
async def get_stats():
    return _db.stats()


@router.get("/api/complaints", tags=["Complaints"])
async def list_complaints(
    language:     Optional[str]  = Query(None),
    urgency:      Optional[str]  = Query(None),
    sentiment:    Optional[str]  = Query(None),
    status:       Optional[str]  = Query(None),
    is_complaint: Optional[bool] = Query(None),
    limit:        int             = Query(100, le=500),
):
    df = _db.to_dataframe(
        language=language, urgency=urgency, sentiment=sentiment,
        status=status, is_complaint=is_complaint, limit=limit,
    )
    if df.empty:
        return {"total": 0, "complaints": []}
    return {"total": len(df), "complaints": df.to_dict(orient="records")}


@router.get("/api/complaints/{complaint_id}", tags=["Complaints"])
async def get_complaint(complaint_id: str):
    df  = _db.to_dataframe(limit=10000)
    row = df[df["complaint_id"] == complaint_id]
    if row.empty:
        raise HTTPException(404, f"Complaint {complaint_id} not found")
    return row.iloc[0].to_dict()


@router.put("/api/complaints/{complaint_id}/status", tags=["Complaints"])
async def update_status(
    complaint_id: str,
    body: StatusUpdate,
    request: Request,
    caller: dict = Depends(current_user),
):
    df  = _db.to_dataframe(limit=10000)
    row = df[df["complaint_id"] == complaint_id]
    if row.empty:
        raise HTTPException(404, f"Complaint {complaint_id} not found")
    old_status = row.iloc[0].get("status")

    _db.update_status(complaint_id, body.status)

    await notify_customer(
        complaint_id = complaint_id,
        msisdn       = row.iloc[0].get("msisdn"),
        status       = body.status,
        category     = row.iloc[0].get("category", "Réclamation"),
        city         = row.iloc[0].get("city", "Tunisie"),
    )

    transition = (f"{STATUS_LABEL.get(old_status, old_status)} → "
                  f"{STATUS_LABEL.get(body.status, body.status)}")

    log_action(
        actor=caller["username"], action="update_complaint_status",
        target_user=complaint_id, ip=client_ip(request), status="success",
        detail=transition,
    )

    severity = "normal" if body.status in ("resolved", "closed") else "info"
    emit_notification(
        "engineer", "complaint_update",
        f"Complaint #{complaint_id} updated",
        f"Status: {transition}",
        severity, {"url": "/complaint-map", "id": complaint_id},
    )

    return {"complaint_id": complaint_id, "status": body.status}


@router.delete("/api/complaints/{complaint_id}", tags=["Complaints"])
async def delete_complaint(
    complaint_id: str,
    request: Request,
    caller: dict = Depends(current_user),
):
    df  = _db.to_dataframe(limit=10000)
    row = df[df["complaint_id"] == complaint_id]
    if row.empty:
        raise HTTPException(404, f"Complaint {complaint_id} not found")
    category = row.iloc[0].get("category") or "Uncategorized"
    city     = row.iloc[0].get("city")     or "Unknown city"

    with _db._conn() as conn:
        cursor = conn.execute(
            "DELETE FROM complaints WHERE complaint_id = ?", (complaint_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, f"Complaint {complaint_id} not found")

    log_action(
        actor=caller["username"], action="delete_complaint",
        target_user=complaint_id, ip=client_ip(request), status="success",
        detail=f"{category} · {city}",
    )

    emit_notification(
        "engineer", "complaint_update",
        f"Complaint #{complaint_id} deleted",
        f"{category} · {city} · removed by {caller['username']}",
        "major", {"url": "/complaint-map"},
    )

    return {"complaint_id": complaint_id, "deleted": True}