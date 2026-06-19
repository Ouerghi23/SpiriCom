# src/api/disengagement_api.py
# ─────────────────────────────────────────────────────────────────────
# SpiriCom NOC — Disengagement (churn v6) API
# Serves the validated NB03b/NB04/NB05/NB06 pipeline artifacts:
#   data/outputs/disengagement_final.json        (metrics, drivers, guardrails)
#   data/outputs/churn_eda_v6.json               (label definition, thresholds)
#   models/disengagement_risk_scores_v2.parquet  (calibrated risk + SHAP reasons)
#   models/disengagement_model_v6_calibrated.joblib + features_v2.json
#   data/processed/churn_features_v6.parquet     (per-msisdn feature rows)
#
# Route names MATCH src/api/client.js (churnModelSummary/churnHighRisk/
# churnPredict/churnShap) via aliases, so the existing frontend wiring
# works without changes.
#
# IMPORTANT - to actually serve the NEW data:
#   1. Remove (or register AFTER this router) any old /api/churn/* routes
#      in analytics_api.py - FastAPI serves the FIRST matching route.
#   2. Restart uvicorn after re-running notebooks IF analytics_api loads
#      its artifacts at import time; this router hot-reloads on mtime.
#
# Endpoints (spec PART 6, renamed for honesty: disengagement, not churn):
#   GET /api/churn/summary            -> label def + model metrics + guardrails
#   GET /api/churn/high-risk?limit=20 -> top risk customers w/ top_reasons
#   GET /api/churn/predict/{msisdn}   -> calibrated risk for one customer
#   GET /api/churn/drivers            -> SHAP top drivers (for the dashboard)
#
# Notes:
#  - route prefix stays /api/churn so the existing frontend wiring works;
#    every payload carries label_note explaining it is a disengagement
#    segmentation, not measured churn (NB03-4).
#  - risk is CALIBRATED; values > 0.99 are reported as 0.99 for display
#    (isotonic can saturate at 1.0 on pure top bins — never show "100%").
#  - artifacts hot-reload on file mtime change (re-run notebooks, no restart).
#  - TODO(auth): plug your existing dependency, e.g.
#      from .auth_api import get_current_user
#      router = APIRouter(..., dependencies=[Depends(get_current_user)])
# ─────────────────────────────────────────────────────────────────────

import json
import logging
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/churn", tags=["disengagement"])

PROC_DIR  = Path("data/processed")
MODEL_DIR = Path("models")
OUT_DIR   = Path("data/outputs")

FINAL_JSON   = OUT_DIR / "disengagement_final.json"
EDA_JSON     = OUT_DIR / "churn_eda_v6.json"
SCORES_PARQ  = MODEL_DIR / "disengagement_risk_scores_v2.parquet"
MODEL_JOBLIB = MODEL_DIR / "disengagement_model_v6_calibrated.joblib"
FEATS_JSON   = MODEL_DIR / "disengagement_features_v2.json"
FEATURES_PARQ = PROC_DIR / "churn_features_v6.parquet"

LABEL_NOTE = ("Disengagement segmentation (label v6: dou<=Q20 OR duration<=Q20 "
              "on observed data) - a design label, not measured churn.")

DISPLAY_CAP = 0.99   # never show 100% risk


# ── mtime-aware artifact cache ────────────────────────────────────────
class _Cache:
    def __init__(self):
        self._store = {}

    def get(self, path: Path, loader):
        if not path.exists():
            return None
        mtime = path.stat().st_mtime
        key = str(path)
        hit = self._store.get(key)
        if hit and hit[0] == mtime:
            return hit[1]
        try:
            value = loader(path)
        except Exception as e:
            logger.error(f"failed loading {path}: {e}")
            return None
        self._store[key] = (mtime, value)
        logger.info(f"loaded artifact: {path}")
        return value


_cache = _Cache()
_load_json    = lambda p: json.load(open(p, encoding="utf-8"))
_load_parquet = lambda p: pd.read_parquet(p)


def _load_model(p: Path):
    import joblib
    return joblib.load(p)


def _cap(risk: float) -> float:
    return round(min(float(risk), DISPLAY_CAP), 4)


