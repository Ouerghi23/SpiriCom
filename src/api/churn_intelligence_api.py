# src/api/churn_intelligence_api.py
# ─────────────────────────────────────────────────────────────────────
# SpiriCom NOC — Churn Intelligence Router v6 (replaces ROUTER 2 of
# analytics_api.py). Audit codes API-6..API-9.
#
# Serves the validated NB02 v2.1 forecasting artifacts and v6 brand
# performance. The /api/churn/* and /api/coverage/5g routes live in
# their own modules (disengagement_api.py, coverage_api.py).
#
# Registration in analytics_api.py (see migration notes):
#   from src.api.churn_intelligence_api import router as churn_intel_router
#   from src.api.disengagement_api import router as disengagement_router
#   from src.api.coverage_api import router as coverage_router
#   app.include_router(churn_intel_router)
#   app.include_router(disengagement_router)
#   app.include_router(coverage_router)
# ─────────────────────────────────────────────────────────────────────
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from .artifact_cache import get_json, get_parquet

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Churn Intelligence v6"])

FORECASTS_PARQ  = Path("models/prediction/forecasts.parquet")
SCORES_PARQ     = Path("models/prediction/prediction_scores.parquet")
RESULTS_JSON    = Path("data/outputs/forecast_results.json")
LABELLED_PARQ   = Path("data/processed/churn_labelled_v6.parquet")

# NB02-13..18: until the NB00 semantic-imputation fix + NB02 v2.1 re-run,
# the 5G series is 91.8% imputation noise. Surfaced on every payload.
DATA_QUALITY_NOTE = ("traffic_5g is 91.8% median-imputed in the current "
                     "kpi_clean.parquet - 5G forecast values are PENDING the "
                     "NB00 semantic-imputation fix + NB02 v2.1 re-run")


def _safe_records(df: pd.DataFrame) -> list[dict]:
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.where(pd.notnull(df), None)
    out = []
    for row in df.to_dict(orient="records"):
        rec = {}
        for k, v in row.items():
            if isinstance(v, np.integer):
                v = int(v)
            elif isinstance(v, np.floating):
                v = None if np.isnan(v) else float(v)
            elif isinstance(v, np.bool_):
                v = bool(v)
            elif isinstance(v, pd.Timestamp):
                v = v.strftime("%Y-%m-%d")
            rec[k] = v
        out.append(rec)
    return out


def _first_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    return next((c for c in candidates if c in df.columns), None)


# ── API-6: /api/forecast/5g — cached, defensive columns, validity flags ──
@router.get("/api/forecast/5g")
def forecast_5g():
    fc = get_parquet(FORECASTS_PARQ)
    if fc is None or fc.empty:
        raise HTTPException(503, "forecasts.parquet missing - run NB02 v2.1")
    df = fc.copy()
    df.columns = df.columns.str.lower()

    target_col = _first_col(df, ["target", "series", "kpi"])
    if target_col:
        df = df[df[target_col].astype(str).str.lower()
                .str.contains("5g", na=False)].copy()

    date_col  = _first_col(df, ["ds", "date", "timestamp"])
    value_col = _first_col(df, ["yhat", "forecast", "value", "prediction"])
    if not date_col or not value_col:
        raise HTTPException(
            500, f"unexpected forecasts.parquet schema: {list(df.columns)}")
    df = df.rename(columns={date_col: "date", value_col: "value"})
    df["is_forecast"] = True
    keep = [c for c in ["date", "value", "is_forecast", "model",
                        "yhat_lower", "yhat_upper"] if c in df.columns]
    df = df[keep].sort_values("date")

    results = get_json(RESULTS_JSON) or {}
    return {
        "series": _safe_records(df),
        "meta": {
            "traffic_scale": results.get("traffic_scale"),
            "winner_model" : results.get("best_5g_model")
                             or results.get("winner"),
            "data_quality" : DATA_QUALITY_NOTE,
            "generated_at" : results.get("generated_at"),
        },
    }


