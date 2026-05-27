"""
src/api/auth_api.py
===================
Modular JWT authentication for Huawei SpiriCom NOC Dashboard.

Changes from original (src/nlp/auth_api.py):
  - Moved to src/api/ (correct location)
  - init_db() no longer runs at import time — call it explicitly at app startup
  - datetime.utcnow() replaced with datetime.now(timezone.utc) (Python 3.12 fix)
  - SECRET_KEY loaded from env var SPIRICOMP_SECRET (falls back to dev default)
  - DB_PATH loaded from env var SPIRICOMP_DB_PATH (falls back to data/nlp/auth.db)
"""
from __future__ import annotations

import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel

logger = logging.getLogger("auth_api")

# ── Config ────────────────────────────────────────────────────────────────────
# FIX: SECRET_KEY from env var; never hardcode secrets in source code
SECRET_KEY  = os.getenv("SPIRICOMP_SECRET", "spiricomp-noc-pfe-huawei-2026-dev-only")
ALGORITHM   = "HS256"
TOKEN_HOURS = 8
DB_PATH     = Path(os.getenv("SPIRICOMP_DB_PATH", "data/nlp/auth.db"))

# ── Router ────────────────────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ── Password helpers ──────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Database helpers ──────────────────────────────────────────────────────────
@contextmanager
def get_conn():
    """Context manager that yields a committed-or-rolled-back SQLite connection."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """
    Create the users table and seed default accounts if empty.

    FIX: No longer called at module import time.
    Call this once during FastAPI startup (lifespan handler in analytics_api.py).
    """
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT UNIQUE NOT NULL,
                full_name  TEXT,
                role       TEXT DEFAULT 'engineer',
                hashed_pw  TEXT NOT NULL,
                active     INTEGER DEFAULT 1
            )
        """)
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            seeds = [
                ("admin",        "Admin SpiriComp",    "admin",    "spiricomp2026"),
                ("noc_engineer", "NOC Engineer",        "engineer", "noc123"),
                ("huawei_cn",    "Huawei CN Engineer",  "engineer", "huawei2026"),
            ]
            for uname, fname, role, raw in seeds:
                conn.execute(
                    "INSERT INTO users (username, full_name, role, hashed_pw) VALUES (?,?,?,?)",
                    (uname, fname, role, hash_password(raw)),
                )
            logger.info("Auth DB seeded with %d users", len(seeds))


# ── Business logic helpers ────────────────────────────────────────────────────
def get_user(username: str) -> dict | None:
    """Return an active user dict or None if not found."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ? AND active = 1", (username,)
        ).fetchone()
    return dict(row) if row else None


def make_token(data: dict) -> str:
    """Encode a JWT with an expiry of TOKEN_HOURS from now."""
    # FIX: timezone-aware datetime (replaces deprecated datetime.utcnow())
    payload = {**data, "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """FastAPI dependency: decode JWT and return the user dict."""
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
    user = get_user(username)
    if not user:
        raise exc
    return user


def require_admin(user: dict = Depends(current_user)) -> dict:
    """FastAPI dependency: raises 403 if the user is not an admin."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Pydantic schemas ──────────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    username:     str
    full_name:    str
    role:         str


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.post("/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    """Authenticate and return a JWT bearer token."""
    user = get_user(form.username)
    if not user or not verify_password(form.password, user["hashed_pw"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = make_token({"sub": user["username"], "role": user["role"]})
    logger.info("Login: %s (%s)", user["username"], user["role"])
    return Token(
        access_token=token,
        username=user["username"],
        full_name=user["full_name"] or user["username"],
        role=user["role"],
    )


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    """Return the currently authenticated user's profile."""
    return {
        "username":  user["username"],
        "full_name": user["full_name"],
        "role":      user["role"],
    }


@router.get("/users", dependencies=[Depends(require_admin)])
async def list_users():
    """Admin-only: list all user accounts."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, username, full_name, role, active FROM users"
        ).fetchall()
    return [dict(r) for r in rows]