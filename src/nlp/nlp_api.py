"""
src/nlp/nlp_api.py
FIX-CITY: if NLP doesn't detect a city from text, use user-entered city as fallback

v2 — notification fixes (NLP-1..6):
  NLP-1  emit_notification now imported from notifications_api (the
         in-app SQLite/SSE bell), not notification_service (the
         external ntfy/CallMeBot push module from a different system).
         The old import would raise ImportError at startup and take
         down this whole router.
  NLP-2  c.category did not exist on ComplaintSubmit (AttributeError)
         -> use nlp['category'] from the analysis result.
  NLP-3  Notification moved AFTER a successful _db.insert(), using the
         FIX-CITY-resolved city instead of the raw form input.
  NLP-4  is_complaint splits the event into 'new_complaint' vs
         'new_feedback' (both spec'd as separate engineer triggers).
  NLP-5  PUT /status now emits 'complaint_update' to engineers
         (status-change trigger from the spec).
  NLP-6  Severity derived from nlp['urgency_level'] via URGENCY_SEVERITY
         instead of a hardcoded 'minor', matching the ALARM ladder.

All other code identical.
"""
from __future__ import annotations
import logging
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
# NLP-7: SECURITY — update_status/delete_complaint were unauthenticated;
# any caller could mutate or delete complaints.
# NLP-7b: import is DEFENSIVE but still fails CLOSED — a module-level
# import failure here must not take down the WHOLE complaints router
# (submit/analyze/stats/list/get would 404 too, which is a much bigger
# blast radius than the 2 endpoints that actually need auth). If
# auth_api can't be imported, current_user becomes a dependency that
# always raises 503 — so update_status/delete_complaint are disabled
# (not silently open), while every other endpoint keeps working.
try:
    from src.nlp.auth_api import current_user, log_action, client_ip
except Exception as _exc:                            # pragma: no cover
    logging.getLogger("nlp_api").error(
        "auth_api unavailable — complaint status/delete endpoints "
        "disabled (fail-closed): %s", _exc)

    def current_user():
        raise HTTPException(503, "Authentication service unavailable")

    def log_action(*args, **kwargs):
        return None

    def client_ip(*args, **kwargs):
        return "unknown"

# NLP-1: in-app notification bell (SQLite + SSE), not notification_service
# (that module is the external ntfy/CallMeBot push integration).
# NLP-1b: import is DEFENSIVE — a missing/broken notification system
# must never take down the complaints router (submit/list/status).
try:
    from src.api.notification_service import emit_notification
except Exception as _exc:                            # pragma: no cover
    logging.getLogger("nlp_api").warning(
        "notifications_api unavailable — notifications disabled: %s", _exc)
    def emit_notification(*args, **kwargs):
        return None


router = APIRouter(tags=["Complaints", "NLP", "Analytics"])
_pipe = MultilingualNLPPipeline()
_db   = ComplaintDB()

# NLP-6: urgency_level (from the NLP pipeline) -> notification severity,
# matching the ALARM ladder used across the dashboard.
URGENCY_SEVERITY = {
    "très urgent": "critical",
    "urgent":       "major",
    "normal":       "minor",
}

# NLP-8: display labels for the 4-state workflow (notification bodies only;
# the stored `status` value is unchanged — 'open' on the wire = "Pending").
STATUS_LABEL = {"open": "Pending", "in_progress": "In Progress",
               "resolved": "Resolved", "closed": "Closed"}


class ComplaintSubmit(BaseModel):
    text:    str           = Field(..., min_length=5, max_length=3000)
    msisdn:  Optional[str] = None
    city:    Optional[str] = None
    segment: Optional[str] = None
    channel: Optional[str] = "web"

