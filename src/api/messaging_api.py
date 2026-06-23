"""
src/api/messaging_api.py
========================
SpiriCom — Internal messaging system (v3)

NEW in v3:
  MSG-E1  Edit message  — PATCH /{id}         (sender only, 15-min window)
  MSG-E2  Delete for me — DELETE /{id}?mode=me (soft-delete, hidden per user)
  MSG-E3  Delete for all— DELETE /{id}?mode=everyone (hard-delete, admin/sender)
  MSG-E4  Translation   — POST /{id}/translate (calls configured LLM)
  DB-M1   Migration guard adds 4 new columns without dropping existing data.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger("messaging_api")

try:
    from src.api.notification_service import emit_notification
except Exception as _exc:
    logger.warning("notification_service unavailable: %s", _exc)
    def emit_notification(*args, **kwargs): return None

PRIORITY_SEVERITY  = {"urgent": "major", "info": "info", "normal": "info"}
EDIT_WINDOW_S      = 15 * 60   # 15 minutes
MSG_DB_PATH        = Path("data/nlp/messages.db")

def isBroadcast(to: str) -> bool:
    return to in ("all", "all_engineers")

# ── DB helpers ────────────────────────────────────────────────────────
def get_conn() -> sqlite3.Connection:
    MSG_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(MSG_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def ensure_messages_table() -> None:
    with get_conn() as conn:
        # Core table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user        TEXT    NOT NULL,
                to_user          TEXT    NOT NULL,
                content          TEXT    NOT NULL,
                timestamp        TEXT    NOT NULL
                                 DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
                read_by          TEXT    NOT NULL DEFAULT '[]',
                priority         TEXT    NOT NULL DEFAULT 'normal',
                msg_type         TEXT    NOT NULL DEFAULT 'direct',
                edited           INTEGER NOT NULL DEFAULT 0,
                edited_at        TEXT,
                deleted_for      TEXT    NOT NULL DEFAULT '[]',
                deleted_globally INTEGER NOT NULL DEFAULT 0
            )
        """)
        # DB-M1: migrate existing DBs that pre-date v3 columns
        cols = {r[1] for r in conn.execute("PRAGMA table_info(messages)").fetchall()}
        for col, dfn in [
            ("edited",           "INTEGER NOT NULL DEFAULT 0"),
            ("edited_at",        "TEXT"),
            ("deleted_for",      "TEXT    NOT NULL DEFAULT '[]'"),
            ("deleted_globally", "INTEGER NOT NULL DEFAULT 0"),
        ]:
            if col not in cols:
                conn.execute(f"ALTER TABLE messages ADD COLUMN {col} {dfn}")
                logger.info("messages: added column %s", col)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_msg_to   ON messages (to_user)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_msg_from ON messages (from_user)")
    logger.info("messages table ready (v3)")

ensure_messages_table()

# ── Auth import ───────────────────────────────────────────────────────
try:
    from src.nlp.auth_api import current_user
except ImportError:
    try:
        from src.nlp.auth_api import current_user
    except ImportError:
        logger.error("auth_api.current_user not found — DEV/NO-AUTH mode")
        async def current_user():
            return {"username": "dev", "role": "engineer"}

# ── Pydantic models ───────────────────────────────────────────────────
class SendMessageRequest(BaseModel):
    to_user:  str
    content:  str
    priority: str = "normal"
    msg_type: str = "direct"

class EditMessageRequest(BaseModel):
    content: str

class TranslateRequest(BaseModel):
    target_lang: str = "zh"   # zh | fr | en | ar

# ── Helpers ───────────────────────────────────────────────────────────
def _row_to_out(row: sqlite3.Row, current_username: str) -> dict:
    read_by     = json.loads(row["read_by"]     or "[]")
    deleted_for = json.loads(row["deleted_for"] or "[]")
    return {
        "id":               row["id"],
        "from_user":        row["from_user"],
        "to_user":          row["to_user"],
        "content":          row["content"],
        "timestamp":        row["timestamp"],
        "read_by":          read_by,
        "priority":         row["priority"],
        "msg_type":         row["msg_type"],
        "is_read":          current_username in read_by,
        "edited":           bool(row["edited"]),
        "edited_at":        row["edited_at"],
        "deleted_globally": bool(row["deleted_globally"]),
    }

