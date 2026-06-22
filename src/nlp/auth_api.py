"""
src/api/auth_api.py — VERSION CORRIGÉE
"""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import smtplib
import socket
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel
import bcrypt
import psutil
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv
load_dotenv()
# AUTH-1: in-app notification bell (SQLite + SSE) — same module as NLP-1.
# AUTH-1b: import is DEFENSIVE. If notifications_api (or its
# artifact_cache dependency) isn't deployed yet, auth_api must still
# load and /api/auth/login must still work — a missing notification
# system must never take down login.
try:
    from src.api.notification_service import emit_notification
except Exception as _exc:                            # pragma: no cover
    logging.getLogger("auth_api").warning(
        "notifications_api unavailable — notifications disabled: %s", _exc)
    def emit_notification(*args, **kwargs):
        return None
APP_ENV = os.getenv("APP_ENV", "development")   # add this near the top of auth_api.py

logger = logging.getLogger("auth_api")

# ── Router ────────────────────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
router        = APIRouter(prefix="/api/auth", tags=["Auth"])

_db_ready      = False
_db_ready_lock = threading.Lock()
_PROCESS_START = time.time()
RESET_TOKEN_EXPIRE_MINUTES = 30
RESET_AUDIENCE = "spiricomp:password-reset"  
GMAIL_NAME    = os.getenv("GMAIL_NAME", "SpiriCom NOC")

# ADD THESE 5 LINES:
DB_PATH = Path(os.getenv("SPIRICOMP_DB_PATH", "data/nlp/auth.db"))
SECRET_KEY = os.getenv("SPIRICOMP_SECRET", "spiricomp-noc-pfe-huawei-2026-dev-only")
ALGORITHM = "HS256"
TOKEN_HOURS = 24
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # If you need this too
# ── Pydantic schemas ──────────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    username:     str
    full_name:    str
    role:         str


class RegisterRequest(BaseModel):
    username:  str
    full_name: str
    password:  str
    email:     Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: str
 
class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str

# ═══════════════════════════════════════════════════════════════════════════════
# FIX BUG-3: hash_password simplifié et robuste
# ═══════════════════════════════════════════════════════════════════════════════
def hash_password(plain: str) -> str:
    """Hash un mot de passe avec bcrypt. Retourne toujours une string."""
    hashed_bytes = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt())
    return hashed_bytes.decode("utf-8")


# ═══════════════════════════════════════════════════════════════════════════════
# FIX BUG-1 & BUG-2: verify_password sécurisé, sans backdoor
# ═══════════════════════════════════════════════════════════════════════════════
def verify_password(plain: str, hashed: str) -> bool:
    """
    Vérifie un mot de passe bcrypt de manière sécurisée.
    AUCUN fallback — si le hash est invalide, retourne False.
    """
    try:
        plain_b = plain.encode("utf-8")
        hashed_b = hashed.encode("utf-8") if isinstance(hashed, str) else hashed

        # FIX BUG-2: Validation stricte des prefixes bcrypt valides
        valid_prefixes = (b'$2a$', b'$2b$', b'$2x$', b'$2y$')
        if not any(hashed_b.startswith(p) for p in valid_prefixes):
            logger.error(f"Hash bcrypt invalide (format incorrect): {hashed_b[:30]}...")
            return False

        return bcrypt.checkpw(plain_b, hashed_b)

    except ValueError as e:
        logger.error(f"Erreur bcrypt ValueError: {e}")
        return False
    except Exception as e:
        logger.error(f"Erreur inattendue verify_password: {type(e).__name__}: {e}")
        return False


# ── Database helpers ──────────────────────────────────────────────────────────
@contextmanager
def get_conn():
    _ensure_db()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _ensure_db() -> None:
    global _db_ready
    if _db_ready:
        return
    with _db_ready_lock:
        if _db_ready:
            return
        init_db()
        _db_ready = True


