"""
complaint_db.py
================
SQLite database manager for Ooredoo NLP complaint storage.

Schema:
  complaints (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id    TEXT UNIQUE,
    submitted_at    TEXT,
    msisdn          TEXT,
    city_input      TEXT,     -- city typed by user
    segment         TEXT,
    channel         TEXT,     -- web / app / social / call_center
    text_original   TEXT,     -- raw complaint as typed
    language        TEXT,     -- ar / fr / en
    nlp_category    TEXT,
    nlp_sentiment   TEXT,
    nlp_urgency_score REAL,
    nlp_urgency_level TEXT,
    nlp_city        TEXT,     -- city extracted by NLP
    nlp_network_type TEXT,
    nlp_keywords    TEXT,     -- JSON list
    status          TEXT      -- open / in_progress / resolved
  )

Usage:
    from src.nlp.complaint_db import ComplaintDB
    db = ComplaintDB()
    db.insert(complaint_dict)
    df = db.to_dataframe()
"""

from __future__ import annotations

import sqlite3
import json
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager

import pandas as pd
from loguru import logger

DB_PATH = Path("data/nlp/complaints.db")


class ComplaintDB:

    def __init__(self, db_path: str | Path = DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    # ── Context manager ────────────────────────────────────────────────────
    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ── Schema ─────────────────────────────────────────────────────────────
    def _init_schema(self):
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS complaints (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    complaint_id        TEXT UNIQUE,
                    submitted_at        TEXT NOT NULL,
                    msisdn              TEXT,
                    city_input          TEXT,
                    segment             TEXT,
                    channel             TEXT DEFAULT 'web',
                    text_original       TEXT NOT NULL,
                    language            TEXT,
                    nlp_category        TEXT,
                    nlp_sentiment       TEXT,
                    nlp_urgency_score   REAL,
                    nlp_urgency_level   TEXT,
                    nlp_city            TEXT,
                    nlp_network_type    TEXT,
                    nlp_keywords        TEXT,
                    status              TEXT DEFAULT 'open'
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_submitted_at
                ON complaints(submitted_at)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_urgency
                ON complaints(nlp_urgency_level)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_language
                ON complaints(language)
            """)
        logger.info(f"DB ready: {self.db_path}")

    # ── Insert ─────────────────────────────────────────────────────────────
    def insert(self, complaint: dict) -> str:
        """
        Insert one analyzed complaint.
        complaint must have: text_original + all nlp_* fields from pipeline.

        Returns the complaint_id.
        """
        cid = complaint.get("complaint_id") or self._generate_id()
        kw  = complaint.get("keywords") or complaint.get("nlp_keywords") or []
        if isinstance(kw, list):
            kw = json.dumps(kw, ensure_ascii=False)

        row = {
            "complaint_id":      cid,
            "submitted_at":      complaint.get("submitted_at",
                                               datetime.now().isoformat()),
            "msisdn":            complaint.get("msisdn"),
            "city_input":        complaint.get("city_input"),
            "segment":           complaint.get("segment"),
            "channel":           complaint.get("channel", "web"),
            "text_original":     complaint.get("text_original")
                                 or complaint.get("text", ""),
            "language":          complaint.get("language", "fr"),
            "nlp_category":      complaint.get("category")
                                 or complaint.get("nlp_category"),
            "nlp_sentiment":     complaint.get("sentiment")
                                 or complaint.get("nlp_sentiment"),
            "nlp_urgency_score": complaint.get("urgency_score")
                                 or complaint.get("nlp_urgency_score", 0.0),
            "nlp_urgency_level": complaint.get("urgency_level")
                                 or complaint.get("nlp_urgency_level", "normal"),
            "nlp_city":          complaint.get("city")
                                 or complaint.get("nlp_city"),
            "nlp_network_type":  complaint.get("network_type")
                                 or complaint.get("nlp_network_type"),
            "nlp_keywords":      kw,
            "status":            complaint.get("status", "open"),
        }

        with self._conn() as conn:
            conn.execute("""
                INSERT OR IGNORE INTO complaints (
                    complaint_id, submitted_at, msisdn, city_input, segment,
                    channel, text_original, language, nlp_category,
                    nlp_sentiment, nlp_urgency_score, nlp_urgency_level,
                    nlp_city, nlp_network_type, nlp_keywords, status
                ) VALUES (
                    :complaint_id, :submitted_at, :msisdn, :city_input, :segment,
                    :channel, :text_original, :language, :nlp_category,
                    :nlp_sentiment, :nlp_urgency_score, :nlp_urgency_level,
                    :nlp_city, :nlp_network_type, :nlp_keywords, :status
                )
            """, row)
        return cid

    # ── Query ──────────────────────────────────────────────────────────────
    def to_dataframe(self,
                     language:  str | None = None,
                     urgency:   str | None = None,
                     sentiment: str | None = None,
                     status:    str | None = None,
                     limit:     int = 5000) -> pd.DataFrame:
        """Load complaints from DB into a DataFrame with optional filters."""
        conditions = []
        params: list = []

        if language:
            conditions.append("language = ?")
            params.append(language)
        if urgency:
            conditions.append("nlp_urgency_level = ?")
            params.append(urgency)
        if sentiment:
            conditions.append("nlp_sentiment = ?")
            params.append(sentiment)
        if status:
            conditions.append("status = ?")
            params.append(status)

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        sql   = f"SELECT * FROM complaints {where} ORDER BY submitted_at DESC LIMIT ?"
        params.append(limit)

        with self._conn() as conn:
            df = pd.read_sql_query(sql, conn, params=params)

        if not df.empty and "nlp_keywords" in df.columns:
            df["nlp_keywords"] = df["nlp_keywords"].apply(
                lambda x: json.loads(x) if x and isinstance(x, str) else []
            )
        return df

    def count(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]

    def stats(self) -> dict:
        """Return aggregated stats for the dashboard."""
        with self._conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]
            if total == 0:
                return {"total": 0}

            by_lang = dict(conn.execute(
                "SELECT language, COUNT(*) FROM complaints GROUP BY language"
            ).fetchall())
            by_cat  = dict(conn.execute(
                "SELECT nlp_category, COUNT(*) FROM complaints GROUP BY nlp_category ORDER BY 2 DESC LIMIT 10"
            ).fetchall())
            by_sent = dict(conn.execute(
                "SELECT nlp_sentiment, COUNT(*) FROM complaints GROUP BY nlp_sentiment"
            ).fetchall())
            by_urg  = dict(conn.execute(
                "SELECT nlp_urgency_level, COUNT(*) FROM complaints GROUP BY nlp_urgency_level"
            ).fetchall())
            by_city = dict(conn.execute(
                "SELECT nlp_city, COUNT(*) FROM complaints WHERE nlp_city IS NOT NULL GROUP BY nlp_city ORDER BY 2 DESC LIMIT 10"
            ).fetchall())
            avg_urg = conn.execute(
                "SELECT AVG(nlp_urgency_score) FROM complaints"
            ).fetchone()[0] or 0.0

        return {
            "total":            total,
            "by_language":      by_lang,
            "by_category":      by_cat,
            "by_sentiment":     by_sent,
            "by_urgency_level": by_urg,
            "by_city":          by_city,
            "mean_urgency":     round(avg_urg, 3),
        }

    def update_status(self, complaint_id: str, status: str) -> None:
        with self._conn() as conn:
            conn.execute(
                "UPDATE complaints SET status = ? WHERE complaint_id = ?",
                (status, complaint_id)
            )

    def _generate_id(self) -> str:
        n = self.count() + 1
        return f"OOR-{n:05d}"