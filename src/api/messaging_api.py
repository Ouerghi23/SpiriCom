"""
src/api/messaging_api.py
========================
SpiriCom — Internal messaging system between Admin and NOC Engineers.
v2 — MSG-1/MSG-2/MSG-3: Fixed Depends(_get_current_user()) → module-level import.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("messaging_api")

# MSG-2: in-app notification bell — defensive import
try:
    from src.api.notification_service import emit_notification
except Exception as _exc:
    logger.warning(
        "notification_service unavailable — message notifications disabled: %s",
        _exc)
    def emit_notification(*args, **kwargs):
        return None

PRIORITY_SEVERITY = {"urgent": "major", "info": "info", "normal": "info"}

MSG_DB_PATH = Path("data/nlp/messages.db")

# ── DB helpers ────────────────────────────────────────────────────────
def get_conn() -> sqlite3.Connection:
    MSG_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(MSG_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def ensure_messages_table() -> None:
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user TEXT    NOT NULL,
                to_user   TEXT    NOT NULL,
                content   TEXT    NOT NULL,
                timestamp TEXT    NOT NULL
                          DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
                read_by   TEXT    NOT NULL DEFAULT '[]',
                priority  TEXT    NOT NULL DEFAULT 'normal',
                msg_type  TEXT    NOT NULL DEFAULT 'direct'
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_msg_to   ON messages (to_user)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_msg_from ON messages (from_user)")
    logger.info("messages table ready")

ensure_messages_table()

# ── MSG-3: Module-level import (replaces broken _get_current_user()) ──
try:
    from src.nlp.auth_api import current_user
except ImportError:
    try:
        from src.nlp.auth_api import current_user
    except ImportError:
        logger.error(
            "auth_api.current_user not found — messaging running in DEV/NO-AUTH mode"
        )
        async def current_user():
            return {"username": "dev", "role": "engineer"}

# ── Pydantic models ───────────────────────────────────────────────────
class SendMessageRequest(BaseModel):
    to_user:  str
    content:  str
    priority: str = "normal"
    msg_type: str = "direct"

class MessageOut(BaseModel):
    id:        int
    from_user: str
    to_user:   str
    content:   str
    timestamp: str
    read_by:   list[str]
    priority:  str
    msg_type:  str
    is_read:   bool

# ── Router ────────────────────────────────────────────────────────────
msg_router = APIRouter(prefix="/api/messages", tags=["Messaging"])

def _row_to_out(row: sqlite3.Row, current_username: str) -> dict:
    read_by = json.loads(row["read_by"] or "[]")
    return {
        "id":        row["id"],
        "from_user": row["from_user"],
        "to_user":   row["to_user"],
        "content":   row["content"],
        "timestamp": row["timestamp"],
        "read_by":   read_by,
        "priority":  row["priority"],
        "msg_type":  row["msg_type"],
        "is_read":   current_username in read_by,
    }

@msg_router.get("")
def list_messages(
    limit: int = 50,
    offset: int = 0,
    user: dict = Depends(current_user),  # ← MSG-3: direct reference
):
    me = user["username"]
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM messages
               WHERE to_user = ? OR to_user = 'all' OR from_user = ?
               ORDER BY id DESC LIMIT ? OFFSET ?""",
            (me, me, limit, offset),
        ).fetchall()
        total = conn.execute(
            """SELECT COUNT(*) FROM messages
               WHERE to_user = ? OR to_user = 'all' OR from_user = ?""",
            (me, me),
        ).fetchone()[0]
    return {"total": total, "messages": [_row_to_out(r, me) for r in rows]}

@msg_router.get("/unread")
def unread_count(user: dict = Depends(current_user)):  # ← MSG-3
    me = user["username"]
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT read_by FROM messages
               WHERE (to_user = ? OR to_user = 'all') AND from_user != ?""",
            (me, me),
        ).fetchall()
    unread = sum(1 for r in rows if me not in json.loads(r["read_by"] or "[]"))
    return {"unread": unread}

@msg_router.post("")
def send_message(
    body: SendMessageRequest,
    user: dict = Depends(current_user),  # ← MSG-3
):
    me      = user["username"]
    role    = user.get("role", "engineer").lower()
    content = body.content.strip()

    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")
    if role != "admin" and body.to_user not in ("admin", "all"):
        raise HTTPException(status_code=403,
            detail="Engineers can only message 'admin' or broadcast to 'all'")

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO messages (from_user, to_user, content, priority, msg_type) "
            "VALUES (?, ?, ?, ?, ?)",
            (me, body.to_user, content, body.priority, body.msg_type),
        )
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    logger.info("Message sent: %s → %s (id=%d)", me, body.to_user, new_id)

    severity = PRIORITY_SEVERITY.get(body.priority, "info")
    preview  = content if len(content) <= 80 else content[:77] + "..."
    if body.to_user == "admin":
        target_role = "admin"
    elif body.to_user == "all":
        target_role = "all"
    else:
        target_role = "engineer"
    emit_notification(
        target_role, "new_message",
        f"New message from {me}", preview,
        severity, {"url": "/messages", "id": new_id},
    )
    return {"id": new_id, "message": "Message sent"}

@msg_router.patch("/{msg_id}/read")
def mark_read(msg_id: int, user: dict = Depends(current_user)):  # ← MSG-3
    me = user["username"]
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Message not found")
        read_by = json.loads(row["read_by"] or "[]")
        if me not in read_by:
            read_by.append(me)
            conn.execute("UPDATE messages SET read_by = ? WHERE id = ?",
                        (json.dumps(read_by), msg_id))
    return {"message": "Marked as read", "read_by": read_by}

@msg_router.patch("/read-all")
def mark_all_read(user: dict = Depends(current_user)):  # ← MSG-3
    me = user["username"]
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, read_by FROM messages WHERE to_user = ? OR to_user = 'all'",
            (me,),
        ).fetchall()
        updated = 0
        for row in rows:
            read_by = json.loads(row["read_by"] or "[]")
            if me not in read_by:
                read_by.append(me)
                conn.execute("UPDATE messages SET read_by = ? WHERE id = ?",
                            (json.dumps(read_by), row["id"]))
                updated += 1
    return {"message": f"Marked {updated} messages as read"}

@msg_router.delete("/{msg_id}")
def delete_message(msg_id: int, user: dict = Depends(current_user)):  # ← MSG-3
    me   = user["username"]
    role = user.get("role", "engineer").lower()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT from_user FROM messages WHERE id = ?", (msg_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Message not found")
        if role != "admin" and row["from_user"] != me:
            raise HTTPException(status_code=403,
                detail="Cannot delete someone else's message")
        conn.execute("DELETE FROM messages WHERE id = ?", (msg_id,))
    return {"message": "Message deleted"}