# src/api/notifications_api.py
# ─────────────────────────────────────────────────────────────────────
# SpiriCom NOC — In-app Notification System
#
# Exports:
#   router              — APIRouter (prefix /api/notifications)
#   emit_notification() — call from any router to fire a notification
#   scan_artifacts()    — scan v6 artifacts, auto-emit alerts
#
# Registration in analytics_api.py (already attempted via the try-block):
#   from src.api.notifications_api import router as notif_router
#   app.include_router(notif_router)
#   from src.api.notifications_api import scan_artifacts
#   scan_artifacts()                         # initial scan on startup
#
# Roles:
#   'engineer' — NOC engineers (the main dashboard users)
#   'admin'    — Administrators (AdminLayout pages)
#   'all'      — broadcast to both
#
# Notification types → target role:
#   new_complaint, complaint_update, new_feedback  → engineer
#   new_message                                     → engineer | admin
#   high_risk_churn, coverage_gap, anomaly          → engineer
#   shift_start, shift_end, new_engineer            → admin
#   system_error, ml_complete, ml_failed            → admin
#   high_risk_summary                               → admin
# ─────────────────────────────────────────────────────────────────────
from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from hashlib import md5
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import StreamingResponse

from .artifact_cache import get_json, get_parquet

logger = logging.getLogger(__name__)

DB_PATH  = Path("data/nlp/notifications.db")
SCAN_DEDUP_HOURS = 24      # re-emit same alert only after this gap

# ── SSE broadcast ─────────────────────────────────────────────────────
_subscribers: list[asyncio.Queue] = []
_sub_lock = threading.Lock()

def _broadcast(payload: dict) -> None:
    with _sub_lock:
        dead = []
        for q in _subscribers:
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            _subscribers.remove(q)