class StatusUpdate(BaseModel):
    # NLP-8: 4-state workflow — Pending=open, In Progress, Resolved, Closed.
    # 'open' is kept as the wire value for backward compatibility; only the
    # display label (STATUS_LABEL below) says "Pending".
    status: str = Field(..., pattern="^(open|in_progress|resolved|closed)$")


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
        "channel":       c.channel or "web",
        "text_original": c.text,
        **nlp,
    }

    # ── FIX-CITY ──────────────────────────────────────────────────────
    # If the NLP pipeline didn't detect a city from the message text,
    # fall back to the city the user typed in the form field.
    # Without this, nlp_city is always empty when text doesn't mention
    # a Tunisian city name explicitly.
    if not record.get("city") and c.city:
        record["city"] = c.city
    # ──────────────────────────────────────────────────────────────────

    _db.insert(record)

    # ── NLP-1/2/3/4/6: notify AFTER a successful insert ────────────────
    is_complaint = nlp.get("is_complaint")
    notif_type   = "new_complaint" if is_complaint else "new_feedback"
    title        = (f"New complaint #{cid}" if is_complaint
                    else f"New feedback #{cid}")
    city         = record.get("city") or "Unknown city"
    severity     = URGENCY_SEVERITY.get(nlp.get("urgency_level"), "minor")
    emit_notification(
        "engineer", notif_type, title,
        f"From {city} · {nlp.get('category', 'Uncategorized')}",
        severity, {"url": "/complaint-map", "id": cid},
    )
    # ────────────────────────────────────────────────────────────────────

    resp_hours = {"très urgent": 2, "urgent": 8, "normal": 24}.get(nlp["urgency_level"], 24)
    lang_label = {"ar": "العربية", "fr": "Français", "en": "English"}.get(nlp["language"], nlp["language"])

    return {
        "complaint_id":             cid,
        "is_complaint":             nlp.get("is_complaint"),
        "language_detected":        lang_label,
        "category":                 nlp["category"],
        "sentiment":                nlp["sentiment"],
        "urgency_level":            nlp["urgency_level"],
        "urgency_score":            nlp["urgency_score"],
        "city_detected":            record.get("city"),   # ← returns user city if NLP found nothing
        "estimated_response_hours": resp_hours,
        "message": (
            f"{'Réclamation' if nlp.get('is_complaint') else 'Feedback'} "
            f"enregistré (ID: {cid}). "
            f"{'Délai: ' + str(resp_hours) + 'h.' if nlp.get('is_complaint') else 'Merci.'}"
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
    language:     Optional[str]  = Query(None, examples=["ar"]),
    urgency:      Optional[str]  = Query(None, examples=["urgent"]),
    sentiment:    Optional[str]  = Query(None, examples=["critique"]),
    status:       Optional[str]  = Query(None, examples=["open"]),
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
    # NLP-7: SECURITY — this endpoint was unauthenticated. Any logged-in
    # NOC user (engineer/admin) is now required as the audit actor.
    caller: dict = Depends(current_user),
):
    # NLP-10: 404 if the complaint doesn't exist (was a silent no-op
    # before). Also captures the OLD status for the transition log.
    df  = _db.to_dataframe(limit=10000)
    row = df[df["complaint_id"] == complaint_id]
    if row.empty:
        raise HTTPException(404, f"Complaint {complaint_id} not found")
    old_status = row.iloc[0].get("status")

    _db.update_status(complaint_id, body.status)

    transition = (f"{STATUS_LABEL.get(old_status, old_status)} → "
                   f"{STATUS_LABEL.get(body.status, body.status)}")

    # NLP-9: explicit audit trail entry — action name matches
    # AccessLogs.jsx's ACTION_META/uniqueActions exactly
    # (update_complaint_status -> Edit2 / purple). No frontend change
    # needed. See NLP-9-FLAG re: analytics_api's audit middleware.
    log_action(
        actor=caller["username"], action="update_complaint_status",
        target_user=complaint_id, ip=client_ip(request), status="success",
        detail=transition,
    )

    # NLP-5/11: status-change trigger from the spec, with old→new
    # transition in the notification body. 'resolved'/'closed' are good
    # news -> normal (green); other transitions -> info (blue).
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
    # NLP-7: SECURITY — this endpoint was unauthenticated. Deletion now
    # requires a logged-in NOC user, recorded as the audit actor.
    caller: dict = Depends(current_user),
):
    # NLP-10: fetch context BEFORE deleting — both for a useful audit
    # detail and to 404 cleanly if the complaint is already gone.
    df  = _db.to_dataframe(limit=10000)
    row = df[df["complaint_id"] == complaint_id]
    if row.empty:
        raise HTTPException(404, f"Complaint {complaint_id} not found")
    category = row.iloc[0].get("category") or "Uncategorized"
    city     = row.iloc[0].get("city") or "Unknown city"

    with _db._conn() as conn:
        cursor = conn.execute(
            "DELETE FROM complaints WHERE complaint_id = ?", (complaint_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, f"Complaint {complaint_id} not found")

    # NLP-9: explicit audit trail entry — matches AccessLogs.jsx's
    # delete_complaint ACTION_META (Trash2 / critical). See NLP-9-FLAG.
    log_action(
        actor=caller["username"], action="delete_complaint",
        target_user=complaint_id, ip=client_ip(request), status="success",
        detail=f"{category} · {city}",
    )

    # NLP-11: surface deletions to engineers too (spec: "new update in
    # complaint data ... etc." covers removal, not just status change).
    emit_notification(
        "engineer", "complaint_update",
        f"Complaint #{complaint_id} deleted",
        f"{category} · {city} · removed by {caller['username']}",
        "major", {"url": "/complaint-map"},
    )

    return {"complaint_id": complaint_id, "deleted": True}