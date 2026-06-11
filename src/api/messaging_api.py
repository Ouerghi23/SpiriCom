"""
src/api/messaging_api.py
========================
SpiriComp — Internal messaging system between Admin and NOC Engineers.

DB table: messages
  id          INTEGER PK AUTOINCREMENT
  from_user   TEXT    NOT NULL   — sender username
  to_user     TEXT    NOT NULL   — recipient username ('all' = broadcast)
  content     TEXT    NOT NULL
  timestamp   TEXT    DEFAULT strftime('%Y-%m-%dT%H:%M:%SZ','now')
  read_by     TEXT    DEFAULT '[]'   — JSON list of usernames who read it
  priority    TEXT    DEFAULT 'normal'  — normal | urgent | info
  msg_type    TEXT    DEFAULT 'direct' — direct | broadcast | system

Endpoints (all require valid JWT):
  GET  /api/messages           — fetch messages for current user (paginated)
  POST /api/messages           — send a message
  PATCH /api/messages/{id}/read — mark message as read
  GET  /api/messages/unread    — count of unread messages for current user
  DELETE /api/messages/{id}    — delete own message (or admin deletes any)
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

# ── DB path — same directory as the NLP/auth database ────────────────────────
MSG_DB_PATH = Path("data/nlp/complaints.db")   # reuse same DB for simplicity


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    """Return a Row-factory connection to the shared SQLite DB."""
    MSG_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(MSG_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # concurrent read/write safe
    return conn


def ensure_messages_table() -> None:
    """Create the messages table if it does not exist yet (idempotent)."""
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
        # Index for fast per-user queries
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_msg_to   ON messages (to_user)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_msg_from ON messages (from_user)"
        )
    logger.info("messages table ready")


# Call once at import time so the table exists before any endpoint runs
ensure_messages_table()


# ── Dependency: require authenticated user ────────────────────────────────────
# We import require_current_user from auth_api (already wired in analytics_api).
# This gives us the decoded JWT payload as a dict: {username, role, ...}.

def _get_current_user():
    """
    Lazy import to avoid circular dependencies.
    auth_api.py defines require_current_user (the JWT dependency).
    """
    try:
        from src.nlp.auth_api import require_current_user
        return require_current_user
    except ImportError:
        try:
            from src.api.auth_api import require_current_user
            return require_current_user
        except ImportError:
            # Fallback: no auth (dev mode)
            async def _noop():
                return {"username": "dev", "role": "engineer"}
            return _noop


# ── Pydantic models ───────────────────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    to_user:  str                        # recipient username or 'all'
    content:  str
    priority: str = "normal"            # normal | urgent | info
    msg_type: str = "direct"            # direct | broadcast


class MessageOut(BaseModel):
    id:        int
    from_user: str
    to_user:   str
    content:   str
    timestamp: str
    read_by:   list[str]
    priority:  str
    msg_type:  str
    is_read:   bool                      # True if current user is in read_by


# ── Router ────────────────────────────────────────────────────────────────────

msg_router = APIRouter(prefix="/api/messages", tags=["Messaging"])


def _row_to_out(row: sqlite3.Row, current_username: str) -> dict:
    """Convert a DB row to a serialisable dict with is_read computed."""
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
    limit:  int = 50,
    offset: int = 0,
    current_user: dict = Depends(_get_current_user()),
):
    """
    Return messages visible to the current user:
    - Messages sent TO me (to_user = my username)
    - Broadcast messages (to_user = 'all')
    - Messages I SENT (from_user = my username)
    Sorted newest-first.
    """
    me = current_user["username"]

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT * FROM messages
            WHERE  to_user   = ?
               OR  to_user   = 'all'
               OR  from_user = ?
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (me, me, limit, offset),
        ).fetchall()

        total = conn.execute(
            """
            SELECT COUNT(*) FROM messages
            WHERE  to_user   = ?
               OR  to_user   = 'all'
               OR  from_user = ?
            """,
            (me, me),
        ).fetchone()[0]

    return {
        "total":    total,
        "messages": [_row_to_out(r, me) for r in rows],
    }


@msg_router.get("/unread")
def unread_count(current_user: dict = Depends(_get_current_user())):
    """Return the number of unread messages for the current user."""
    me = current_user["username"]

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT read_by FROM messages
            WHERE (to_user = ? OR to_user = 'all')
              AND from_user != ?
            """,
            (me, me),
        ).fetchall()

    # Count rows where `me` is NOT in read_by
    unread = sum(
        1 for r in rows
        if me not in json.loads(r["read_by"] or "[]")
    )
    return {"unread": unread}


@msg_router.post("")
def send_message(
    body: SendMessageRequest,
    current_user: dict = Depends(_get_current_user()),
):
    """
    Send a message.
    - Engineers can message 'admin' or broadcast to 'all'.
    - Admins can message any user or broadcast.
    Content must not be empty.
    """
    me      = current_user["username"]
    role    = current_user.get("role", "engineer").lower()
    content = body.content.strip()

    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")

    # Engineers can only message admins or broadcast
    if role != "admin" and body.to_user not in ("admin", "all"):
        raise HTTPException(
            status_code=403,
            detail="Engineers can only message 'admin' or broadcast to 'all'"
        )

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO messages (from_user, to_user, content, priority, msg_type)
            VALUES (?, ?, ?, ?, ?)
            """,
            (me, body.to_user, content, body.priority, body.msg_type),
        )
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    logger.info(
        "Message sent: %s → %s  (id=%d, priority=%s)",
        me, body.to_user, new_id, body.priority,
    )
    return {"id": new_id, "message": "Message sent"}


@msg_router.patch("/{msg_id}/read")
def mark_read(
    msg_id: int,
    current_user: dict = Depends(_get_current_user()),
):
    """Mark a specific message as read by the current user."""
    me = current_user["username"]

    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM messages WHERE id = ?", (msg_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Message not found")

        read_by = json.loads(row["read_by"] or "[]")
        if me not in read_by:
            read_by.append(me)
            conn.execute(
                "UPDATE messages SET read_by = ? WHERE id = ?",
                (json.dumps(read_by), msg_id),
            )

    return {"message": "Marked as read", "read_by": read_by}


@msg_router.patch("/read-all")
def mark_all_read(current_user: dict = Depends(_get_current_user())):
    """Mark all messages addressed to the current user as read."""
    me = current_user["username"]

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
                conn.execute(
                    "UPDATE messages SET read_by = ? WHERE id = ?",
                    (json.dumps(read_by), row["id"]),
                )
                updated += 1

    return {"message": f"Marked {updated} messages as read"}


@msg_router.delete("/{msg_id}")
def delete_message(
    msg_id: int,
    current_user: dict = Depends(_get_current_user()),
):
    """
    Delete a message.
    - Owner can delete their own messages.
    - Admin can delete any message.
    """
    me   = current_user["username"]
    role = current_user.get("role", "engineer").lower()

    with get_conn() as conn:
        row = conn.execute(
            "SELECT from_user FROM messages WHERE id = ?", (msg_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Message not found")
        if role != "admin" and row["from_user"] != me:
            raise HTTPException(status_code=403, detail="Cannot delete someone else's message")

        conn.execute("DELETE FROM messages WHERE id = ?", (msg_id,))

    return {"message": "Message deleted"}