# ── DB bootstrap ─────────────────────────────────────────────────────
def _init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as cx:
        cx.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient_role TEXT NOT NULL DEFAULT 'engineer',
                recipient_user TEXT,
                notif_type    TEXT NOT NULL,
                title         TEXT NOT NULL,
                body          TEXT NOT NULL DEFAULT '',
                severity      TEXT NOT NULL DEFAULT 'info',
                meta_json     TEXT NOT NULL DEFAULT '{}',
                is_read       INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT NOT NULL
            )""")
        cx.execute("""
            CREATE TABLE IF NOT EXISTS notif_dedup (
                dedup_key  TEXT PRIMARY KEY,
                emitted_at TEXT NOT NULL
            )""")
        cx.execute(
            "CREATE INDEX IF NOT EXISTS idx_notif_role "
            "ON notifications(recipient_role, is_read, created_at)")
        cx.commit()


_init_db()

_SEVERITY_ORDER = {"critical": 0, "major": 1, "minor": 2, "normal": 3, "info": 4}


# ── Public API ────────────────────────────────────────────────────────
def emit_notification(
    role: str,
    notif_type: str,
    title: str,
    body: str = "",
    severity: str = "info",
    meta: dict | None = None,
    user: str | None = None,
    dedup_key: str | None = None,
) -> Optional[int]:
    """
    Insert a notification and broadcast to live SSE clients.
    Thread-safe; call from any router or background task.
    Returns the new row id, or None if dedup-suppressed.

    Examples
    --------
    emit_notification('engineer', 'new_complaint', 'New complaint',
        f'#{cid} from {city}', 'minor', {'url':'/complaint-map','id':cid})

    emit_notification('admin', 'shift_start', 'Engineer on shift',
        f'{username} clocked in', 'normal', {'user': username})

    emit_notification('all', 'system_error', 'Backend error',
        str(exc), 'critical')
    """
    now = datetime.now(timezone.utc).isoformat()

    if dedup_key:
        cutoff = (datetime.now(timezone.utc) -
                  timedelta(hours=SCAN_DEDUP_HOURS)).isoformat()
        with sqlite3.connect(DB_PATH) as cx:
            row = cx.execute(
                "SELECT emitted_at FROM notif_dedup WHERE dedup_key=?",
                (dedup_key,)).fetchone()
            if row and row[0] > cutoff:
                return None                  # recently emitted
            cx.execute(
                "INSERT OR REPLACE INTO notif_dedup VALUES (?,?)",
                (dedup_key, now))
            cx.commit()

    target_roles = ["engineer", "admin"] if role == "all" else [role]
    last_id = None
    meta_s = json.dumps(meta or {})
    with sqlite3.connect(DB_PATH) as cx:
        for r in target_roles:
            cur = cx.execute(
                "INSERT INTO notifications"
                "(recipient_role,recipient_user,notif_type,title,body,"
                " severity,meta_json,is_read,created_at) VALUES(?,?,?,?,?,?,?,0,?)",
                (r, user, notif_type, title, body, severity, meta_s, now))
            last_id = cur.lastrowid
        cx.commit()

    _broadcast({"id": last_id, "role": role, "type": notif_type,
                "title": title, "severity": severity})
    return last_id


# ── Artifact scanner ─────────────────────────────────────────────────
RISK_THRESHOLD   = 0.70   # calibrated risk above this triggers an alert
COVERAGE_CAP_PCT = 15.0   # NR-capable share below this is a gap
DEDUP_PREFIX = "scan"


def scan_artifacts() -> dict:
    """
    Scan v6 pipeline artifacts and emit alerts for new findings.
    Called on startup and via POST /api/notifications/scan.
    Returns a summary dict for logging / the API response.
    """
    fired: list[str] = []

    # ── 1. High-risk disengagement ─────────────────────────────────
    scores = get_parquet(
        Path("models/disengagement_risk_scores_v2.parquet"))
    if scores is not None and "risk" in scores.columns:
        hi = scores[scores["risk"] > RISK_THRESHOLD]
        n = len(hi)
        if n > 0:
            top5 = (hi.sort_values("risk", ascending=False)
                    .head(5)["msisdn"].astype(str).tolist())
            reasons = []
            if "top_reasons" in hi.columns:
                reasons = (hi.sort_values("risk", ascending=False)
                           .head(3)["top_reasons"].dropna().tolist())
            dk = f"{DEDUP_PREFIX}:highrisk:{n}"
            eid = emit_notification(
                "engineer", "high_risk_churn",
                f"{n} high-disengagement customers detected",
                f"Top MSISDNs: {', '.join(top5[:3])}"
                + (f". Leading reason: {reasons[0]}" if reasons else ""),
                "major", {"url": "/forecasting", "count": n, "msisdns": top5},
                dedup_key=dk)
            if eid:
                fired.append(f"high_risk({n})")
            # Admin summary
            eid2 = emit_notification(
                "admin", "high_risk_summary",
                f"Disengagement summary: {n} high-risk subscribers",
                f"Risk > {RISK_THRESHOLD*100:.0f}%. "
                f"Top: {', '.join(top5[:3])}.",
                "major", {"url": "/forecasting", "count": n},
                dedup_key=f"{dk}:admin")
            if eid2:
                fired.append("admin:high_risk_summary")

    # ── 2. Coverage gaps ───────────────────────────────────────────
    cov = get_json(Path("data/outputs/coverage_5g.json"))
    if cov:
        gaps = [g for g in (cov.get("coverage_gaps") or [])
                if g.get("ratio_5g_pct", 100) < COVERAGE_CAP_PCT]
        if gaps:
            worst = gaps[0]
            dk = f"{DEDUP_PREFIX}:covgap:{len(gaps)}"
            eid = emit_notification(
                "engineer", "coverage_gap",
                f"5G coverage gap: {len(gaps)} underserved provinces",
                f"Worst: {worst.get('province')} "
                f"({worst.get('ratio_5g_pct')}% NR-capable, "
                f"{round((worst.get('churn_rate') or 0)*100,1)}% disengaged)",
                "major",
                {"url": "/forecasting", "provinces":
                 [g["province"] for g in gaps[:5]]},
                dedup_key=dk)
            if eid:
                fired.append(f"coverage_gaps({len(gaps)})")

    # ── 3. Network anomalies ───────────────────────────────────────
    anom = get_parquet(Path("models/anomaly/anomaly_results.parquet"))
    if anom is not None and "anomaly_flag" in anom.columns:
        n_anom = int(anom["anomaly_flag"].sum())
        if n_anom > 0:
            driver = ""
            if "top_anomaly_driver" in anom.columns:
                d = anom[anom["anomaly_flag"] == 1][
                    "top_anomaly_driver"].dropna()
                if len(d):
                    driver = f" · top driver: {d.iloc[0]}"
            dk = f"{DEDUP_PREFIX}:anomalies:{n_anom}"
            eid = emit_notification(
                "engineer", "anomaly_detected",
                f"{n_anom} KPI anomalies detected",
                f"Network anomaly rate: {n_anom} flagged observations{driver}",
                "critical" if n_anom > 100 else "major",
                {"url": "/anomaly-feed", "count": n_anom},
                dedup_key=dk)
            if eid:
                fired.append(f"anomalies({n_anom})")

    return {"scanned_at": datetime.now().isoformat(), "fired": fired,
            "total_fired": len(fired)}


# ── Router ────────────────────────────────────────────────────────────
router = APIRouter(tags=["Notifications"])


def _row_to_dict(row: tuple) -> dict:
    return {
        "id":         row[0],
        "role":       row[1],
        "user":       row[2],
        "type":       row[3],
        "title":      row[4],
        "body":       row[5],
        "severity":   row[6],
        "meta":       json.loads(row[7] or "{}"),
        "is_read":    bool(row[8]),
        "created_at": row[9],
    }


@router.get("/api/notifications")
def list_notifications(
    role:        str  = Query("engineer", pattern="^(engineer|admin)$"),
    unread_only: bool = Query(False),
    limit:       int  = Query(50, ge=1, le=200),
):
    with sqlite3.connect(DB_PATH) as cx:
        q = ("SELECT id,recipient_role,recipient_user,notif_type,title,"
             "body,severity,meta_json,is_read,created_at "
             "FROM notifications WHERE recipient_role=?")
        params: list = [role]
        if unread_only:
            q += " AND is_read=0"
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        rows = cx.execute(q, params).fetchall()
    return {"notifications": [_row_to_dict(r) for r in rows]}


@router.get("/api/notifications/count")
def notification_count(
    role: str = Query("engineer", pattern="^(engineer|admin)$"),
):
    with sqlite3.connect(DB_PATH) as cx:
        n = cx.execute(
            "SELECT COUNT(*) FROM notifications "
            "WHERE recipient_role=? AND is_read=0", (role,)
        ).fetchone()[0]
    return {"count": n}


# Alias that fixes the "0" badge bug in the nav ──────────────────────
@router.get("/api/messages/unread")
def messages_unread(
    role: str = Query("engineer"),
):
    with sqlite3.connect(DB_PATH) as cx:
        n = cx.execute(
            "SELECT COUNT(*) FROM notifications "
            "WHERE recipient_role=? AND is_read=0", (role,)
        ).fetchone()[0]
    return {"count": n}


@router.patch("/api/notifications/{notif_id}/read")
def mark_read(notif_id: int):
    with sqlite3.connect(DB_PATH) as cx:
        cx.execute("UPDATE notifications SET is_read=1 WHERE id=?",
                   (notif_id,))
        cx.commit()
    return {"ok": True}


@router.post("/api/notifications/mark-all-read")
def mark_all_read(payload: dict = Body(default={})):
    role = payload.get("role", "engineer")
    with sqlite3.connect(DB_PATH) as cx:
        cx.execute(
            "UPDATE notifications SET is_read=1 WHERE recipient_role=?",
            (role,))
        cx.commit()
    return {"ok": True}


@router.post("/api/notifications/scan")
def trigger_scan():
    result = scan_artifacts()
    return result


@router.post("/api/notifications/emit")
def emit_endpoint(payload: dict = Body(...)):
    """Internal utility — let other backend services emit notifications
    via HTTP when a direct Python import isn't possible."""
    nid = emit_notification(
        role=payload.get("role", "engineer"),
        notif_type=payload.get("type", "info"),
        title=payload.get("title", "(notification)"),
        body=payload.get("body", ""),
        severity=payload.get("severity", "info"),
        meta=payload.get("meta"),
        user=payload.get("user"),
        dedup_key=payload.get("dedup_key"),
    )
    return {"id": nid, "suppressed": nid is None}


# ── SSE stream ────────────────────────────────────────────────────────
@router.get("/api/notifications/stream")
async def notification_stream(
    role: str = Query("engineer"),
):
    """
    Server-Sent Events stream. Each event is a JSON line:
      data: {"id":N,"role":"engineer","type":"..","title":"..","severity":".."}

    The frontend polls /api/notifications as the primary mechanism;
    SSE provides instant updates for the badge counter.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=64)
    with _sub_lock:
        _subscribers.append(queue)

    async def generate():
        yield "retry: 5000\n\n"
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25)
                    if event.get("role") in (role, "all"):
                        yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"       # keep-alive
        finally:
            with _sub_lock:
                if queue in _subscribers:
                    _subscribers.remove(queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache",
                 "X-Accel-Buffering": "no"})