def _is_participant(row: sqlite3.Row, me: str) -> bool:
    return row["to_user"] in (me, "all", "all_engineers") or row["from_user"] == me

def _is_visible(row: sqlite3.Row, me: str) -> bool:
    if row["deleted_globally"]:
        return False
    deleted_for = json.loads(row["deleted_for"] or "[]")
    return me not in deleted_for

# ── Router ────────────────────────────────────────────────────────────
msg_router = APIRouter(prefix="/api/messages", tags=["Messaging"])

# ── GET /  ────────────────────────────────────────────────────────────
@msg_router.get("")
def list_messages(
    limit:  int = 50,
    offset: int = 0,
    user: dict = Depends(current_user),
):
    me   = user["username"]
    role = user.get("role", "engineer").lower()

    with get_conn() as conn:
        if role == "admin":
            # Admin sees every message in the system
            rows = conn.execute(
                """SELECT * FROM messages
                   WHERE deleted_globally = 0
                   ORDER BY id DESC LIMIT ? OFFSET ?""",
                (limit, offset),
            ).fetchall()
        else:
            # Engineer sees only their own sent/received messages + broadcasts
            # Other engineers' private conversations are invisible
            rows = conn.execute(
                """SELECT * FROM messages
                   WHERE (
                       from_user = ?
                       OR to_user = ?
                       OR to_user = 'all'
                       OR to_user = 'all_engineers'
                   )
                   AND deleted_globally = 0
                   ORDER BY id DESC LIMIT ? OFFSET ?""",
                (me, me, limit, offset),
            ).fetchall()

    visible   = [r for r in rows if _is_visible(r, me)]
    paginated = visible[offset: offset + limit]
    return {
        "total":    len(visible),
        "messages": [_row_to_out(r, me) for r in paginated],
    }