def init_db() -> None:
    """Create tables and seed default accounts if the DB is empty."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT UNIQUE NOT NULL,
                full_name  TEXT,
                email      TEXT UNIQUE,
                role       TEXT DEFAULT 'engineer',
                hashed_pw  TEXT NOT NULL,
                active     INTEGER DEFAULT 1
            )
        """)
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            seeds = [
                ("admin",        "Admin SpiriComp",   "admin",    "spiricomp2026"),
                ("noc_engineer", "NOC Engineer",       "engineer", "noc123"),
                ("huawei_cn",    "Huawei CN Engineer", "engineer", "huawei2026"),
                ("viewer_demo",  "Huawei Supervisor",  "viewer",   "viewer2026"),

                
            ]
            for uname, fname, role, raw in seeds:
                conn.execute(
                    "INSERT INTO users (username, full_name, role, hashed_pw) VALUES (?,?,?,?)",
                    (uname, fname, role, hash_password(raw)),
                )
            logger.info("Auth DB seeded with %d users", len(seeds))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Business-logic helpers ────────────────────────────────────────────────────
def get_user(username: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ? AND active = 1", (username,)
        ).fetchone()
    return dict(row) if row else None


def create_token(data: dict, expires_hours: float = TOKEN_HOURS) -> str:
    if expires_hours <= 0:
        raise ValueError("expires_hours must be positive")
    payload = {
        **data,
        "exp": datetime.now(timezone.utc) + timedelta(hours=expires_hours),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def current_user(token: str = Depends(oauth2_scheme)) -> dict:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        data     = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = data.get("sub")
        if not username:
            raise exc
    except JWTError:
        raise exc

    # ── Guest / viewer token — pas de ligne en DB ─────────────────────
    if data.get("role") == "viewer" and username == "guest":
        return {
            "id":        0,
            "username":  "guest",
            "full_name": "Guest User",
            "role":      "viewer",
            "active":    1,
        }
    # ─────────────────────────────────────────────────────────────────

    user = get_user(username)
    if not user:
        raise exc
    return user

def require_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def require_engineer(user: dict = Depends(current_user)) -> dict:
    """
    Allow access for NOC engineers AND admins.
    Blocks viewers (read-only accounts for Huawei supervisors, auditors).
    """
    if user["role"] not in ("admin", "engineer"):
        raise HTTPException(
            status_code=403,
            detail="Engineer or Admin access required — Viewer accounts are read-only."
        )
    return user
# ── Column migration helpers ──────────────────────────────────────────────────
def _ensure_email_column(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "email" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email "
            "ON users (email) WHERE email IS NOT NULL"
        )


def _ensure_email_and_active(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "email" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email "
            "ON users (email) WHERE email IS NOT NULL"
        )
    if "active"       not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1")
    if "shift_start"  not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN shift_start  TEXT DEFAULT NULL")
    if "shift_end"    not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN shift_end    TEXT DEFAULT NULL")
    if "is_on_shift"  not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN is_on_shift  INTEGER NOT NULL DEFAULT 0")
    if "last_checkin" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN last_checkin TEXT DEFAULT NULL")
    if "hours_today"  not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN hours_today  REAL NOT NULL DEFAULT 0.0")
    if "hours_week"   not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN hours_week   REAL NOT NULL DEFAULT 0.0")


def _check_registration_conflicts(username: str, email: Optional[str]) -> None:
    with get_conn() as conn:
        _ensure_email_column(conn)
        if conn.execute(
            "SELECT 1 FROM users WHERE username = ?", (username,)
        ).fetchone():
            raise HTTPException(status_code=400, detail="Nom d'utilisateur déjà pris")
        if email and conn.execute(
            "SELECT 1 FROM users WHERE email = ? AND email IS NOT NULL", (email,)
        ).fetchone():
            raise HTTPException(status_code=400, detail="Email déjà utilisé")


# ── Audit log ─────────────────────────────────────────────────────────────────
def _ensure_audit_log(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            actor       TEXT    NOT NULL,
            action      TEXT    NOT NULL,
            target_user TEXT,
            ip          TEXT,
            status      TEXT    NOT NULL DEFAULT 'success',
            detail      TEXT
        )
    """)


def log_action(actor: str, action: str, target_user: str | None,
               ip: str | None, status: str = "success",
               detail: str | None = None) -> None:
    try:
        with get_conn() as conn:
            _ensure_audit_log(conn)
            conn.execute(
                "INSERT INTO audit_log (actor, action, target_user, ip, status, detail) "
                "VALUES (?,?,?,?,?,?)",
                (actor, action, target_user, ip, status, detail),
            )
    except Exception as exc:
        logger.warning("log_action failed: %s", exc)


def client_ip(request: Request) -> str:
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

# ── STEP 3: Replace send_reset_email() with this entire function ──────
async def send_reset_email(to_email: str, reset_url: str) -> bool:

    # ✅ FIX-2 : lire os.getenv() ICI (à l'appel), pas au niveau module
    gmail_user    = os.getenv("GMAIL_USER",    "")
    gmail_apppass = os.getenv("GMAIL_APPPASS", "")
    gmail_name    = os.getenv("GMAIL_NAME",    "SpiriCom NOC")

    # Debug — tu verras les vraies valeurs dans les logs
    logger.info("SMTP: user=%r pass_len=%d", gmail_user, len(gmail_apppass))

    if not gmail_user or not gmail_apppass:
        logger.warning("GMAIL_USER / GMAIL_APPPASS not set — skipping email")
        return False

    plain = (
        f"SpiriCom NOC — Password Reset\n{'='*40}\n\n"
        f"Reset your password (expires in {RESET_TOKEN_EXPIRE_MINUTES} min):\n\n"
        f"  {reset_url}\n\n"
        f"— SpiriCom NOC · Huawei Technologies Tunisia · PFE 2026"
    )

    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a;padding:48px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" border="0"
  style="background:#1e293b;border-radius:8px;overflow:hidden;max-width:480px;width:100%;">
  <tr><td style="height:4px;background:linear-gradient(90deg,#CF0A2C,rgba(207,10,44,.4),transparent);"/></tr>
  <tr><td style="background:linear-gradient(135deg,#CF0A2C,#001F3F);padding:26px 32px;text-align:center;">
    <div style="font-size:22px;font-weight:900;color:#fff;">
      Spiri<span style="color:#FF8099;">Com</span>
      <span style="font-weight:300;font-size:15px;opacity:.65;margin-left:6px;">NOC</span>
    </div>
    <div style="font-size:9px;color:rgba(255,255,255,.45);letter-spacing:4px;margin-top:5px;text-transform:uppercase;">
      Huawei Technologies Tunisia
    </div>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="color:#f1f5f9;font-size:22px;font-weight:800;margin:0 0 14px;">Reset your password</h2>
    <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 26px;">
      You requested a password reset for your <strong style="color:#f1f5f9;">SpiriCom NOC</strong> account.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:26px;">
      <tr><td style="background:linear-gradient(135deg,#D90B2E,#CF0A2C);border-radius:4px;">
        <a href="{reset_url}" target="_blank"
          style="display:inline-block;padding:14px 36px;color:#fff;text-decoration:none;
            font-weight:800;font-size:12px;letter-spacing:1.8px;text-transform:uppercase;">
          Reset Password &rarr;
        </a>
      </td></tr>
    </table>
    <div style="background:rgba(245,158,11,.08);border-left:3px solid #F59E0B;padding:10px 14px;margin-bottom:22px;">
      <span style="font-size:12px;color:#FCD34D;">
        Expires in <strong>{RESET_TOKEN_EXPIRE_MINUTES} minutes</strong>.
      </span>
    </div>
    <p style="font-size:11px;color:#475569;margin:0;">
      Or copy this URL:<br/>
      <a href="{reset_url}" style="color:#CF0A2C;word-break:break-all;font-size:10px;">{reset_url}</a>
    </p>
  </td></tr>
  <tr><td style="padding:12px 32px 18px;background:#0f172a;">
    <p style="font-size:10px;color:rgba(255,255,255,.2);margin:0;text-align:center;">
      &copy; 2026 SpiriCom &middot; Huawei Technologies Tunisia &middot; Ouerghi Chaima
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>"""

    def _send_sync() -> bool:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"]    = "SpiriCom NOC — Reset your password"
            msg["From"]       = f"{gmail_name} <{gmail_user}>"
            msg["To"]         = to_email
            msg["X-Priority"] = "1"
            msg.attach(MIMEText(plain, "plain", "utf-8"))
            msg.attach(MIMEText(html,  "html",  "utf-8"))

            with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                smtp.login(gmail_user, gmail_apppass)
                smtp.sendmail(gmail_user, [to_email], msg.as_string())

            logger.info("✅ Reset email sent to %s", to_email)
            return True

        except smtplib.SMTPAuthenticationError:
            logger.error("❌ Gmail auth failed — check GMAIL_APPPASS in .env")
            return False
        except Exception as exc:
            logger.error("❌ SMTP failed to %s: %s", to_email, exc)
            return False

    return await asyncio.to_thread(_send_sync)
 
 
# ═════════════════════════════════════════════════════════════════════════════
# AUTH ROUTER  /api/auth/*
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    user = get_user(form.username)
    if not user or not verify_password(form.password, user["hashed_pw"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_token({"sub": user["username"], "role": user["role"]})
    logger.info("Login: %s (%s)", user["username"], user["role"])
    return Token(
        access_token=token,
        username=user["username"],
        full_name=user["full_name"] or user["username"],
        role=user["role"],
    )


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        row = conn.execute(
            "SELECT shift_start, shift_end, is_on_shift, last_checkin, "
            "hours_today, hours_week FROM users WHERE username=?",
            (user["username"],),
        ).fetchone()
    return {
        "username":    user["username"],
        "full_name":   user["full_name"],
        "role":        user["role"],
        "shift_start":  row["shift_start"]       if row else None,
        "shift_end":    row["shift_end"]         if row else None,
        "is_on_shift":  bool(row["is_on_shift"]) if row else False,
        "last_checkin": row["last_checkin"]      if row else None,
        "hours_today":  row["hours_today"]       if row else 0.0,
        "hours_week":   row["hours_week"]        if row else 0.0,
    }


@router.post("/guest")
def guest_login():
    token = create_token(
        {"sub": "guest", "role": "viewer", "username": "guest"},
        expires_hours=1,
    )
    return {
        "access_token": token,
        "token_type":   "bearer",
        "username":     "guest",
        "full_name":    "Guest User",
        "role":         "viewer",
    }


@router.post("/register")
def register(body: RegisterRequest):
    _check_registration_conflicts(body.username.strip(), body.email)
    username  = body.username.strip()
    full_name = body.full_name.strip()
    email     = body.email.strip() if body.email else None
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Le nom d'utilisateur doit contenir au moins 3 caractères")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères")
    hashed = hash_password(body.password)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO users (username, full_name, email, role, hashed_pw) VALUES (?,?,?,?,?)",
            (username, full_name, email, "engineer", hashed),
        )
    token = create_token({"sub": username, "role": "engineer"}, expires_hours=TOKEN_HOURS)
    logger.info("Register: new user '%s'", username)
    # AUTH-4: self-registration always creates role='engineer' — notify
    # admins (spec: "A new NOC engineer is added to the system").
    emit_notification(
        "admin", "new_engineer", f"New engineer account: {username}",
        "Self-registered", "normal",
        {"user": username, "url": "/admin/users"},
    )
    return {
        "access_token": token,
        "token_type":   "bearer",
        "username":     username,
        "full_name":    full_name,
        "role":         "engineer",
    }
# ─────────────────────────────────────────────────────────────────────
# LP-RESET-1:  POST /api/auth/forgot-password  (FIXED — uses get_conn)
# ─────────────────────────────────────────────────────────────────────
@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    email = req.email.strip().lower()

    with get_conn() as conn:
        _ensure_email_column(conn)

        row = conn.execute(
            """
            SELECT id, email
            FROM users
            WHERE LOWER(email) = LOWER(?)
              AND active = 1
              AND email IS NOT NULL
            """,
            (email,),
        ).fetchone()

    GENERIC_OK = {
        "message": "If that email is registered, a reset link has been sent."
    }

    # 🔴 Always return success (security best practice)
    if not row:
        logger.warning(f"[FORGOT PASSWORD] email not found: {email}")
        return GENERIC_OK

    # 🔐 create reset token
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=RESET_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(row["id"]),
        "email": row["email"],
        "exp": expire,
        "aud": RESET_AUDIENCE,
    }

    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    reset_url = (
        f"{os.getenv('FRONTEND_URL','http://localhost:3000')}"
        f"/reset-password?token={token}"
    )


    sent = await send_reset_email(
        to_email=row["email"],
        reset_url=reset_url
    )

    # 🔴 production strict mode
    if not sent and APP_ENV == "production":
        raise HTTPException(
            status_code=503,
            detail="Email delivery failed — please try again later.",
        )

    # 🟡 dev mode (debug only)
    if APP_ENV != "production":
        return {
            **GENERIC_OK,
            "dev_reset_url": reset_url
        }

    return GENERIC_OK
# ─────────────────────────────────────────────────────────────────────
# LP-RESET-3:  POST /api/auth/reset-password  (FIXED — uses get_conn)
# ─────────────────────────────────────────────────────────────────────
@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    if len(req.new_password) < 8:
        raise HTTPException(status_code=422, detail="PASSWORD_TOO_SHORT")

    try:
        payload = jwt.decode(
            req.token, SECRET_KEY, algorithms=[ALGORITHM],
            audience=RESET_AUDIENCE,
        )
    except JWTError as exc:
        detail = "TOKEN_EXPIRED" if "expired" in str(exc).lower() else "TOKEN_INVALID"
        raise HTTPException(status_code=400, detail=detail)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="TOKEN_INVALID")

    hashed = hash_password(req.new_password)

    with get_conn() as conn:    # ← utilise get_conn(), pas db: Session
        row = conn.execute(
            "SELECT id FROM users WHERE id = ? AND active = 1",
            (int(user_id),),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="USER_NOT_FOUND")

        conn.execute(
            "UPDATE users SET hashed_pw = ? WHERE id = ?",
            (hashed, int(user_id)),
        )

    return {"message": "Password updated successfully."}