# ── API-7: /api/forecast/brand — real brand data (old route fabricated
#    'brands' by renaming risk_level) ──────────────────────────────────
@router.get("/api/forecast/brand")
def forecast_brand():
    results = get_json(RESULTS_JSON) or {}
    for key in ("brand_forecasts", "brands", "brand_results"):
        if results.get(key):
            return {"brands": results[key],
                    "source": f"forecast_results.json:{key}",
                    "data_quality": DATA_QUALITY_NOTE}

    fc = get_parquet(FORECASTS_PARQ)
    if fc is not None and not fc.empty:
        df = fc.copy()
        df.columns = df.columns.str.lower()
        target_col = _first_col(df, ["target", "series", "brand"])
        if target_col:
            known = {"samsung", "xiaomi", "infinix", "oppo", "apple",
                     "huawei", "tecno", "itel", "nokia", "honor", "realme"}
            brand_rows = df[df[target_col].astype(str).str.lower().isin(known)]
            if not brand_rows.empty:
                date_col  = _first_col(brand_rows, ["ds", "date"])
                value_col = _first_col(brand_rows,
                                       ["yhat", "forecast", "value"])
                agg = (brand_rows.groupby(target_col)[value_col]
                       .agg(forecast="mean", count="size").reset_index()
                       .rename(columns={target_col: "brand"}))
                return {"brands": _safe_records(agg),
                        "source": "forecasts.parquet",
                        "data_quality": DATA_QUALITY_NOTE}

    raise HTTPException(
        503, "no brand forecast artifacts found - run NB02 v2.1 "
             "(the old endpoint fabricated brands from risk levels; "
             "that behaviour was removed)")


# ── API-8: /api/forecast/session-flag — route existed in client.js
#    but never in the backend (permanent 404 until now) ───────────────
@router.get("/api/forecast/session-flag")
def forecast_session_flag():
    results = get_json(RESULTS_JSON)
    if results is None:
        raise HTTPException(503, "forecast_results.json missing - run NB02 v2.1")
    session = (results.get("session")
               or results.get("session_flag")
               or {k: v for k, v in results.items()
                   if str(k).startswith("session_")})
    if not session:
        raise HTTPException(
            503, "no session-flag section in forecast_results.json - "
                 "re-run NB02 v2.1 Section A")
    return {
        "session": session,
        "note": ("cross-sectional mode: each subscriber observed once - "
                 "this classifies session_flag from the subscriber profile, "
                 "it does NOT predict next-day activity (NB02-13)"),
    }


# ── API-9: /api/brand/performance — rebuilt on churn_labelled_v6 ─────
@router.get("/api/brand/performance")
def brand_performance():
    df = get_parquet(LABELLED_PARQ)
    if df is None or df.empty:
        raise HTTPException(503,
                            "churn_labelled_v6.parquet missing - run NB03b")
    df = df.copy()
    gen = df["generation"].fillna("UNKNOWN").astype(str).str.upper()
    df["_has_nr"] = gen.str.contains("NR").astype(int)
    real_5g = ((df.get("traffic_5g_imputed", 0) == 0)
               & (df["traffic_5g"] > 0))

    rows = []
    for brand_name, grp in df.groupby(df["brand"].fillna("UNKNOWN")):
        total = len(grp)
        lab   = grp["churn"].dropna()
        g     = gen.loc[grp.index]
        gen_breakdown = {str(k): round(float(v) / total, 3)
                         for k, v in g.value_counts().items()}
        t5g = grp.loc[real_5g.loc[grp.index], "traffic_5g"]
        rows.append({
            "brand_name"      : str(brand_name),
            "customer_count"  : int(total),
            # disengagement share among LABELLED customers (v6 guardrails)
            "churn_rate"      : (round(float(lab.mean()), 4)
                                 if len(lab) else None),
            "labelled"        : int(len(lab)),
            # NR-capable share replaces the old fake ratio_5g
            "ratio_5g_mean"   : round(float(grp["_has_nr"].mean()), 4),
            # observed (non-imputed) 5G traffic only
            "traffic_5g_mean" : (round(float(t5g.mean()), 2)
                                 if len(t5g) else None),
            "duration_mean"   : (round(float(grp["duration"].mean()), 1)
                                 if "duration" in grp.columns else None),
            "brand_churn_rate": (round(float(lab.mean()), 4)
                                 if len(lab) else None),
            "is_5g_capable"   : bool(grp["_has_nr"].any()),
            "gen_breakdown"   : gen_breakdown,
        })
    rows.sort(key=lambda x: x["customer_count"], reverse=True)
    return {"brands": rows, "total_brands": len(rows),
            "label_note": ("churn_rate = disengagement share (label v6) "
                           "among labelled customers; ratio_5g_mean = "
                           "NR-capable device share")}