# ── GET /unread ───────────────────────────────────────────────────────
@msg_router.get("/unread")
def unread_count(user: dict = Depends(current_user)):
    me = user["username"]
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT read_by, deleted_for, deleted_globally FROM messages
               WHERE (to_user = ? OR to_user = 'all'
                      OR to_user = 'all_engineers')
               AND from_user != ?""",
            (me, me),
        ).fetchall()
    unread = sum(
        1 for r in rows
        if not r["deleted_globally"]
        and me not in json.loads(r["deleted_for"] or "[]")
        and me not in json.loads(r["read_by"] or "[]")
    )
    return {"unread": unread}

# ── POST /  ───────────────────────────────────────────────────────────
@msg_router.post("")
def send_message(
    body: SendMessageRequest,
    user: dict = Depends(current_user),
):
    me      = user["username"]
    role    = user.get("role", "engineer").lower()
    content = body.content.strip()

    if not content:
        raise HTTPException(400, "Message content cannot be empty")
    if len(content) > 2000:
        raise HTTPException(400, "Message too long (max 2000 chars)")
    # FIX-5: clean restrictions
    if role == "viewer":
        raise HTTPException(403, "Viewers cannot send messages")

    # engineer can message any named user; admin can send to anyone

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO messages "
            "(from_user, to_user, content, priority, msg_type) "
            "VALUES (?, ?, ?, ?, ?)",
            (me, body.to_user, content, body.priority, body.msg_type),
        )
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    severity = PRIORITY_SEVERITY.get(body.priority, "info")
    preview  = content if len(content) <= 80 else content[:77] + "..."
    target   = "admin" if body.to_user == "admin" else "all"
    emit_notification(
        target, "new_message",
        f"New message from {me}", preview,
        severity, {"url": "/messages", "id": new_id},
    )
    return {"id": new_id, "message": "Message sent"}

# ── PATCH /{id}  — Edit (MSG-E1) ─────────────────────────────────────
@msg_router.patch("/{msg_id}")
def edit_message(
    msg_id: int,
    body: EditMessageRequest,
    user: dict = Depends(current_user),
):
    me      = user["username"]
    content = body.content.strip()

    if not content:
        raise HTTPException(400, "Content cannot be empty")
    if len(content) > 2000:
        raise HTTPException(400, "Message too long")

    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM messages WHERE id = ?", (msg_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Message not found")
        if row["from_user"] != me:
            raise HTTPException(403, "Cannot edit someone else's message")

        # 15-minute edit window
        try:
            ts  = row["timestamp"].replace("Z", "+00:00")
            age = (datetime.now(timezone.utc) -
                   datetime.fromisoformat(ts)).total_seconds()
        except Exception:
            age = 0

        if age > EDIT_WINDOW_S:
            raise HTTPException(400, "Edit window expired (15 minutes)")

        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE messages SET content = ?, edited = 1, edited_at = ? "
            "WHERE id = ?",
            (content, now_iso, msg_id),
        )

    return {"id": msg_id, "content": content, "edited": True,
            "message": "Message edited"}

# ── DELETE /{id}  — Delete for me / for everyone (MSG-E2, MSG-E3) ────
@msg_router.delete("/{msg_id}")
def delete_message(
    msg_id: int,
    mode: str = Query("everyone", regex="^(me|everyone)$"),
    user: dict = Depends(current_user),
):
    me   = user["username"]
    role = user.get("role", "engineer").lower()

    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM messages WHERE id = ?", (msg_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Message not found")

        if mode == "everyone":
            if row["from_user"] != me and role != "admin":
                raise HTTPException(403, "Only the sender or admin can delete for everyone")
            conn.execute(
                "UPDATE messages SET deleted_globally = 1 WHERE id = ?", (msg_id,)
            )
            return {"message": "Message deleted for everyone", "mode": "everyone"}

        else:   # mode == "me"
            deleted_for = json.loads(row["deleted_for"] or "[]")
            if me not in deleted_for:
                deleted_for.append(me)
                conn.execute(
                    "UPDATE messages SET deleted_for = ? WHERE id = ?",
                    (json.dumps(deleted_for), msg_id),
                )
            return {"message": "Message hidden for you", "mode": "me"}

# ── PATCH /{id}/read ─────────────────────────────────────────────────
@msg_router.patch("/{msg_id}/read")
def mark_read(msg_id: int, user: dict = Depends(current_user)):
    me = user["username"]
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM messages WHERE id = ?", (msg_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Message not found")
        read_by = json.loads(row["read_by"] or "[]")
        if me not in read_by:
            read_by.append(me)
            conn.execute(
                "UPDATE messages SET read_by = ? WHERE id = ?",
                (json.dumps(read_by), msg_id),
            )
    return {"message": "Marked as read", "read_by": read_by}

# ── PATCH /read-all ──────────────────────────────────────────────────
@msg_router.patch("/read-all")
def mark_all_read(user: dict = Depends(current_user)):
    me = user["username"]
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, read_by, deleted_for, deleted_globally FROM messages "
            "WHERE to_user = ? OR to_user = 'all' OR to_user = 'all_engineers'",
            (me,),
        ).fetchall()
        updated = 0
        for row in rows:
            if row["deleted_globally"]:
                continue
            deleted_for = json.loads(row["deleted_for"] or "[]")
            if me in deleted_for:
                continue
            read_by = json.loads(row["read_by"] or "[]")
            if me not in read_by:
                read_by.append(me)
                conn.execute(
                    "UPDATE messages SET read_by = ? WHERE id = ?",
                    (json.dumps(read_by), row["id"]),
                )
                updated += 1
    return {"message": f"Marked {updated} messages as read"}

# ── POST /{id}/translate  — MSG-E4 ───────────────────────────────────
@msg_router.post("/{msg_id}/translate")
def translate_message(
    msg_id: int,
    body: TranslateRequest,
    user: dict = Depends(current_user),
):
    """Translate a message using the configured LLM provider."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT content FROM messages WHERE id = ?", (msg_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Message not found")

    content = row["content"]
    lang_map = {"zh": "Chinese (Simplified)", "fr": "French",
                "en": "English", "ar": "Arabic"}
    target = lang_map.get(body.target_lang, "Chinese (Simplified)")
    prompt = (f"Translate the following text to {target}. "
              f"Return only the translation, nothing else.\n\n{content}")

    # Load AI config and dispatch
    try:
        from src.api.ai_api import _load_cfg, _dispatch
        cfg   = _load_cfg()
        reply = _dispatch(cfg,
                          "You are a professional translator.",
                          [{"role": "user", "content": prompt}])
        return {"translated": reply.strip(), "target_lang": body.target_lang}
    except Exception as exc:
        logger.warning("Translation failed: %s", exc)
        raise HTTPException(503, f"Translation unavailable: {exc}")