@router.get("/users", dependencies=[Depends(require_admin)])
async def list_users():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, username, full_name, role, active FROM users"
        ).fetchall()
    return [{**dict(r), "active": bool(r["active"])} for r in rows]


# ── BUG-4 FIX: paramètre renommé `caller` ───────────────────────────────────
@router.patch("/shift/checkin")
def self_checkin(caller: dict = Depends(require_engineer)):
    """Engineer checks themselves in."""
    me      = caller["username"]
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        row = conn.execute(
            "SELECT id, is_on_shift FROM users WHERE username=?", (me,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if row["is_on_shift"]:
            return {"message": "Already checked in", "last_checkin": now_iso}
        conn.execute(
            "UPDATE users SET is_on_shift=1, last_checkin=? WHERE username=?",
            (now_iso, me),
        )
    log_action(actor=me, action="self_checkin", target_user=me, ip=None)
    # AUTH-2: notify admins that an engineer started their shift
    emit_notification(
        "admin", "shift_start", f"{me} started shift",
        "NOC engineer on duty", "normal",
        {"user": me, "url": "/admin/users"},
    )
    return {"message": "Checked in", "last_checkin": now_iso}


@router.patch("/shift/checkout")
def self_checkout(caller: dict = Depends(require_engineer)):
    """Engineer checks themselves out and accumulates elapsed hours."""
    me  = caller["username"]
    now = datetime.now(timezone.utc)
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        row = conn.execute(
            "SELECT id, is_on_shift, last_checkin, hours_today, hours_week "
            "FROM users WHERE username=?", (me,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if not row["is_on_shift"]:
            return {"message": "Not currently on shift"}
        extra_hours = 0.0
        if row["last_checkin"]:
            try:
                checkin_dt = datetime.fromisoformat(row["last_checkin"])
                if checkin_dt.tzinfo is None:
                    checkin_dt = checkin_dt.replace(tzinfo=timezone.utc)
                extra_hours = round(max(0.0, (now - checkin_dt).total_seconds() / 3600), 2)
            except Exception:
                pass
        new_today = round((row["hours_today"] or 0.0) + extra_hours, 2)
        new_week  = round((row["hours_week"]  or 0.0) + extra_hours, 2)
        conn.execute(
            "UPDATE users SET is_on_shift=0, last_checkin=NULL, "
            "hours_today=?, hours_week=? WHERE username=?",
            (new_today, new_week, me),
        )
    log_action(actor=me, action="self_checkout", target_user=me, ip=None,
               detail=f"+{extra_hours}h today:{new_today}h")
    # AUTH-3: notify admins that an engineer ended their shift
    emit_notification(
        "admin", "shift_end", f"{me} ended shift",
        f"+{extra_hours}h logged · today {new_today}h · week {new_week}h",
        "info", {"user": me, "url": "/admin/users"},
    )
    return {
        "message":     "Checked out",
        "hours_added": extra_hours,
        "hours_today": new_today,
        "hours_week":  new_week,
    }


# ═════════════════════════════════════════════════════════════════════════════
# ADMIN ROUTER  /api/admin/*
# ═════════════════════════════════════════════════════════════════════════════

admin_router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ── Pydantic schemas — Admin ──────────────────────────────────────────────────
class CreateUserRequest(BaseModel):
    username:  str
    full_name: str
    password:  str
    email:     Optional[str] = None
    role:      str = "engineer"


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email:     Optional[str] = None
    role:      Optional[str] = None
    active:    Optional[bool] = None
    password:  Optional[str] = None


class LogEntry(BaseModel):
    action:      str
    target_user: Optional[str] = None
    status:      str = "success"
    detail:      Optional[str] = None


class ShiftUpdate(BaseModel):
    shift_start: Optional[str] = None
    shift_end:   Optional[str] = None


# ── Admin — User CRUD ─────────────────────────────────────────────────────────
@admin_router.get("/users", dependencies=[Depends(require_admin)])
def admin_list_users():
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        rows = conn.execute(
            "SELECT id, username, full_name, email, role, active, "
            "shift_start, shift_end, is_on_shift, last_checkin, "
            "hours_today, hours_week FROM users ORDER BY id"
        ).fetchall()
    return [
        {
            "id":          r["id"],
            "username":    r["username"],
            "full_name":   r["full_name"] or "",
            "email":       r["email"] or "",
            "role":        r["role"],
            "active":      bool(r["active"]),
            "shift_start":  r["shift_start"],
            "shift_end":    r["shift_end"],
            "is_on_shift":  bool(r["is_on_shift"]),
            "last_checkin": r["last_checkin"],
            "hours_today":  r["hours_today"] or 0.0,
            "hours_week":   r["hours_week"]  or 0.0,
        }
        for r in rows
    ]


@admin_router.post("/users", dependencies=[Depends(require_admin)])
def admin_create_user(body: CreateUserRequest, request: Request,
                      admin: dict = Depends(require_admin)):
    username  = body.username.strip()
    full_name = body.full_name.strip()
    email     = body.email.strip() if body.email else None
    role      = body.role.lower()
    if role not in ("admin", "engineer", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role. Choose: admin | engineer | viewer")
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        if conn.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            raise HTTPException(status_code=400, detail=f"Username '{username}' already exists")
        if email and conn.execute(
            "SELECT 1 FROM users WHERE email=? AND email IS NOT NULL", (email,)
        ).fetchone():
            raise HTTPException(status_code=400, detail="Email already in use")
    hashed = hash_password(body.password)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO users (username, full_name, email, role, hashed_pw, active) VALUES (?,?,?,?,?,1)",
            (username, full_name, email, role, hashed),
        )
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    log_action(admin["username"], "create_user", username,
               client_ip(request), "success", f"role={role}")
    logger.info("Admin '%s' created user '%s' (role=%s)", admin["username"], username, role)
    # AUTH-5: notify admins when a new NOC engineer account is created
    if role == "engineer":
        emit_notification(
            "admin", "new_engineer", f"New engineer account: {username}",
            f"Created by {admin['username']}", "normal",
            {"user": username, "url": "/admin/users"},
        )
    return {"id": new_id, "username": username, "full_name": full_name,
            "email": email or "", "role": role, "active": True}


@admin_router.patch("/users/{user_id}", dependencies=[Depends(require_admin)])
def admin_update_user(user_id: int, body: UpdateUserRequest, request: Request,
                      admin: dict = Depends(require_admin)):
    changes, params = [], []
    if body.full_name is not None:
        changes.append("full_name=?"); params.append(body.full_name.strip())
    if body.email is not None:
        changes.append("email=?"); params.append(body.email.strip() or None)
    if body.role is not None:
        r = body.role.lower()
        if r not in ("admin", "engineer", "viewer"):
            raise HTTPException(status_code=400, detail="Invalid role")
        changes.append("role=?"); params.append(r)
    if body.active is not None:
        changes.append("active=?"); params.append(1 if body.active else 0)
    if body.password is not None:
        if len(body.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        changes.append("hashed_pw=?"); params.append(hash_password(body.password))
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")
    params.append(user_id)
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        row = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        target_username = row["username"]
        updated = conn.execute(
            f"UPDATE users SET {', '.join(changes)} WHERE id=?", params
        ).rowcount
    if updated == 0:
        raise HTTPException(status_code=404, detail="User not found")
    log_action(admin["username"], "update_user", target_username,
               client_ip(request), "success", str(body.dict(exclude_none=True)))
    with get_conn() as conn:
        r = conn.execute(
            "SELECT id, username, full_name, email, role, active FROM users WHERE id=?",
            (user_id,)
        ).fetchone()
    return {**dict(r), "active": bool(r["active"]), "email": r["email"] or ""}


# APRÈS — supprime vraiment
# APRÈS — version correcte, même emplacement
@admin_router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    request: Request,
    admin: dict = Depends(require_admin),
):
    """Hard delete — supprime définitivement l'utilisateur de la DB."""
    with get_conn() as conn:
        _ensure_email_and_active(conn)

        # 1. Vérifier que l'user existe
        row = conn.execute(
            "SELECT id, username, role FROM users WHERE id=?", (user_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        # 2. Empêche de supprimer son propre compte
        if row["id"] == admin["id"]:
            raise HTTPException(
                status_code=400, detail="Cannot delete your own account"
            )

        # 3. Empêche de supprimer le dernier admin
        if row["role"] == "admin":
            n_admins = conn.execute(
                "SELECT COUNT(*) FROM users WHERE role='admin' AND active=1"
            ).fetchone()[0]
            if n_admins <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete the last admin account"
                )

        # 4. Suppression définitive
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        # get_conn() auto-commit à la sortie du with

    log_action(
        actor=admin["username"],
        action="delete_user",
        target_user=row["username"],
        ip=client_ip(request),
        status="success",
        detail=f"Hard delete user #{user_id} ({row['username']}) role={row['role']}",
    )
    logger.info(
        "Admin '%s' permanently deleted user '%s' (#%d)",
        admin["username"], row["username"], user_id,
    )

    return {
        "ok":       True,
        "deleted":  user_id,
        "username": row["username"],
    }

# ── Admin — Audit Logs ────────────────────────────────────────────────────────
@admin_router.get("/logs", dependencies=[Depends(require_admin)])
def admin_get_logs(limit: int = 200, offset: int = 0,
                   action: Optional[str] = None, status: Optional[str] = None,
                   actor: Optional[str] = None):
    conditions, params = [], []
    if action and action != "All":
        conditions.append("action=?"); params.append(action)
    if status and status != "All":
        conditions.append("status=?"); params.append(status)
    if actor and actor != "All":
        conditions.append("actor=?"); params.append(actor)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with get_conn() as conn:
        _ensure_audit_log(conn)
        total = conn.execute(f"SELECT COUNT(*) FROM audit_log {where}", params).fetchone()[0]
        rows  = conn.execute(
            f"SELECT * FROM audit_log {where} ORDER BY id DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()
    return {
        "total": total,
        "logs": [
            {
                "id":        r["id"],
                "timestamp": r["timestamp"],
                "user":      r["actor"],
                "action":    r["action"],
                "target":    r["target_user"] or "",
                "ip":        r["ip"] or "—",
                "status":    r["status"],
                "detail":    r["detail"] or "",
            }
            for r in rows
        ],
    }


@admin_router.post("/logs", dependencies=[Depends(require_admin)])
def admin_write_log(body: LogEntry, request: Request,
                    admin: dict = Depends(require_admin)):
    log_action(admin["username"], body.action, body.target_user,
               client_ip(request), body.status, body.detail)
    return {"message": "Logged"}


# ── Admin — System Health ─────────────────────────────────────────────────────
@admin_router.get("/system", dependencies=[Depends(require_admin)])
async def admin_system_health():
    uptime_s   = int(time.time() - _PROCESS_START)
    h, rem     = divmod(uptime_s, 3600)
    m, s       = divmod(rem, 60)
    uptime_str = f"{h}h {m}m {s}s"
    db_ok = user_count = log_count = db_size_kb = 0
    try:
        with get_conn() as conn:
            _ensure_audit_log(conn)
            user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            log_count  = conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
            db_ok      = True
        if DB_PATH.exists():
            db_size_kb = round(DB_PATH.stat().st_size / 1024, 1)
    except Exception as exc:
        logger.warning("system health DB check failed: %s", exc)
    cpu_pct = ram_mb = 0.0
    try:
        proc    = psutil.Process()
        cpu_pct = round(proc.cpu_percent(interval=0.1), 1)
        ram_mb  = round(proc.memory_info().rss / 1_048_576, 1)
    except Exception:
        pass

    # AUTH-6: services reflects REAL artifact-based checks across the v6
    # pipeline routers — was hardcoded {"auth_api": True, "nlp_api": True}
    # (always green) and was MISSING "analytics_api", the key
    # MonitorSystem.jsx reads (the long-flagged MS-2 issue).
    services = {
        "auth_api":          db_ok,
        "analytics_api":     Path("data/processed/complaints_clean.parquet").exists(),
        "nlp_api":           Path("data/nlp/complaints.db").exists(),
        "notifications_api": Path("data/nlp/notifications.db").exists(),
        "disengagement_api": Path("models/disengagement_model_v6_calibrated.joblib").exists(),
        "coverage_api":      Path("data/outputs/coverage_5g.json").exists(),
        "ai_api":            Path("data/ai_config.json").exists(),
    }

    status_label = "healthy" if db_ok else "degraded"
    if not db_ok:
        # Real downtime — notify admins (spec: "system error or downtime"),
        # deduplicated so it doesn't spam on every MonitorSystem refresh.
        emit_notification(
            "admin", "system_error", "Auth database unreachable",
            "admin_system_health failed the database check",
            "critical", {"url": "/admin/system"},
            dedup_key="system_health_db_down",
        )

    return {
        "status":   status_label,
        "uptime":   uptime_str,
        "uptime_s": uptime_s,
        "database": {"ok": db_ok, "path": str(DB_PATH),
                     "size_kb": db_size_kb, "users": user_count, "logs": log_count},
        "process":  {"cpu_pct": cpu_pct, "ram_mb": ram_mb},
        "host":     {"hostname": socket.gethostname(),
                     "platform": platform.system(),
                     "python":   platform.python_version()},
        "services": services,
    }


# ── Admin — Shift management ──────────────────────────────────────────────────
@admin_router.patch("/users/{user_id}/shift")
def update_shift_schedule(user_id: int, body: ShiftUpdate,
                          current_caller: dict = Depends(require_admin)):
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        if not conn.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone():
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            "UPDATE users SET shift_start=?, shift_end=? WHERE id=?",
            (body.shift_start, body.shift_end, user_id),
        )
    log_action(actor=current_caller["username"], action="update_shift",
               target_user=str(user_id), ip=None,
               detail=f"shift {body.shift_start}–{body.shift_end}")
    return {"message": "Shift schedule updated"}


@admin_router.patch("/users/{user_id}/checkin")
def admin_force_checkin(user_id: int, current_caller: dict = Depends(require_admin)):
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        row = conn.execute("SELECT id, username FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            "UPDATE users SET is_on_shift=1, last_checkin=? WHERE id=?",
            (now_iso, user_id),
        )
    log_action(actor=current_caller["username"], action="force_checkin",
               target_user=row["username"], ip=None)
    return {"message": "Engineer checked in", "last_checkin": now_iso}


@admin_router.patch("/users/{user_id}/checkout")
def admin_force_checkout(user_id: int, current_caller: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        row = conn.execute(
            "SELECT id, username, last_checkin, hours_today, hours_week FROM users WHERE id=?",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        extra_hours = 0.0
        if row["last_checkin"]:
            try:
                checkin_dt = datetime.fromisoformat(row["last_checkin"])
                if checkin_dt.tzinfo is None:
                    checkin_dt = checkin_dt.replace(tzinfo=timezone.utc)
                extra_hours = round(max(0.0, (now - checkin_dt).total_seconds() / 3600), 2)
            except Exception:
                pass
        new_today = round((row["hours_today"] or 0.0) + extra_hours, 2)
        new_week  = round((row["hours_week"]  or 0.0) + extra_hours, 2)
        conn.execute(
            "UPDATE users SET is_on_shift=0, last_checkin=NULL, "
            "hours_today=?, hours_week=? WHERE id=?",
            (new_today, new_week, user_id),
        )
    log_action(actor=current_caller["username"], action="force_checkout",
               target_user=row["username"], ip=None,
               detail=f"+{extra_hours}h → today:{new_today}h week:{new_week}h")
    return {"message": "Engineer checked out",
            "hours_added": extra_hours, "hours_today": new_today, "hours_week": new_week}


@admin_router.patch("/users/{user_id}/reset-hours")
def reset_hours(user_id: int, current_caller: dict = Depends(require_admin)):
    with get_conn() as conn:
        _ensure_email_and_active(conn)
        row = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute("UPDATE users SET hours_today=0.0, hours_week=0.0 WHERE id=?", (user_id,))
    log_action(actor=current_caller["username"], action="reset_hours",
               target_user=row["username"], ip=None)
    return {"message": "Hours reset to 0"}