# ── Endpoints ─────────────────────────────────────────────────────────
@router.get("/summary")
@router.get("/model-summary")        # alias: matches client.js churnModelSummary
def summary():
    """Label definition + final model metrics + interpretation guardrails."""
    final  = _cache.get(FINAL_JSON, _load_json)
    eda    = _cache.get(EDA_JSON, _load_json)
    scores = _cache.get(SCORES_PARQ, _load_parquet)   # ← NEW: load full risk table
    if final is None:
        raise HTTPException(503, "disengagement_final.json missing - run NB06")

    # FIX: true population average — computed over ALL 2,566 scored
    # customers, not the top-N from /high-risk (which are by definition
    # near DISPLAY_CAP and would always report a meaningless ~99%).
    avg_risk = None
    if scores is not None and "risk" in scores.columns and len(scores):
        avg_risk = round(float(scores["risk"].clip(upper=DISPLAY_CAP).mean()), 4)

    return {
        "label_note"  : LABEL_NOTE,
        "selected_model": final.get("selected_model"),
        "all_models"  : final.get("test_metrics_clean", {}),
        "label"       : {
            "version"             : final.get("label_version"),
            "definition"          : (eda or {}).get("definition_note"),
            "labelled_customers"  : (eda or {}).get("labelled_customers"),
            "unlabelled_imputed"  : (eda or {}).get("unlabelled_imputed"),
            "disengaged"          : (eda or {}).get("disengaged"),
            "engaged"             : (eda or {}).get("engaged"),
            "disengaged_share_pct": (eda or {}).get("disengaged_share_pct"),
            "thresholds"          : (eda or {}).get("thresholds"),
        },
        "model"       : {
            "served"   : final.get("served_model"),
            "selection": final.get("selection_rule",
                                   "OOF PR-AUC (5-fold), test touched once"),
            "metrics"  : (final.get("test_metrics_clean", {})
                          .get(final.get("selected_model"), {})),
            "calibration": final.get("calibration"),
            "baseline_prevalence": final.get("baseline_prevalence"),
            "avg_risk": avg_risk,                       # ← NEW field
            "scored_population": int(len(scores)) if scores is not None else 0,
        },
        "guardrails"  : final.get("interpretation_guardrails", []),
        "generated_at": final.get("generated_at"),
    }

@router.get("/high-risk")
def high_risk(limit: int = Query(20, ge=1, le=500),
              band: Optional[str] = Query(None, pattern="^(low|medium|high)$")):
    """Top customers by calibrated risk, with per-customer SHAP top reasons."""
    scores = _cache.get(SCORES_PARQ, _load_parquet)
    if scores is None:
        raise HTTPException(503, "risk scores missing - run NB06")
    df = scores
    if band:
        df = df[df["risk_band"].astype(str) == band]
    df = df.sort_values("risk", ascending=False).head(limit)
    rows = []
    for _, r in df.iterrows():
        rows.append({
            "msisdn"     : str(r["msisdn"]),
            "risk"       : _cap(r["risk"]),
            "risk_band"  : str(r["risk_band"]),
            "top_reasons": (str(r["top_reasons"]).split("; ")
                             if "top_reasons" in df.columns
                             and pd.notna(r.get("top_reasons")) else []),
                
        }) 
    return {"label_note": LABEL_NOTE, "count": len(rows),
            "scored_population": int(len(scores)), "customers": rows}


@router.get("/predict/{msisdn}")
def predict(msisdn: str):
    """Calibrated risk for one customer.
    Pre-scored test customers come from the parquet (with SHAP reasons);
    other labelled customers are scored live with the calibrated model."""
    scores = _cache.get(SCORES_PARQ, _load_parquet)
    if scores is not None:
        hit = scores[scores["msisdn"].astype(str) == str(msisdn)]
        if len(hit):
            r = hit.iloc[0]
            return {"msisdn": str(msisdn), "risk": _cap(r["risk"]),
                    "risk_band": str(r["risk_band"]),
                    "top_reasons": (str(r["top_reasons"]).split("; ")
                                    if "top_reasons" in hit.columns
                                    and pd.notna(r.get("top_reasons")) else []),
                    "source": "pre-scored (test set)",
                    "label_note": LABEL_NOTE}

    feats_tbl = _cache.get(FEATURES_PARQ, _load_parquet)
    model     = _cache.get(MODEL_JOBLIB, _load_model)
    features  = _cache.get(FEATS_JSON, _load_json)
    if feats_tbl is None or model is None or features is None:
        raise HTTPException(503, "model artifacts missing - run NB04/NB06")

    row = feats_tbl[feats_tbl["msisdn"].astype(str) == str(msisdn)]
    if not len(row):
        raise HTTPException(
            404, f"msisdn {msisdn} not in the labelled population "
                 "(2,330 customers are unlabelled due to NB00 imputation)")
    X = row.reindex(columns=features, fill_value=None)[features]
    risk = float(model.predict_proba(X)[:, 1][0])
    band = "high" if risk > 0.66 else "medium" if risk > 0.33 else "low"
    return {"msisdn": str(msisdn), "risk": _cap(risk), "risk_band": band,
            "top_reasons": [], "source": "live model",
            "label_note": LABEL_NOTE}


@router.get("/drivers")
@router.get("/shap")                  # alias: matches client.js churnShap
def drivers():
    """Global SHAP drivers for the dashboard 'Disengagement Drivers' panel."""
    final = _cache.get(FINAL_JSON, _load_json)
    if final is None or not final.get("shap_top_drivers"):
        raise HTTPException(503, "SHAP drivers missing - run NB06 with shap")
    items = [{"feature": k, "mean_abs_shap": round(float(v), 4)}
             for k, v in final["shap_top_drivers"].items()]
    return {"label_note": LABEL_NOTE,
            "drivers": items,
            "guardrails": final.get("interpretation_guardrails", []),
            "generated_at": final.get("generated_at")}