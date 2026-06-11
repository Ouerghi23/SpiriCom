"""
src/api/analytics_api.py
=========================
SpiriComp — FastAPI analytics backend (main entry point).

Run from project root:
    uvicorn src.api.analytics_api:app --reload --port 8000

FIXES IN THIS VERSION:
  API-1  Duplicate complaints/by-city route removed — fixed version only
  API-2  Overview uses 'province' column (not 'region') → Governorates badge
  API-3  TN_COORDS lookup normalizes city to Title Case → map shows cities
  API-4  TN_COORDS expanded with missing top-20 cities from actual data
  MAP-1  province col (not region) throughout
  MAP-2  Service derived from sub_category (no service_type col)
  MAP-3  QoE = resolution rate (is_unresolved col)
  MAP-4  GOUVERNORAT stripped (uppercase + mixed case)
"""
from __future__ import annotations

import json
import logging
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
import pandas as pd
from fastapi import FastAPI, APIRouter, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger("analytics_api")

# ── Data paths ────────────────────────────────────────────────────────
DATA   = Path("data/processed")
MODELS = Path("models")

PATHS: dict[str, Path] = {
    "complaints_clean":    DATA   / "complaints_clean.parquet",
    "complaint_daily_agg": DATA   / "complaint_daily_agg.parquet",
    "kpi_daily_agg":       DATA   / "kpi_daily_agg.parquet",
    "feature_matrix":      DATA   / "feature_matrix.parquet",
    "anomaly_results":     MODELS / "anomaly/anomaly_results.parquet",
    "kmeans_users":        MODELS / "clustering/kmeans_users.parquet",
    "dbscan_users":        MODELS / "clustering/dbscan_users.parquet",
}

# ── FIX-API-3+4: Coordinates — Title Case keys + expanded city list ──
# All lookups normalize city via .title() before lookup
TN_COORDS: dict[str, tuple[float, float]] = {
    # Major cities (title case — lookup normalizes input)
    "Tunis":              (36.8065, 10.1815),
    "Sfax":               (34.7406, 10.7603),
    "Sousse":             (35.8256, 10.6411),
    "Kairouan":           (35.6781, 10.0963),
    "Bizerte":            (37.2746,  9.8739),
    "Gabès":              (33.8815, 10.0982),
    "Gabes":              (33.8815, 10.0982),  # without accent
    "Ariana":             (36.8625, 10.1956),
    "Gafsa":              (34.4250,  8.7842),
    "Monastir":           (35.7780, 10.8262),
    "Mahdia":             (35.5047, 11.0622),
    "Médenine":           (33.3548, 10.5055),
    "Medenine":           (33.3548, 10.5055),  # without accent
    "Nabeul":             (36.4561, 10.7376),
    "Béja":               (36.7256,  9.1817),
    "Beja":               (36.7256,  9.1817),
    "Jendouba":           (36.5028,  8.7803),
    "Le Kef":             (36.1675,  8.7050),
    "Siliana":            (36.0844,  9.3708),
    "Kasserine":          (35.1675,  8.8364),
    "Sidi Bouzid":        (35.0381,  9.4858),
    "Tozeur":             (33.9197,  8.1336),
    "Tataouine":          (32.9297, 10.4517),
    "Kébili":             (33.7050,  8.9692),
    "Kebili":             (33.7050,  8.9692),
    "Manouba":            (36.8104, 10.0863),
    "Ben Arous":          (36.7531, 10.2189),
    "Zaghouan":           (36.4022, 10.1429),
    "La Marsa":           (36.8765, 10.3253),
    "Carthage":           (36.8527, 10.3300),
    "Hammamet":           (36.4000, 10.6167),
    "Djerba":             (33.7833, 10.8833),
    "Zarzis":             (33.5000, 11.1167),
    "El Kram":            (36.8333, 10.3167),
    # FIX-API-4: Added missing cities from actual top-20 data
    "Mohamedia-Fouchana": (36.7333, 10.2167),
    "Mohamedia":          (36.7333, 10.2167),
    "Fouchana":           (36.7333, 10.2167),
    "El Mourouj":         (36.7167, 10.2167),
    "Sidi Hassine":       (36.8000, 10.1167),
    "Jebiniana":          (34.9167, 10.9000),
    "Houmt El Souk":      (33.8833, 10.8667),
    "Houmt Souk":         (33.8833, 10.8667),
    "El Aouina":          (36.8500, 10.2333),
    "Rades":              (36.7667, 10.2833),
    "La Goulette":        (36.8167, 10.3000),
    "Msaken":             (35.7333, 10.5833),
    "Menzel Bourguiba":   (37.1500,  9.7833),
    "Gaafour":            (36.3167,  9.3333),
    "Kalaa Kebira":       (35.8667, 10.5333),
    "Korba":              (36.5667, 10.8667),
    "Kelibia":            (36.8500, 11.1000),
    "Bou Salem":          (36.6167,  8.9667),
    "Teboursouk":         (36.4500,  9.2500),
    "Medjez El Bab":      (36.6500,  9.6167),
    "Menzel Temime":      (36.7833, 10.9833),
    "Akouda":             (35.8667, 10.5667),
    "Thala":              (35.5667,  8.6667),
    "Sbeitla":            (35.2333,  9.1167),
    "Redeyef":            (34.3833,  8.2000),
    "Metlaoui":           (34.3333,  8.4000),
    "El Hamma":           (33.8833,  9.8000),
    "Skhirat":            (36.0000, 10.0333),
    "Douz":               (33.4500,  9.0167),
}


def _coord_lookup(city: str):
    """Case-insensitive coordinate lookup. FIX-API-3: normalizes TUNIS → Tunis."""
    if not city:
        return None, None
    # Try title case first (most keys are title case)
    key = city.strip().title()
    if key in TN_COORDS:
        return TN_COORDS[key]
    # Try exact match (for accented chars already in correct form)
    if city.strip() in TN_COORDS:
        return TN_COORDS[city.strip()]
    # Try lowercase comparison
    city_lower = city.strip().lower()
    for k, v in TN_COORDS.items():
        if k.lower() == city_lower:
            return v
    return None, None


CACHE_TTL = 120
_cache: dict[str, tuple[pd.DataFrame, float]] = {}


def load(key: str, refresh: bool = False) -> pd.DataFrame:
    now = time.monotonic()
    if not refresh and key in _cache:
        df, ts = _cache[key]
        if now - ts < CACHE_TTL:
            return df
    p = PATHS.get(key)
    if p and p.exists():
        df = pd.read_parquet(p)
        logger.info("loaded %s (%d rows)", key, len(df))
    else:
        logger.warning("data file not found: %s", p)
        df = pd.DataFrame()
    _cache[key] = (df, now)
    return df


_DATE_COL_CANDIDATES = [
    "date", "Date", "timestamp", "Timestamp", "opened_at",
    "datetime", "DateTime", "date_time", "period",
    "day", "obs_date", "report_date",
]


def _find_date_col(df: pd.DataFrame) -> str | None:
    for candidate in _DATE_COL_CANDIDATES:
        if candidate in df.columns:
            return candidate
    for col in df.columns:
        if "datetime" in str(df[col].dtype).lower():
            return col
    for col in df.columns:
        if any(kw in col.lower() for kw in ("date", "time", "day", "period")):
            return col
    return None


def _find_province_col(df: pd.DataFrame) -> str | None:
    """FIX-MAP-1: Find the province/region column by trying multiple names."""
    for candidate in ["province", "Province", "region", "Region",
                      "gouvernorat", "Gouvernorat", "governorate"]:
        if candidate in df.columns:
            return candidate
    return None


def _clean_province(name: str) -> str:
    """FIX-MAP-4: Strip GOUVERNORAT suffix (any case)."""
    return (str(name)
            .replace(" GOUVERNORAT", "")
            .replace(" Gouvernorat", "")
            .replace(" gouvernorat", "")
            .replace(" Governorate", "")
            .replace(" GOVERNORATE", "")
            .strip())


def safe_dict(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    df = df.copy()
    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d")
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.where(pd.notnull(df), None)
    records = df.to_dict(orient="records")

    def _cast(v):
        if isinstance(v, np.integer):  return int(v)
        if isinstance(v, np.floating): return None if np.isnan(v) else float(v)
        if isinstance(v, np.bool_):    return bool(v)
        return v

    return [{k: _cast(v) for k, v in row.items()} for row in records]


# ═══════════════════════════════════════════════════════════════════════
# ROUTER 1 — Analytics (/api/analytics/*)
# Dataset 1: complaints_clean / complaint_daily_agg / kpi_daily_agg
# ═══════════════════════════════════════════════════════════════════════
router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/overview")
async def overview(refresh: bool = Query(False)):
    cc  = load("complaints_clean", refresh)
    kpi = load("kpi_daily_agg",    refresh)
    out: dict = {}
    if not cc.empty:
        out["total_complaints"] = int(len(cc))
        out["unique_msisdns"]   = int(cc["msisdn"].nunique()) if "msisdn" in cc.columns else 0
        out["unique_cities"]    = int(cc["city"].nunique())   if "city"   in cc.columns else 0

        # FIX-API-2: use province column (data has 'province' not 'region')
        prov_col = _find_province_col(cc)
        out["unique_regions"] = int(cc[prov_col].nunique()) if prov_col else 0

        date_col_cc = _find_date_col(cc)
        if date_col_cc:
            ts = pd.to_datetime(cc[date_col_cc], errors="coerce")
            out["date_min"] = str(ts.min())[:10]
            out["date_max"] = str(ts.max())[:10]

        # Top province
        if prov_col:
            top_prov = cc[prov_col].value_counts().index[0]
            out["top_region"] = _clean_province(top_prov)

        # Category breakdowns — use actual column names from complaints_clean
        for col, key in [
            ("typology",      "by_typology"),
            ("category",      "by_category"),
            ("segment",       "by_segment"),
            ("status",        "by_status"),
            ("provider_group","by_provider"),
        ]:
            if col in cc.columns:
                out[key] = cc[col].value_counts().to_dict()

    if not kpi.empty:
        date_col_kpi = _find_date_col(kpi)
        if date_col_kpi:
            kpi = kpi.copy()
            kpi[date_col_kpi] = pd.to_datetime(kpi[date_col_kpi], errors="coerce")
            last   = kpi[date_col_kpi].max()
            recent = kpi[kpi[date_col_kpi] >= last - pd.Timedelta(days=30)]
            prev   = kpi[(kpi[date_col_kpi] >= last - pd.Timedelta(days=60)) &
                         (kpi[date_col_kpi] <  last - pd.Timedelta(days=30))]
            kpi_cols = ["dl_throughput_mbps_mean", "latency_ms_mean", "packet_loss_pct_mean",
                        "call_drop_rate_mean", "data_qoe_score_mean", "voice_qoe_score_mean",
                        "data_session_success_rate_mean", "voice_quality_score_mos_mean"]
            avgs = {}
            for c in kpi_cols:
                if c not in kpi.columns: continue
                cur = float(recent[c].mean()) if not recent.empty else 0.0
                prv = float(prev[c].mean())   if not prev.empty  else cur
                d   = (cur - prv) / prv * 100 if prv and not np.isnan(prv) and not np.isinf(prv) else 0.0
                avgs[c] = {"value": round(cur, 2), "delta": round(d, 2),
                           "delta_str": f"{chr(43) if d >= 0 else chr(45)}{d:.1f}%"}
            out["kpi_averages"] = avgs
    return out


@router.get("/analysis/results")
async def analysis_results():
    """NB01 analysis_results.json + live enrichment from complaints_clean."""
    p = Path("data/outputs/analysis_results.json")
    if not p.exists():
        raise HTTPException(404, "analysis_results.json not found — run NB01")
    with open(p, encoding="utf-8") as f:
        data = json.load(f)

    cc = load("complaints_clean")
    if not cc.empty:
        if "sub_sub_category" in cc.columns:
            data["by_sub_sub_category"] = (
                cc["sub_sub_category"].value_counts().head(10).to_dict()
            )
        if "segment" in cc.columns:
            data["by_segment"] = cc["segment"].value_counts().to_dict()
        if "status" in cc.columns:
            data["by_status"] = cc["status"].value_counts().to_dict()
    return data


@router.get("/complaints/sub-categories")
async def complaints_sub_categories(refresh: bool = Query(False)):
    """sub_sub_category breakdown with French→English translation."""
    cc = load("complaints_clean", refresh)
    if cc.empty or "sub_sub_category" not in cc.columns:
        return {"types": {}}

    raw = cc["sub_sub_category"].value_counts().head(10).to_dict()
    translate = {
        "DÉBIT FAIBLE INTERNET MOBILE":           "Slow Internet (Mobile)",
        "ECHEC ÉMISSION/RÉCEPTION APPEL":          "Call Failure",
        "PAS D'ACCÈS INTERNET MOBILE":             "No Internet Access",
        "ECHEC CONNEXION INTERNET MOBILE":         "Internet Connection Fail",
        "PAS DE COUVERTURE VOIX":                  "No Voice Coverage",
        "COUPURE DE CONNEXION INTERNET MOBILE":    "Internet Drop",
        "COUPURE DAPPEL":                          "Call Drop",
        "MAUVAISE QUALITÉ DE SON":                 "Poor Voice Quality",
        "DÉBIT FAIBLE INTERNET MOBILE 5G":         "Slow 5G Internet",
        "PAS DE COUVERTURE INTERNET MOBILE 5G":    "No 5G Coverage",
    }
    translated = {translate.get(k, k): v for k, v in raw.items()}
    return {"types": translated}


@router.get("/complaints/trend")
async def complaints_trend(refresh: bool = Query(False)):
    agg = load("complaint_daily_agg", refresh)
    if agg.empty:
        return {"trend": []}
    date_col = _find_date_col(agg)
    if not date_col or "total_complaints" not in agg.columns:
        return {"trend": [], "error": f"Required columns missing. Found: {list(agg.columns)}"}
    agg = agg.copy()
    agg[date_col] = pd.to_datetime(agg[date_col], errors="coerce")
    daily = agg.groupby(date_col)["total_complaints"].sum().reset_index().sort_values(date_col)
    daily[date_col]   = daily[date_col].dt.strftime("%Y-%m-%d")
    daily["roll7"]    = daily["total_complaints"].rolling(7, min_periods=1).mean().round(2)
    mu, sigma         = daily["total_complaints"].mean(), daily["total_complaints"].std()
    daily["is_spike"] = (daily["total_complaints"] > mu + 2 * sigma).astype(int)
    daily = daily.rename(columns={date_col: "date"})
    return {"trend": safe_dict(daily)}


@router.get("/complaints/by-region")
async def complaints_by_region(refresh: bool = Query(False)):
    cc = load("complaints_clean", refresh)
    if cc.empty:
        return {"regions": []}

    prov_col = _find_province_col(cc)
    if not prov_col:
        return {"regions": []}

    totals = (cc.groupby(prov_col).size()
               .reset_index(name="total_complaints")
               .sort_values("total_complaints", ascending=False))

    totals["region"] = totals[prov_col].apply(_clean_province)
    totals = totals.drop(columns=[prov_col])
    return {"regions": safe_dict(totals)}


@router.get("/complaints/by-city")
async def complaints_by_city(refresh: bool = Query(False)):
    """
    FIX-API-1: Single authoritative version (old broken duplicate removed).
    FIX-API-3: Uses _coord_lookup() which normalizes city to Title Case.
    FIX-MAP-1: Uses province column.
    FIX-MAP-2: Derives services from sub_category.
    FIX-MAP-3: qoe = resolution rate (100 - unresolved_pct).
    """
    cc = load("complaints_clean", refresh)
    if cc.empty:
        return {"cities": []}
    if "city" not in cc.columns:
        return {"cities": [], "error": "No city column"}

    prov_col = _find_province_col(cc)

    gcols   = ["city"] + ([prov_col] if prov_col else [])
    agg_dict = {"complaints": ("city", "count")}
    if "is_unresolved" in cc.columns:
        agg_dict["unresolved"] = ("is_unresolved", "sum")

    grouped = (cc.groupby(gcols)
                 .agg(**agg_dict)
                 .reset_index()
                 .sort_values("complaints", ascending=False))

    # Province → region (clean)
    if prov_col:
        grouped["region"] = grouped[prov_col].apply(_clean_province)
        grouped = grouped.drop(columns=[prov_col])

    # Resolution rate (replaces fake QoE)
    if "unresolved" in grouped.columns:
        grouped["unresolved_pct"] = (
            grouped["unresolved"] / grouped["complaints"] * 100
        ).round(1)
        grouped["qoe"] = (100 - grouped["unresolved_pct"]).clip(0, 100).round(1)
        grouped = grouped.drop(columns=["unresolved"])
    else:
        grouped["unresolved_pct"] = 50.0
        grouped["qoe"] = 50.0

    # Service breakdown from sub_category
    if "sub_category" in cc.columns:
        def _categorize(sub: str) -> str:
            s = str(sub).upper()
            if "5G"    in s:                         return "5g"
            if "VOIX"  in s or "APPEL" in s:         return "voice"
            return "4g"

        cc2 = cc.copy()
        cc2["_svc"] = cc2["sub_category"].apply(_categorize)
        svc_pivot = cc2.groupby(["city", "_svc"]).size().unstack(fill_value=0)
        for col in svc_pivot.columns:
            grouped[col] = grouped["city"].map(svc_pivot[col].to_dict()).fillna(0).astype(int)

        svc_cols = [c for c in ["4g", "voice", "5g"] if c in grouped.columns]
        grouped["services"] = grouped.apply(
            lambda r: {c: int(r[c]) for c in svc_cols}, axis=1
        )
        grouped = grouped.drop(columns=[c for c in svc_cols if c in grouped.columns])

    # FIX-API-3: Normalize city name for coord lookup
    grouped["lat"] = grouped["city"].apply(lambda x: _coord_lookup(x)[0])
    grouped["lng"] = grouped["city"].apply(lambda x: _coord_lookup(x)[1])
    grouped = grouped.dropna(subset=["lat", "lng"])

    return {"cities": safe_dict(grouped)}


@router.get("/complaints/dow")
async def complaints_dow(refresh: bool = Query(False)):
    cc = load("complaints_clean", refresh)
    if cc.empty:
        return {"dow": {}}

    # Prefer pre-computed day_of_week column (0=Mon in data)
    if "day_of_week" in cc.columns:
        dow_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
        counts  = cc["day_of_week"].map(dow_map).value_counts()
        order   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        return {"dow": counts.reindex(order, fill_value=0).to_dict()}

    date_col = _find_date_col(cc)
    if not date_col:
        return {"dow": {}}
    cc = cc.copy()
    cc[date_col] = pd.to_datetime(cc[date_col], errors="coerce")
    cc = cc.dropna(subset=[date_col])
    cc["_dow"] = cc[date_col].dt.day_name().str[:3]
    order  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    counts = cc["_dow"].value_counts().reindex(order, fill_value=0).to_dict()
    return {"dow": counts}


@router.get("/complaints/status")
async def complaints_status(refresh: bool = Query(False)):
    cc = load("complaints_clean", refresh)
    if cc.empty:
        return {"status": {}}
    status_col = next(
        (c for c in ["status", "Status", "complaint_status", "resolution_status"]
         if c in cc.columns), None
    )
    if not status_col:
        return {"status": {}}
    return {"status": {str(k): int(v) for k, v in cc[status_col].value_counts().items()}}


@router.get("/forecast/preview")
async def forecast_preview(refresh: bool = Query(False)):
    fc_path = Path("models/prediction/forecasts.parquet")
    if not fc_path.exists():
        return {}
    fc = pd.read_parquet(fc_path)
    if fc.empty:
        return {}
    result: dict = {}
    score_path = Path("models/prediction/prediction_scores.parquet")
    if score_path.exists():
        try:
            sc = pd.read_parquet(score_path)
            if "model" in sc.columns and "mae" in sc.columns:
                xgb_rows = sc[sc["model"].str.lower().str.contains("xgb|xgboost", na=False)]
                if not xgb_rows.empty:
                    result["xgb_best_mae"] = round(float(xgb_rows["mae"].min()), 3)
        except Exception:
            pass
    return result


@router.get("/data/quality")
async def data_quality(refresh: bool = Query(False)):
    cc  = load("complaints_clean", refresh)
    kpi = load("kpi_daily_agg",    refresh)
    result: dict = {"data_quality_score": 0, "dataset2_kpi": {}}
    if not cc.empty:
        total_cells  = cc.shape[0] * cc.shape[1]
        filled_cells = cc.notna().sum().sum()
        result["data_quality_score"] = round(float(filled_cells / total_cells * 100), 1)
    if not kpi.empty:
        ref_cols = {"dl_throughput_mbps_mean", "latency_ms_mean", "packet_loss_pct_mean",
                    "call_drop_rate_mean", "data_qoe_score_mean", "voice_qoe_score_mean",
                    "data_session_success_rate_mean", "voice_quality_score_mos_mean"}
        retained = len([c for c in kpi.columns if c in ref_cols])
        result["dataset2_kpi"] = {"columns_retained": retained, "columns_dropped": len(ref_cols) - retained}
    return result


@router.get("/kpi/tiles")
async def kpi_tiles(refresh: bool = Query(False)):
    kpi = load("kpi_daily_agg", refresh)
    if kpi.empty:
        return {"tiles": []}
    date_col = _find_date_col(kpi)
    if not date_col:
        return {"tiles": [], "error": f"No date column. Columns: {list(kpi.columns)}"}
    META = [
        {"key": "dl_throughput_mbps_mean",       "label": "DL Throughput",   "unit": "Mbps", "good": "high"},
        {"key": "latency_ms_mean",                "label": "Latency",         "unit": "ms",   "good": "low"},
        {"key": "packet_loss_pct_mean",           "label": "Packet Loss",     "unit": "%",    "good": "low"},
        {"key": "call_drop_rate_mean",            "label": "Call Drop Rate",  "unit": "%",    "good": "low"},
        {"key": "data_qoe_score_mean",            "label": "Data QoE",        "unit": "/100", "good": "high"},
        {"key": "voice_qoe_score_mean",           "label": "Voice QoE",       "unit": "/100", "good": "high"},
        {"key": "data_session_success_rate_mean", "label": "Session Success", "unit": "%",    "good": "high"},
        {"key": "voice_quality_score_mos_mean",   "label": "MOS Score",       "unit": "/5",   "good": "high"},
    ]
    kpi = kpi.copy()
    kpi[date_col] = pd.to_datetime(kpi[date_col], errors="coerce")
    kpi = kpi.dropna(subset=[date_col])
    last  = kpi[date_col].max()
    last7 = kpi[kpi[date_col] >= last - pd.Timedelta(days=7)]
    prev7 = kpi[(kpi[date_col] >= last - pd.Timedelta(days=14)) &
                (kpi[date_col] <  last - pd.Timedelta(days=7))]
    tiles = []
    for m in META:
        if m["key"] not in kpi.columns: continue
        cur = float(last7[m["key"]].mean()) if not last7.empty else 0.0
        prv = float(prev7[m["key"]].mean()) if not prev7.empty else cur
        if any(map(lambda v: np.isnan(v) or np.isinf(v), [cur, prv])):
            cur, prv, delta = 0.0, 0.0, 0.0
        elif prv != 0:
            delta = (cur - prv) / prv * 100
        else:
            delta = 0.0
        tiles.append({"label": m["label"], "value": round(cur, 2), "unit": m["unit"],
                      "delta": round(delta, 2),
                      "good": (delta >= 0) if m["good"] == "high" else (delta <= 0)})
    return {"tiles": tiles}


@router.get("/kpi/heatmap")
async def kpi_heatmap(refresh: bool = Query(False)):
    kpi = load("kpi_daily_agg", refresh)
    if kpi.empty:
        return {"series": []}
    qoe_col = next((c for c in ["qoe_score_mean", "data_qoe_score_mean"] if c in kpi.columns), None)
    if not qoe_col:
        return {"series": [], "error": f"No QoE column. Columns: {list(kpi.columns)}"}
    region_col = _find_province_col(kpi) or "region"
    if region_col not in kpi.columns:
        return {"series": [], "error": "region/province column missing"}
    date_col = _find_date_col(kpi)
    if not date_col:
        return {"series": [], "error": f"No date column. Columns: {list(kpi.columns)}"}
    kpi = kpi.copy()
    kpi[date_col] = pd.to_datetime(kpi[date_col], errors="coerce")
    kpi = kpi.dropna(subset=[date_col])
    kpi["month"] = kpi[date_col].dt.strftime("%b %Y")
    pivot = kpi.groupby([region_col, "month"])[qoe_col].mean().reset_index()
    pivot.columns = ["region", "month", "qoe"]
    pivot["qoe"] = pivot["qoe"].round(1).replace([np.inf, -np.inf], np.nan)
    months = sorted(pivot["month"].unique().tolist())
    series = []
    for region in pivot["region"].unique():
        rd   = pivot[pivot["region"] == region]
        data = []
        for m in months:
            row = rd[rd["month"] == m]
            val = float(row["qoe"].values[0]) if not row.empty and pd.notna(row["qoe"].values[0]) else None
            data.append({"x": m, "y": val})
        series.append({"name": _clean_province(region), "data": data})
    return {"series": series, "months": months}


@router.get("/anomalies/summary")
async def anomalies_summary(refresh: bool = Query(False)):
    an = load("anomaly_results", refresh)
    if an.empty:
        return {"summary": {}}
    total     = int(an["anomaly_flag"].sum())      if "anomaly_flag"      in an.columns else 0
    consensus = int(an["anomaly_consensus"].sum()) if "anomaly_consensus" in an.columns else 0
    if_count  = int(an["if_anomaly"].sum())        if "if_anomaly"        in an.columns else 0
    stat_cnt  = int(an["stat_anomaly"].sum())      if "stat_anomaly"      in an.columns else 0
    rate      = round(an["anomaly_flag"].mean() * 100, 1) if "anomaly_flag" in an.columns else 0
    top_regions: list = []
    if "region" in an.columns and "anomaly_flag" in an.columns:
        top_regions = (an[an["anomaly_flag"] == 1].groupby("region")["anomaly_flag"].sum()
                       .sort_values(ascending=False).head(5).reset_index()
                       .rename(columns={"anomaly_flag": "count"}).to_dict(orient="records"))
    consensus_events: list = []
    if "anomaly_consensus" in an.columns:
        cols = [c for c in ["region", "date", "combined_score", "top_anomaly_driver", "if_severity"]
                if c in an.columns]
        consensus_events = safe_dict(an[an["anomaly_consensus"] == 1][cols]
                                     .sort_values("combined_score", ascending=False).head(14))
    return {"summary": {"total": total, "if_count": if_count, "stat_count": stat_cnt,
                         "consensus": consensus, "rate_pct": rate,
                         "top_regions": top_regions, "consensus_events": consensus_events}}


@router.get("/anomalies/timeline")
async def anomalies_timeline(region: str | None = None, refresh: bool = Query(False)):
    an = load("anomaly_results", refresh)
    if an.empty:
        return {"timeline": []}
    if region and "region" in an.columns:
        an = an[an["region"] == region]
    date_col = _find_date_col(an)
    cols = [c for c in ["combined_score", "anomaly_flag", "if_severity", "top_anomaly_driver"]
            if c in an.columns]
    if date_col:
        cols = [date_col] + cols
    df = an[cols].sort_values(date_col) if date_col else an[cols]
    if "combined_score" in df.columns:
        df = df.copy()
        df["combined_score"] = df["combined_score"].round(4)
    return {"timeline": safe_dict(df)}


@router.get("/anomalies/regions")
async def anomaly_regions(refresh: bool = Query(False)):
    an = load("anomaly_results", refresh)
    if an.empty or "region" not in an.columns:
        return {"regions": []}
    return {"regions": sorted(an["region"].unique().tolist())}


@router.get("/segments/profiles")
async def segment_profiles(refresh: bool = Query(False)):
    km = load("kmeans_users", refresh)
    if km.empty or "kmeans_cluster" not in km.columns:
        return {"profiles": [], "scatter": [], "n_clusters": 0}
    num_cols = [c for c in km.select_dtypes(include=[np.number]).columns
                if c not in ("kmeans_cluster", "pca_x", "pca_y", "id")]
    profiles = []
    for cid in sorted(km["kmeans_cluster"].unique()):
        cdf = km[km["kmeans_cluster"] == cid]
        p   = {"cluster_id": int(cid), "n_users": int(len(cdf)),
               "pct": round(len(cdf) / len(km) * 100, 1)}
        for col in num_cols[:10]:
            p[col] = round(float(cdf[col].mean()), 3)
        profiles.append(p)
    pca_cols = [c for c in ["pca_x", "pca_y", "kmeans_cluster"] if c in km.columns]
    scatter  = km[pca_cols].sample(min(2000, len(km)), random_state=42) if pca_cols else pd.DataFrame()
    pca_var = silhouette = dbi = db_clusters = db_noise = None
    pca_pkl = Path("models/clustering/pca.pkl")
    if pca_pkl.exists():
        try:
            import joblib
            pca_var = round(float(joblib.load(str(pca_pkl)).explained_variance_ratio_.sum() * 100), 1)
        except Exception as exc:
            logger.warning("pca.pkl: %s", exc)
    feat_cols = [c for c in km.select_dtypes(include=[np.number]).columns
                 if c not in ("kmeans_cluster", "pca_x", "pca_y")]
    if feat_cols and km["kmeans_cluster"].nunique() > 1:
        try:
            from sklearn.metrics import silhouette_score, davies_bouldin_score
            X, y = km[feat_cols].fillna(0).values, km["kmeans_cluster"].values
            if len(X) > 5000:
                idx = np.random.default_rng(42).choice(len(X), 5000, replace=False)
                X, y = X[idx], y[idx]
            silhouette = round(float(silhouette_score(X, y)), 3)
            dbi        = round(float(davies_bouldin_score(X, y)), 3)
        except Exception as exc:
            logger.warning("silhouette/DBI: %s", exc)
    db_path = Path("models/clustering/dbscan_users.parquet")
    if db_path.exists():
        try:
            db_labels   = pd.read_parquet(str(db_path))["dbscan_cluster"].values
            db_clusters = int(len(set(db_labels)) - (1 if -1 in db_labels else 0))
            db_noise    = int((db_labels == -1).sum())
        except Exception as exc:
            logger.warning("dbscan: %s", exc)
    return {"profiles": profiles, "scatter": safe_dict(scatter), "kpi_columns": num_cols[:6],
            "n_clusters": len(profiles), "silhouette_score": silhouette, "davies_bouldin": dbi,
            "pca_variance_pct": pca_var, "dbscan_clusters": db_clusters, "dbscan_noise": db_noise}


@router.get("/segments/region-distribution")
async def segment_region_distribution(refresh: bool = Query(False)):
    km = load("kmeans_users", refresh)
    if km.empty or "kmeans_cluster" not in km.columns or "region" not in km.columns:
        return {"distribution": []}
    cross = (pd.crosstab(km["region"], km["kmeans_cluster"], normalize="index")
             .mul(100).round(1).reset_index())
    cross.columns = ["region"] + [f"cluster_{c}" for c in cross.columns[1:]]
    return {"distribution": safe_dict(cross)}



@router.get("/segments/complaints/profiles")
async def complaint_segment_profiles(refresh: bool = Query(False)):
    """
    Dataset 1 — Complaint segmentation by sub_category.
    Returns the same shape as /segments/profiles so UserSegments.jsx
    can display both tabs without changing its chart logic.
    """
    try:
        cc = None
        for p in [Path("data/outputs/complaints_clean.parquet"),
                  Path("data/processed/complaints_clean.parquet"),
                  Path("data/complaints_clean.parquet")]:
            if p.exists():
                cc = pd.read_parquet(p)
                cc.columns = cc.columns.str.lower().str.strip()
                break
        if cc is None:
            return {"profiles": [], "scatter": [], "n_clusters": 0,
                    "message": "complaints_clean.parquet not found — run NB01"}

        # ── Segment column: sub_category (9 classes) preferred ──────
        seg_col = next((c for c in ["sub_category","sub_sub_category","category",
                                     "complaint_type","segment","typology"]
                        if c in cc.columns and cc[c].nunique() > 1), None)
        if seg_col is None:
            return {"profiles": [], "scatter": [], "n_clusters": 0,
                    "message": "No suitable segmentation column found in complaints_clean"}

        # ── Province column ──────────────────────────────────────────
        prov_col = next((c for c in ["province","region","city","wilaya"] if c in cc.columns), None)

        # ── Build profiles ───────────────────────────────────────────
        total = len(cc)
        profiles = []
        for cid, (seg_val, grp) in enumerate(cc.groupby(seg_col)):
            # Numeric KPI features per segment
            profile: dict = {
                "cluster_id":    cid,
                "cluster_label": str(seg_val),
                "n_users":       int(len(grp)),
                "pct":           round(len(grp) / total * 100, 1),
            }
            # Temporal features
            for col in ["month", "day_of_week", "quarter", "week_num"]:
                if col in grp.columns:
                    profile[col] = round(float(grp[col].mean()), 2)
            # Resolution
            if "is_unresolved" in grp.columns:
                profile["unresolved_rate"] = round(float(grp["is_unresolved"].mean()) * 100, 1)
            # Priority numeric if available
            if "priority" in grp.columns:
                try:
                    profile["priority_mean"] = round(float(
                        pd.to_numeric(grp["priority"], errors="coerce").mean()), 2)
                except Exception:
                    pass
            profiles.append(profile)

        # ── Numeric KPI columns available across all profiles ────────
        kpi_cols = [c for c in ["month","day_of_week","quarter","week_num",
                                  "unresolved_rate","priority_mean"]
                    if c in profiles[0]]

        # ── Scatter: 2D via month × day_of_week (simple, no PCA needed) ─
        scatter = []
        if "month" in cc.columns and "day_of_week" in cc.columns:
            enc_col = cc[seg_col].astype("category").cat.codes
            sample  = cc.sample(min(2000, len(cc)), random_state=42)
            enc_sample = enc_col.loc[sample.index]
            scatter = [
                {"pca_x": float(row["month"]),
                 "pca_y": float(row["day_of_week"]),
                 "kmeans_cluster": int(enc_sample.loc[idx])}
                for idx, row in sample.iterrows()
                if pd.notna(row.get("month")) and pd.notna(row.get("day_of_week"))
            ]

        # ── Silhouette-like: use unresolved_rate variance as proxy ──
        unresolved_vals = [p.get("unresolved_rate", 0) for p in profiles]
        variance_proxy  = round(float(pd.Series(unresolved_vals).std()), 3) if len(unresolved_vals) > 1 else None

        return {
            "profiles":         profiles,
            "scatter":          scatter,
            "kpi_columns":      kpi_cols,
            "n_clusters":       len(profiles),
            "segment_column":   seg_col,
            "silhouette_score": variance_proxy,   # repurposed: unresolved variance
            "davies_bouldin":   None,
            "pca_variance_pct": None,
            "dbscan_clusters":  None,
            "dbscan_noise":     None,
            "total_complaints": total,
            "dataset":          "Dataset 1 — complaints_clean.parquet",
        }
    except Exception as exc:
        logger.exception("complaint_segment_profiles error")
        return {"profiles": [], "scatter": [], "n_clusters": 0, "error": str(exc)}


@router.get("/segments/complaints/region-distribution")
async def complaint_region_distribution(refresh: bool = Query(False)):
    """
    Dataset 1 — Complaint sub_category distribution per province.
    Returns same shape as /segments/region-distribution.
    """
    try:
        cc = None
        for p in [Path("data/outputs/complaints_clean.parquet"),
                  Path("data/processed/complaints_clean.parquet"),
                  Path("data/complaints_clean.parquet")]:
            if p.exists():
                cc = pd.read_parquet(p)
                cc.columns = cc.columns.str.lower().str.strip()
                break
        if cc is None:
            return {"distribution": []}

        seg_col  = next((c for c in ["sub_category","category","complaint_type","segment"]
                         if c in cc.columns and cc[c].nunique() > 1), None)
        prov_col = next((c for c in ["province","region","city"] if c in cc.columns), None)

        if not seg_col or not prov_col:
            return {"distribution": []}

        # Drop nulls in province
        cc_valid = cc.dropna(subset=[prov_col])
        cross = (pd.crosstab(cc_valid[prov_col], cc_valid[seg_col], normalize="index")
                 .mul(100).round(1).reset_index())
        # Rename columns to cluster_N shape (keeps JSX chart logic intact)
        seg_vals  = [c for c in cross.columns if c != prov_col]
        rename_map = {sv: f"cluster_{i}" for i, sv in enumerate(seg_vals)}
        cross = cross.rename(columns={prov_col: "region", **rename_map})

        # Store label map so frontend can show real names
        cluster_labels = {f"cluster_{i}": sv for i, sv in enumerate(seg_vals)}

        return {
            "distribution":   safe_dict(cross),
            "cluster_labels": cluster_labels,
            "segment_column": seg_col,
            "province_column": prov_col,
        }
    except Exception as exc:
        logger.exception("complaint_region_distribution error")
        return {"distribution": []}


@router.delete("/root-cause/reset")
async def root_cause_reset():
    """
    Delete stale root_cause_results.json so a fresh NB08a run can replace it.
    Call this if the dashboard shows 1-class / F1=1.0 after re-running the notebook.
    """
    json_path = Path("models/classification/root_cause_results.json")
    if not json_path.exists():
        return {"deleted": False, "message": "File does not exist"}
    try:
        d = json.load(open(json_path, encoding="utf-8"))
        n_cls  = len(d.get("classes", []))
        xgb_f1 = d.get("xgb_report", {}).get("f1_macro", 0) or 0
        if n_cls <= 1 or xgb_f1 >= 1.0:
            json_path.unlink()
            return {
                "deleted": True,
                "message": f"Deleted stale JSON ({n_cls} class, F1={xgb_f1}). Re-run NB08a."
            }
        return {
            "deleted": False,
            "message": f"JSON is valid ({n_cls} classes, F1={xgb_f1:.4f}). Not deleted."
        }
    except Exception as exc:
        return {"deleted": False, "message": str(exc)}

@router.get("/root-cause/results")
async def root_cause_results(refresh: bool = Query(False)):
    json_path = Path("models/classification/root_cause_results.json")
    if json_path.exists():
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        # Reject stale single-class trivial models (typology=NETWORK artefact)
        n_cls  = len(data.get("classes", []))
        xgb_f1 = data.get("xgb_report", {}).get("f1_macro", 0) or 0
        if n_cls <= 1 or xgb_f1 >= 1.0:
            data["_stale"] = True
            data["_stale_reason"] = (
                f"{n_cls} class(es), F1={xgb_f1:.4f}. "
                "Re-run 08a with PRIMARY_TARGET=\'sub_category\'."
            )
        return data
    rf_path   = Path("models/classification/random_forest.pkl")
    xgb_path  = Path("models/classification/xgboost_classifier.pkl")
    le_path   = Path("models/classification/label_encoder.pkl")
    feat_path = Path("models/classification/feature_cols.pkl")
    if not all(p.exists() for p in [rf_path, xgb_path, le_path]):
        return {"best_model": None, "rf_report": {}, "xgb_report": {}, "classes": [],
                "feature_importance": [], "confusion_matrices": {},
                "message": "Run Notebook 05 to generate model files"}
    try:
        import joblib
        rf           = joblib.load(str(rf_path))
        xgb_model    = joblib.load(str(xgb_path))
        le           = joblib.load(str(le_path))
        feature_cols = joblib.load(str(feat_path)) if feat_path.exists() else []
        rf_imps  = list(getattr(rf,        "feature_importances_", []))
        xgb_imps = list(getattr(xgb_model, "feature_importances_", []))
        fi = []
        for i, feat in enumerate(feature_cols):
            a = float(rf_imps[i])  if i < len(rf_imps)  else 0.0
            b = float(xgb_imps[i]) if i < len(xgb_imps) else 0.0
            fi.append({"feature": feat, "importance_rf": round(a, 5),
                       "importance_xgb": round(b, 5), "importance_mean": round((a + b) / 2, 5)})
        fi.sort(key=lambda x: x["importance_mean"], reverse=True)
        return {"best_model": "xgboost", "classes": list(le.classes_),
                "rf_report": {}, "xgb_report": {}, "feature_importance": fi,
                "confusion_matrices": {}, "message": "Partial — run full notebook for metrics"}
    except Exception as exc:
        logger.exception("root_cause_results error")
        return {"best_model": None, "rf_report": {}, "xgb_report": {}, "classes": [],
                "feature_importance": [], "confusion_matrices": {}, "message": f"Error: {exc}"}


@router.get("/root-cause/5g")
async def root_cause_5g(refresh: bool = Query(False)):
    """
    5G Root Cause Analysis — answers "what is causing 5G problems?"

    Joins three datasets:
      • churn_features.parquet  → KPI values + ratio_5g per subscriber
      • anomaly_results.parquet → top_anomaly_driver per subscriber (from NB07)
      • churn_scores.parquet    → risk_level + churn_probability

    Returns:
      top_causes        — ranked list of root cause drivers for 5G subscribers
      by_province       — dominant root cause per governorate
       kpi_profile      — mean KPI values: all subscribers vs 5G subscribers
      high_risk_5g      — top 20 high-risk 5G subscribers with their root cause
      thresholds        — network benchmark values for each KPI
      summary           — total 5G subscribers, % affected, consensus anomaly rate
    """
    try:
        # ── Load data ──────────────────────────────────────────────────
        feat_df   = None
        scores_df = None
        anom_df   = None

        for p in [Path("data/outputs/churn_features.parquet"),
                  Path("data/processed/churn_features.parquet")]:
            if p.exists():
                feat_df = pd.read_parquet(p)
                feat_df.columns = feat_df.columns.str.lower()
                break

        for p in [Path("data/outputs/churn_scores.parquet"),
                  Path("models/churn_scores.parquet")]:
            if p.exists():
                scores_df = pd.read_parquet(p)
                scores_df.columns = scores_df.columns.str.lower()
                break

        for p in [Path("models/anomaly/anomaly_results.parquet"),
                  Path("data/outputs/anomaly_results.parquet")]:
            if p.exists():
                anom_df = pd.read_parquet(p)
                anom_df.columns = anom_df.columns.str.lower()
                break

        if feat_df is None:
            return {"error": "churn_features.parquet not found — run NB04",
                    "top_causes": [], "by_province": [], "kpi_profile": {},
                    "high_risk_5g": [], "thresholds": {}, "summary": {}}

        # ── Province name map ──────────────────────────────────────────
        province_map: dict = {}
        for lep in [Path("models/le_province.pkl"), Path("models/churn_le_province.pkl")]:
            if lep.exists():
                import joblib as _jl
                le_prov = _jl.load(str(lep))
                province_map = {i: n for i, n in enumerate(le_prov.classes_)}
                break
        if not province_map:
            _TN = ["Ariana","Béja","Ben Arous","Bizerte","Gabès","Gafsa",
                   "Jendouba","Kairouan","Kasserine","Kébili","Kef","Mahdia",
                   "Manouba","Médenine","Monastir","Nabeul","Sfax","Sidi Bouzid",
                   "Siliana","Sousse","Tataouine","Tozeur","Tunis","Zaghouan"]
            province_map = {i: n for i, n in enumerate(_TN)}

        # ── KPI columns available ──────────────────────────────────────
        KPI_COLS = [c for c in [
            "avg_latency_ms", "avg_packet_loss", "client_rtt_ms",
            "voip_quality", "congestion_level", "session_active_rate",
            "traffic_diversity", "nightly_ratio", "social_ratio",
            "gaming_ratio", "brand_churn_rate",
        ] if c in feat_df.columns]

        ratio_col  = "ratio_5g"   if "ratio_5g"   in feat_df.columns else None
        traffic_col = "traffic_5g" if "traffic_5g" in feat_df.columns else None

        # ── 5G threshold: subscribers with ratio_5g > 0.1 (meaningful usage) ──
        RATIO_THRESHOLD = 0.10
        if ratio_col:
            mask_5g = feat_df[ratio_col] > RATIO_THRESHOLD
        else:
            mask_5g = pd.Series(True, index=feat_df.index)

        feat_5g  = feat_df[mask_5g].copy()
        feat_all = feat_df.copy()

        # ── Merge anomaly driver if available ─────────────────────────
        if anom_df is not None and "msisdn" in feat_df.columns and "msisdn" in anom_df.columns:
            anom_cols = ["msisdn", "top_anomaly_driver", "if_severity",
                         "combined_score", "anomaly_consensus"]
            anom_cols = [c for c in anom_cols if c in anom_df.columns]
            feat_5g = feat_5g.merge(
                anom_df[anom_cols].rename(columns={"top_anomaly_driver": "root_cause",
                                                    "if_severity":         "anom_severity"}),
                on="msisdn", how="left"
            )
        elif "top_anomaly_driver" in feat_df.columns:
            feat_5g = feat_5g.rename(columns={"top_anomaly_driver": "root_cause"})

        # ── Merge churn scores ─────────────────────────────────────────
        if scores_df is not None and "msisdn" in feat_df.columns and "msisdn" in scores_df.columns:
            prob_col = "churn_probability" if "churn_probability" in scores_df.columns \
                       else "churn_prob"   if "churn_prob"        in scores_df.columns else None
            score_cols = ["msisdn"] + ([prob_col] if prob_col else []) + \
                         (["risk_level"] if "risk_level" in scores_df.columns else [])
            feat_5g = feat_5g.merge(
                scores_df[score_cols], on="msisdn", how="left"
            )

        # ── 1. TOP CAUSES ──────────────────────────────────────────────
        top_causes: list[dict] = []
        if "root_cause" in feat_5g.columns:
            rc = feat_5g["root_cause"].dropna()
            rc = rc[rc != ""]
            counts = rc.value_counts()
            total_flagged = int((feat_5g.get("anomaly_consensus", pd.Series(0)) == 1).sum()) or \
                            int(rc.shape[0])
            for cause, cnt in counts.head(10).items():
                # Friendly label: 'avg_latency_ms' → 'High Latency'
                label_map = {
                    "avg_latency_ms":      "High Latency",
                    "avg_packet_loss":     "Packet Loss",
                    "client_rtt_ms":       "High RTT",
                    "voip_quality":        "Poor VoIP Quality",
                    "ratio_5g":            "Low 5G Adoption",
                    "traffic_5g":          "Low 5G Traffic",
                    "session_active_rate": "Low Session Activity",
                    "congestion_level":    "Network Congestion",
                    "traffic_diversity":   "Low Traffic Diversity",
                    "social_ratio":        "High Social Traffic",
                    "gaming_ratio":        "High Gaming Traffic",
                    "nightly_ratio":       "Abnormal Night Usage",
                    "brand_churn_rate":    "High-Churn Device Brand",
                    "duration":            "Short Session Duration",
                    "total_traffic":       "Low Total Traffic",
                }
                top_causes.append({
                    "cause":       str(cause),
                    "label":       label_map.get(str(cause), str(cause).replace("_", " ").title()),
                    "count":       int(cnt),
                    "pct":         round(float(cnt) / max(len(feat_5g), 1) * 100, 1),
                    "action":      _rca_action(str(cause)),
                })
        else:
            # Fallback: use KPI deviation as proxy for root cause
            for col in KPI_COLS[:6]:
                mu_all = float(feat_all[col].mean()) if col in feat_all.columns else 0
                mu_5g  = float(feat_5g[col].mean())  if col in feat_5g.columns else 0
                deviation = abs(mu_5g - mu_all) / (abs(mu_all) + 1e-8) * 100
                if deviation > 10:
                    top_causes.append({
                        "cause":    col,
                        "label":    col.replace("_", " ").title(),
                        "count":    int(mask_5g.sum()),
                        # Fallback pct = KPI deviation %, capped at 100.
                        # Not a frequency count — shows how much 5G subscribers
                        # deviate from network average for this KPI.
                        "pct":      min(round(deviation, 1), 100.0),
                        "action":   _rca_action(col),
                        "fallback": True,
                    })
            top_causes.sort(key=lambda x: x["pct"], reverse=True)

        # ── 2. BY PROVINCE ─────────────────────────────────────────────
        by_province: list[dict] = []
        prov_col = next((c for c in feat_5g.columns if "province" in c.lower()), None)
        if prov_col and "root_cause" in feat_5g.columns:
            for enc, grp in feat_5g.groupby(prov_col):
                rc_in_prov = grp["root_cause"].dropna()
                rc_in_prov = rc_in_prov[rc_in_prov != ""]
                top_rc = rc_in_prov.value_counts().index[0] if len(rc_in_prov) else "Unknown"
                by_province.append({
                    "province":         province_map.get(int(enc), f"Province {enc}"),
                    "province_id":      int(enc),
                    "subscribers_5g":   int(len(grp)),
                    "top_cause":        str(top_rc),
                    "top_cause_label":  str(top_rc).replace("_", " ").title(),
                    "anomaly_rate":     round(float(grp.get("anomaly_consensus",
                                               pd.Series(0)).mean()), 4),
                    "avg_ratio_5g":     round(float(grp[ratio_col].mean()), 4) if ratio_col else None,
                })
            by_province.sort(key=lambda x: x["subscribers_5g"], reverse=True)

        # ── 3. KPI PROFILE — 5G subscribers vs all subscribers ─────────
        kpi_profile: dict = {}
        for col in KPI_COLS:
            if col in feat_5g.columns and col in feat_all.columns:
                kpi_profile[col] = {
                    "label":       col.replace("_", " ").title(),
                    "all_mean":    round(float(feat_all[col].mean()),  4),
                    "5g_mean":     round(float(feat_5g[col].mean()),   4),
                    "all_median":  round(float(feat_all[col].median()), 4),
                    "5g_median":   round(float(feat_5g[col].median()),  4),
                    "unit":        _kpi_unit(col),
                    "good_is":     "low" if col in {"avg_latency_ms", "avg_packet_loss",
                                                     "client_rtt_ms", "congestion_level"} else "high",
                }

        # ── 4. HIGH-RISK 5G SUBSCRIBERS ───────────────────────────────
        high_risk_5g: list[dict] = []
        if "risk_level" in feat_5g.columns:
            hi = feat_5g[feat_5g["risk_level"].isin(["CRITICAL", "HIGH", "Critical", "High"])]
        elif "churn_probability" in feat_5g.columns:
            hi = feat_5g[feat_5g["churn_probability"] >= 0.50]
        else:
            hi = feat_5g.head(20)

        if ratio_col:
            hi = hi.sort_values(ratio_col, ascending=False)

        prob_col_local = next((c for c in ["churn_probability","churn_prob"] if c in hi.columns), None)

        # NB08b SHAP fallback: when anomaly merge failed, fill root_cause
        # from the top SHAP driver for Critical+High 5G (NB08b output)
        shap_fallback_cause = ""
        _nb08b_path = Path("models/classification/rca_5g_results.json")
        if _nb08b_path.exists():
            try:
                import json as _json_inner
                _nb08b_data = _json_inner.load(open(_nb08b_path, encoding="utf-8"))
                _hi_causes  = _nb08b_data.get("top_5g_hi_root_causes", [])
                if _hi_causes:
                    shap_fallback_cause = _hi_causes[0].get("feature", "")
            except Exception:
                pass

        for _, row in hi.head(20).iterrows():
            _rc = str(row.get("root_cause", ""))
            if not _rc or _rc in ("", "nan", "None", "—", "nan"):
                _rc = shap_fallback_cause  # use NB08b SHAP driver as fallback
            entry = {
                "msisdn":      str(row.get("msisdn", "—")),
                "ratio_5g":    round(float(row[ratio_col]), 3) if ratio_col else None,
                "root_cause":  _rc or "—",
                "risk_level":  str(row.get("risk_level", "—")),
                "churn_prob":  round(float(row[prob_col_local]), 3) if prob_col_local else None,
                "action":      _rca_action(_rc),
            }
            # Add top 3 KPI values for context
            for col in KPI_COLS[:3]:
                if col in row.index:
                    entry[col] = round(float(row[col]), 4) if pd.notna(row[col]) else None
            high_risk_5g.append(entry)

        # ── 5. THRESHOLDS ──────────────────────────────────────────────
        thresholds: dict = {}
        for col in KPI_COLS:
            if col in feat_all.columns:
                thresholds[col] = {
                    "p50":   round(float(feat_all[col].quantile(0.50)), 4),
                    "p75":   round(float(feat_all[col].quantile(0.75)), 4),
                    "p90":   round(float(feat_all[col].quantile(0.90)), 4),
                    "p95":   round(float(feat_all[col].quantile(0.95)), 4),
                    "unit":  _kpi_unit(col),
                    "good_is": "low" if col in {"avg_latency_ms", "avg_packet_loss",
                                                 "client_rtt_ms", "congestion_level"} else "high",
                }

        # ── 6. SUMMARY ─────────────────────────────────────────────────
        n_total  = len(feat_df)
        n_5g     = len(feat_5g)
        n_anom   = int(feat_5g.get("anomaly_consensus", pd.Series(0)).sum()) if "anomaly_consensus" in feat_5g.columns else 0
        summary  = {
            "total_subscribers":    n_total,
            "subscribers_5g":       n_5g,
            "pct_5g":               round(n_5g / max(n_total, 1) * 100, 1),
            "ratio_threshold":      RATIO_THRESHOLD,
            "consensus_anomalies":  n_anom,
            "pct_anomalous":        round(n_anom / max(n_5g, 1) * 100, 1),
            "top_cause":            top_causes[0]["label"] if top_causes else "Unknown",
            "top_cause_key":        top_causes[0]["cause"] if top_causes else "",
            "provinces_analysed":   len(by_province),
            "kpi_cols_available":   KPI_COLS,
        }

        # ── Merge NB08b SHAP results if available ─────────────────────
        # rca_5g_results.json is produced by 08b_RootCauseAnalysis_5G.ipynb
        nb08b: dict = {}
        for p in [Path("models/classification/rca_5g_results.json"),
                  Path("data/outputs/rca_5g_results.json")]:
            if p.exists():
                with open(p, encoding="utf-8") as fh:
                    nb08b = json.load(fh)
                break

        return {
            "summary":               summary,
            "top_causes":            top_causes,
            "by_province":           by_province,
            "kpi_profile":           kpi_profile,
            "high_risk_5g":          high_risk_5g,
            "thresholds":            thresholds,
            "shap_per_risk_level":   nb08b.get("shap_per_risk_level",   {}),
            "top_5g_root_causes":    nb08b.get("top_5g_root_causes",    []),
            "top_5g_hi_root_causes": nb08b.get("top_5g_hi_root_causes", []),
            "nb08b_available":       bool(nb08b),
        }

    except Exception as exc:
        logger.exception("root_cause_5g error")
        return {"error": str(exc), "top_causes": [], "by_province": [],
                "kpi_profile": {}, "high_risk_5g": [], "thresholds": {}, "summary": {}}


def _rca_action(cause: str) -> str:
    """Map root cause feature → NOC recommended action."""
    actions = {
        "avg_latency_ms":      "Check backhaul congestion · Optimize routing path",
        "avg_packet_loss":     "Inspect radio link quality · Check interference",
        "client_rtt_ms":       "Investigate end-to-end path · Check DNS latency",
        "voip_quality":        "Prioritise voice bearer · Check codec negotiation",
        "ratio_5g":            "Deploy 5G NR coverage · Promote 5G-capable devices",
        "traffic_5g":          "Increase 5G cell capacity · Check NR configuration",
        "session_active_rate": "Review idle timer · Check bearer release policy",
        "congestion_level":    "Load-balance traffic · Add cell capacity",
        "traffic_diversity":   "Review QoS policy · Check service steering",
        "social_ratio":        "Monitor traffic shaping · Check fair-use policy",
        "gaming_ratio":        "Review gaming latency SLA · Check QoS priority",
        "nightly_ratio":       "Audit night maintenance windows · Check SON",
        "brand_churn_rate":    "Target device upgrade campaign for this brand",
        "duration":            "Review session continuity · Check handover config",
        "total_traffic":       "Review data plan · Check account status",
    }
    return actions.get(cause, "Investigate with NOC team · Collect drive test data")


def _kpi_unit(col: str) -> str:
    units = {
        "avg_latency_ms":  "ms",
        "client_rtt_ms":   "ms",
        "avg_packet_loss": "%",
        "voip_quality":    "/100",
        "session_active_rate": "%",
        "congestion_level":    "level",
        "traffic_5g":      "bytes",
        "ratio_5g":        "%",
    }
    return units.get(col, "")


@router.get("/status")
async def status():
    out = {}
    for k, p in PATHS.items():
        cached_df, ts = _cache.get(k, (None, None))
        age  = round(time.monotonic() - ts, 1) if ts else None
        info = {"exists": p.exists(), "path": str(p),
                "cached": cached_df is not None and not cached_df.empty,
                "cache_age": f"{age}s" if age is not None else "not cached"}
        if cached_df is not None and not cached_df.empty:
            info["columns"]   = list(cached_df.columns)
            info["row_count"] = len(cached_df)
        elif p.exists():
            try:
                import pyarrow.parquet as pq
                info["columns"] = pq.read_schema(str(p)).names
            except Exception:
                info["columns"] = "unreadable"
        out[k] = info
    return out


# ═══════════════════════════════════════════════════════════════════════
# ROUTER 2 — Churn Intelligence (/api/churn/* and /api/forecast/*)
# Dataset 2: KPI outputs from NB02/NB05/NB06
# ═══════════════════════════════════════════════════════════════════════
churn_router = APIRouter(tags=["Churn Intelligence"])


@churn_router.get("/api/churn/model-summary")
def churn_model_summary():
    p = Path("data/outputs/model_results.json")
    if not p.exists():
        raise HTTPException(404, "model_results.json not found — run NB05")
    with open(p) as f:
        return json.load(f)


@churn_router.get("/api/churn/high-risk")
def churn_high_risk(limit: int = 500):
    p = Path("data/outputs/churn_scores.parquet")
    if not p.exists():
        raise HTTPException(404, "churn_scores.parquet not found — run NB05")
    df = pd.read_parquet(p)
    df = df.sort_values("churn_probability", ascending=False).head(limit)
    return {"customers": safe_dict(df)}


@churn_router.get("/api/churn/predict/{msisdn}")
def churn_predict(msisdn: str):
    p = Path("data/outputs/churn_scores.parquet")
    if not p.exists():
        raise HTTPException(404, "churn_scores.parquet not found — run NB05")
    df  = pd.read_parquet(p)
    row = df[df["msisdn"].astype(str) == msisdn]
    if row.empty:
        raise HTTPException(404, f"MSISDN {msisdn} not found")
    rec = row.iloc[0].to_dict()
    return {k: (None if isinstance(v, float) and np.isnan(v) else
                int(v)   if isinstance(v, np.integer)  else
                float(v) if isinstance(v, np.floating) else v)
            for k, v in rec.items()}


@churn_router.get("/api/churn/shap")
def churn_shap():
    p = Path("data/outputs/shap_results.json")
    if not p.exists():
        raise HTTPException(404, "shap_results.json not found — run NB06")
    with open(p) as f:
        return json.load(f)


@churn_router.get("/api/forecast/5g")
def forecast_5g():
    p = Path("models/prediction/forecasts.parquet")
    if not p.exists():
        raise HTTPException(404, "forecasts.parquet not found — run NB02")
    df = pd.read_parquet(p)
    if "target" in df.columns:
        df = df[df["target"].str.lower().str.contains("5g", na=False)].copy()
    df["is_forecast"] = True
    if "forecast" in df.columns and "value" not in df.columns:
        df = df.rename(columns={"forecast": "value"})
    keep = [c for c in ["date", "value", "is_forecast", "region", "model"] if c in df.columns]
    return {"series": safe_dict(df[keep])}


@churn_router.get("/api/forecast/brand")
def forecast_brand():
    scores_path = Path("data/outputs/churn_scores.parquet")
    if not scores_path.exists():
        raise HTTPException(404, "churn_scores.parquet not found — run NB05")
    df = pd.read_parquet(scores_path)
    if "traffic_5g" not in df.columns:
        raise HTTPException(404, "traffic_5g column not in churn_scores")
    top = (df.groupby("risk_level")["traffic_5g"]
             .agg(forecast="mean", count="count")
             .reset_index()
             .rename(columns={"risk_level": "brand"}))
    return {"brands": safe_dict(top)}


@churn_router.get("/api/brand/performance")
def brand_performance():
    feat_path = Path("data/processed/churn_features.parquet")
    le_path   = Path("models/le_brand.pkl")
    if not feat_path.exists():
        raise HTTPException(404, "churn_features.parquet not found — run NB04")
    if not le_path.exists():
        raise HTTPException(404, "le_brand.pkl not found — run NB04")
    import joblib
    feat = pd.read_parquet(feat_path)
    feat.columns = feat.columns.str.lower()
    le   = joblib.load(str(le_path))
    feat["brand_name"] = le.inverse_transform(feat["brand_encoded"].astype(int))
    GEN_MAP = {1: "2G", 2: "3G", 3: "3G", 4: "4G", 5: "5G"}
    rows = []
    for brand_name, grp in feat.groupby("brand_name"):
        total         = len(grp)
        gen_breakdown = {}
        if "generation_numeric" in grp.columns:
            for code, label in GEN_MAP.items():
                frac = (grp["generation_numeric"] == code).sum() / max(total, 1)
                if frac > 0:
                    gen_breakdown[label] = round(float(frac), 3)
        rows.append({
            "brand_name":       brand_name,
            "customer_count":   int(total),
            "churn_rate":       round(float(grp["churn"].mean()), 4)          if "churn"          in grp.columns else None,
            "ratio_5g_mean":    round(float(grp["ratio_5g"].mean()), 4)       if "ratio_5g"       in grp.columns else None,
            "traffic_5g_mean":  round(float(grp["traffic_5g"].mean()), 2)     if "traffic_5g"     in grp.columns else None,
            "duration_mean":    round(float(grp["duration"].mean()), 1)       if "duration"       in grp.columns else None,
            "brand_churn_rate": round(float(grp["brand_churn_rate"].mean()), 4) if "brand_churn_rate" in grp.columns else None,
            "is_5g_capable":    bool((grp["is_5g_capable"] > 0).any())        if "is_5g_capable"  in grp.columns else False,
            "gen_breakdown":    gen_breakdown,
        })
    rows.sort(key=lambda x: x["customer_count"], reverse=True)
    return {"brands": rows, "total_brands": len(rows)}


# ═══════════════════════════════════════════════════════════════════════
# APP ASSEMBLY
# ═══════════════════════════════════════════════════════════════════════
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from src.nlp.auth_api import init_db
        init_db()
        logger.info("Auth DB initialised")
    except Exception as exc:
        logger.warning("Auth DB init failed (non-fatal): %s", exc)
    yield
    _cache.clear()
    logger.info("Cache cleared on shutdown")


app = FastAPI(title="SpiriComp Analytics API", version="2.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def audit_request_middleware(request: Request, call_next):
    from starlette.middleware.base import _StreamingResponse  # noqa: F401
    response = await call_next(request)
    method   = request.method
    path     = request.url.path
    skip_paths = ("/docs", "/redoc", "/openapi.json", "/favicon.ico")
    if method == "OPTIONS" or any(path.startswith(p) for p in skip_paths):
        return response
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return response
    actor = "unknown"
    try:
        import base64, json as _json
        token   = auth_header.split(" ", 1)[1]
        payload = _json.loads(base64.b64decode(token.split(".")[1] + "==").decode())
        actor   = payload.get("sub", payload.get("username", "unknown"))
    except Exception:
        pass

    def _action_label(m: str, p: str) -> str:
        if "/login"          in p: return "login"
        if "/logout"         in p: return "logout"
        if "/nlp/complaints" in p and m == "POST":   return "submit_complaint"
        if "/nlp/complaints" in p and m == "PATCH":  return "update_complaint_status"
        if "/nlp/complaints" in p and m == "DELETE": return "delete_complaint"
        if "/admin/users"    in p and m == "POST":   return "create_user"
        if "/admin/users"    in p and m == "PATCH":  return "update_user"
        if "/admin/users"    in p and m == "DELETE": return "delete_user"
        if "/admin/logs"     in p: return "view_logs"
        if "/admin/system"   in p: return "view_system"
        if "/ai/chat"        in p: return "ai_chat"
        if "/messages"       in p and m == "POST": return "send_message"
        if "/analytics/"     in p and m == "GET":
            return f"view_{p.split('/analytics/')[-1].split('/')[0]}"
        return f"{m.lower()}_{p.split('/')[-1] or 'root'}"

    action   = _action_label(method, path)
    status_c = response.status_code
    log_gets = any(kw in path for kw in ("/nlp/", "/admin/", "/messages", "/ai/"))
    if method != "GET" or log_gets:
        log_action = None
        for mod in ("src.nlp.auth_api", "src.api.auth_api"):
            try:
                import importlib as _il
                log_action = _il.import_module(mod).log_action
                break
            except Exception:
                pass
        if log_action:
            ip = request.headers.get("X-Forwarded-For", "")
            ip = ip.split(",")[0].strip() if ip else (
                request.client.host if request.client else "unknown"
            )
            log_action(actor=actor, action=action, target_user=None, ip=ip,
                       status="success" if status_c < 400 else "failed",
                       detail=f"HTTP {status_c} · {method} {path}")
    return response


from starlette.exceptions import HTTPException as StarletteHTTPException


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail},
                        headers={"Access-Control-Allow-Origin": "*"})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s", request.url.path)
    return JSONResponse(status_code=500,
                        content={"detail": str(exc), "path": str(request.url.path)},
                        headers={"Access-Control-Allow-Origin": "*"})



# ════════════════════════════════════════════════════════════════════
# 5G COVERAGE & ADOPTION  GET /api/coverage/5g
# Source: churn_features.parquet (ratio_5g, traffic_5g, is_5g_capable,
#         generation_numeric, brand_encoded, province_encoded,
#         province_churn_rate, avg_latency_ms, avg_packet_loss)
# ════════════════════════════════════════════════════════════════════

@churn_router.get("/api/coverage/5g")
def coverage_5g():
    """
    Full 5G adoption & coverage intelligence module.
    Returns all data needed by the Forecasting page 5G Coverage section:
      - KPI summary  (adoption rate, capable devices, traffic split)
      - By-province  (avg ratio_5g per governorate → bar chart + coverage gap table)
      - By-brand     (avg ratio_5g + is_5g_capable per brand)
      - Generation mix (2G/3G/4G/5G device breakdown)
      - 5G vs 4G performance (latency, packet_loss grouped by 5G usage)
      - Coverage gap alerts  (provinces: low ratio_5g + high churn_rate)
      - Engaged 5G churners  (high ratio_5g + CRITICAL/HIGH risk)
    """
    try:
        # ── Load churn_features.parquet ──────────────────────────────
        for p in [Path("data/outputs/churn_features.parquet"),
                  Path("data/processed/churn_features.parquet"),
                  Path("models/churn_features.parquet")]:
            if p.exists():
                df = pd.read_parquet(str(p))
                df.columns = df.columns.str.lower()
                break
        else:
            raise HTTPException(404, "churn_features.parquet not found — run NB04")

        # ── Load brand encoder if available ───────────────────────────
        brand_map: dict = {}
        for lep in [Path("models/le_brand.pkl"), Path("models/churn_le_brand.pkl")]:
            if lep.exists():
                import joblib as _jl
                le = _jl.load(str(lep))
                brand_map = {i: n for i, n in enumerate(le.classes_)}
                break

        # ── Load province encoder → real governorate names ────────────
        # models/le_province.pkl  (LabelEncoder saved in NB04/NB05)
        # Maps province_encoded integer → actual Tunisian governorate name
        province_map: dict = {}
        for lep in [Path("models/le_province.pkl"), Path("models/churn_le_province.pkl")]:
            if lep.exists():
                import joblib as _jl
                le_prov = _jl.load(str(lep))
                province_map = {i: n for i, n in enumerate(le_prov.classes_)}
                logger.info("Province encoder loaded: %d governorates", len(province_map))
                break

        if not province_map:
            # Fallback: standard 24 Tunisian governorates in alphabetical order
            # (matches sklearn LabelEncoder default alphabetical encoding)
            _TN_GOVS = [
                "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès",
                "Gafsa", "Jendouba", "Kairouan", "Kasserine", "Kébili",
                "Kef", "Mahdia", "Manouba", "Médenine", "Monastir",
                "Nabeul", "Sfax", "Sidi Bouzid", "Siliana", "Sousse",
                "Tataouine", "Tozeur", "Tunis", "Zaghouan",
            ]
            province_map = {i: name for i, name in enumerate(_TN_GOVS)}
            logger.warning(
                "le_province.pkl not found — using alphabetical fallback mapping. "
                "Run NB04 and ensure models/le_province.pkl is saved."
            )

        # ── Load churn scores for risk_level ─────────────────────────
        scores_df: pd.DataFrame | None = None
        for sp in [Path("data/outputs/churn_scores.parquet"),
                   Path("models/churn_scores.parquet")]:
            if sp.exists():
                scores_df = pd.read_parquet(str(sp))
                scores_df.columns = scores_df.columns.str.lower()
                break

        n_total = len(df)

        # ── 1. KPI summary ────────────────────────────────────────────
        ratio_col    = "ratio_5g"       if "ratio_5g"       in df.columns else None
        traffic_col  = "traffic_5g"     if "traffic_5g"     in df.columns else None
        capable_col  = "is_5g_capable"  if "is_5g_capable"  in df.columns else None
        gen_col      = "generation_numeric" if "generation_numeric" in df.columns else None

        adoption_rate  = round(float(df[ratio_col].mean()) * 100, 2) if ratio_col else None
        capable_pct    = round(float((df[capable_col] > 0).mean()) * 100, 1) if capable_col else None
        avg_5g_traffic = round(float(df[traffic_col].mean()), 2) if traffic_col else None
        total_traffic  = round(float(df[traffic_col].sum()), 0) if traffic_col else None

        # 5G vs non-5G split
        if ratio_col:
            has_5g  = (df[ratio_col] > 0).sum()
            no_5g   = (df[ratio_col] == 0).sum()
        else:
            has_5g = no_5g = 0

        kpi_summary = {
            "total_subscribers":   n_total,
            "adoption_rate_pct":   adoption_rate,
            "capable_devices_pct": capable_pct,
            "avg_5g_traffic":      avg_5g_traffic,
            "total_5g_traffic":    total_traffic,
            "subscribers_using_5g":int(has_5g),
            "subscribers_no_5g":   int(no_5g),
        }

        # ── 2. Adoption by province ───────────────────────────────────
        prov_col   = "province_encoded"   if "province_encoded"   in df.columns else None
        pchurn_col = "province_churn_rate" if "province_churn_rate" in df.columns else None

        province_data: list[dict] = []
        if prov_col and ratio_col:
            grp = df.groupby(prov_col).agg(
                subscribers      = (prov_col,   "count"),
                avg_ratio_5g     = (ratio_col,  "mean"),
                avg_traffic_5g   = (traffic_col,"mean") if traffic_col else (prov_col,"count"),
                avg_churn_rate   = (pchurn_col, "mean") if pchurn_col else (prov_col,"count"),
            ).reset_index()
            grp = grp.sort_values("avg_ratio_5g", ascending=False)
            for _, row in grp.iterrows():
                enc = int(row[prov_col])
                province_data.append({
                    "province":     province_map.get(enc, f"Province {enc}"),  # real name
                    "province_id":  enc,                                        # keep int for reference
                    "subscribers":  int(row["subscribers"]),
                    "ratio_5g_pct": round(float(row["avg_ratio_5g"]) * 100, 2),
                    "traffic_5g":   round(float(row.get("avg_traffic_5g", 0)), 2),
                    "churn_rate":   round(float(row.get("avg_churn_rate",  0)), 4),
                })

        # ── 3. Adoption by brand ──────────────────────────────────────
        brand_col = "brand_encoded" if "brand_encoded" in df.columns else None
        brand_data: list[dict] = []
        if brand_col and ratio_col:
            bgrp = df.groupby(brand_col).agg(
                subscribers  = (brand_col,  "count"),
                avg_ratio_5g = (ratio_col,  "mean"),
                capable_pct  = (capable_col,"mean") if capable_col else (brand_col,"count"),
                churn_rate   = ("brand_churn_rate","mean") if "brand_churn_rate" in df.columns
                               else (brand_col,"count"),
            ).reset_index()
            bgrp = bgrp.sort_values("avg_ratio_5g", ascending=False)
            for _, row in bgrp.iterrows():
                bid = int(row[brand_col])
                brand_data.append({
                    "brand_id":     bid,
                    "brand_name":   brand_map.get(bid, f"Brand {bid}"),
                    "subscribers":  int(row["subscribers"]),
                    "ratio_5g_pct": round(float(row["avg_ratio_5g"]) * 100, 2),
                    "capable_pct":  round(float(row.get("capable_pct", 0)) * 100, 1),
                    "churn_rate":   round(float(row.get("churn_rate", 0)), 4),
                })

        # ── 4. Generation mix ─────────────────────────────────────────
        GEN_LABEL = {1:"2G", 2:"3G", 3:"3G", 4:"4G", 5:"5G"}
        gen_mix: list[dict] = []
        if gen_col:
            gc = df[gen_col].value_counts().sort_index()
            for g, cnt in gc.items():
                gen_mix.append({
                    "generation": GEN_LABEL.get(int(g), f"{g}G"),
                    "count":      int(cnt),
                    "pct":        round(cnt / n_total * 100, 1),
                })

        # ── 5. 5G vs 4G/non-5G performance ───────────────────────────
        perf_comparison: dict = {}
        if ratio_col and "avg_latency_ms" in df.columns:
            mask_5g   = df[ratio_col] > 0.1   # mostly 5G
            mask_4g   = df[ratio_col] <= 0.1  # little/no 5G
            def perf_stats(mask: pd.Series) -> dict:
                sub = df[mask]
                return {
                    "count":         int(mask.sum()),
                    "avg_latency":   round(float(sub["avg_latency_ms"].mean()), 2)  if "avg_latency_ms"  in sub else None,
                    "avg_pkt_loss":  round(float(sub["avg_packet_loss"].mean()), 4) if "avg_packet_loss" in sub else None,
                    "avg_rtt":       round(float(sub["client_rtt_ms"].mean()), 2)   if "client_rtt_ms"   in sub else None,
                    "churn_rate":    round(float(sub[pchurn_col].mean()), 4)         if pchurn_col and pchurn_col in sub else None,
                }
            perf_comparison = {
                "mostly_5g":     perf_stats(mask_5g),
                "mostly_4g":     perf_stats(mask_4g),
                "threshold_used":"ratio_5g > 0.1",
            }

        # ── 6. Coverage gap alerts ────────────────────────────────────
        # Province with: low 5G adoption AND high churn rate = underserved
        coverage_gaps: list[dict] = []
        if province_data:
            for p in province_data:
                gap_score = (1 - p["ratio_5g_pct"] / 100) * p.get("churn_rate", 0)
                p["gap_score"] = round(gap_score, 4)
            coverage_gaps = sorted(
                [p for p in province_data if p["ratio_5g_pct"] < 15],
                key=lambda x: x.get("gap_score", 0), reverse=True
            )[:8]

        # ── 7. Engaged 5G churners ────────────────────────────────────
        # High ratio_5g + CRITICAL/HIGH risk → special retention cohort
        engaged_churners: list[dict] = []
        if scores_df is not None and ratio_col and "risk_level" in scores_df.columns:
            merge_key = "msisdn" if "msisdn" in df.columns and "msisdn" in scores_df.columns else None
            if merge_key:
                # FIX: rename right-side columns before merge to avoid pandas
                # collision suffixes (_x/_y) when scores_df already has ratio_5g.
                # We extract only what we need from df and give it unambiguous names.
                right_cols = [merge_key, ratio_col]
                if traffic_col and traffic_col != ratio_col:
                    right_cols.append(traffic_col)
                right = df[right_cols].rename(columns={
                    ratio_col:   "cf_ratio_5g",
                    traffic_col: "cf_traffic_5g",
                } if traffic_col and traffic_col != ratio_col else {
                    ratio_col: "cf_ratio_5g",
                })
                merged = scores_df.merge(right, on=merge_key, how="left")

                # Use the renamed column — no collision possible
                cf_ratio = "cf_ratio_5g"
                mask = (
                    merged["risk_level"].isin(["CRITICAL", "HIGH"]) &
                    (merged[cf_ratio].fillna(0) > 0.3)
                )
                # Detect actual probability column name (churn_probability or churn_prob)
                prob_col = (
                    "churn_probability" if "churn_probability" in merged.columns
                    else "churn_prob"   if "churn_prob"        in merged.columns
                    else None
                )
                if prob_col:
                    top = merged[mask].nlargest(20, prob_col)[
                        [merge_key, prob_col, "risk_level", cf_ratio]
                    ]
                    for _, row in top.iterrows():
                        engaged_churners.append({
                            "msisdn":     str(row[merge_key]),
                            "churn_prob": round(float(row[prob_col]), 3),
                            "risk_level": row["risk_level"],
                            "ratio_5g":   round(float(row[cf_ratio]) if pd.notna(row[cf_ratio]) else 0.0, 3),
                        })
                else:
                    logger.warning("coverage_5g: no churn probability column found in scores_df")

        return {
            "kpi":              kpi_summary,
            "by_province":      province_data,
            "by_brand":         brand_data,
            "generation_mix":   gen_mix,
            "performance":      perf_comparison,
            "coverage_gaps":    coverage_gaps,
            "engaged_churners": engaged_churners,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("coverage_5g failed")
        raise HTTPException(500, f"5G coverage error: {exc}") from exc


# ── Router registration ──────────────────────────────────────────────
try:
    from src.api.notifications import router as notif_router
    app.include_router(notif_router)
    logger.info("Notification routes registered")
except Exception as exc:
    logger.warning("Notifications not available: %s", exc)

app.include_router(router)        # /api/analytics/*
app.include_router(churn_router)  # /api/churn/* + /api/forecast/* + /api/brand/*
logger.info("Analytics + Churn routers registered")

_auth_registered = _admin_registered = False
for _auth_module in ("src.nlp.auth_api", "src.api.auth_api"):
    try:
        import importlib as _il
        _m = _il.import_module(_auth_module)
        app.include_router(getattr(_m, "router"))
        _auth_registered = True
        logger.info("Auth routes registered → /api/auth/* (from %s)", _auth_module)
        if hasattr(_m, "admin_router"):
            app.include_router(getattr(_m, "admin_router"))
            _admin_registered = True
            logger.info("Admin routes registered → /api/admin/* (from %s)", _auth_module)
        else:
            logger.error("admin_router NOT FOUND in %s", _auth_module)
        break
    except Exception as _exc:
        logger.warning("Could not load %s: %s", _auth_module, _exc)

if not _auth_registered:  logger.error("AUTH ROUTES NOT REGISTERED")
if not _admin_registered: logger.error("ADMIN ROUTES NOT REGISTERED")

for _mod, _attr, _label in [
    ("src.api.ai_api",        "ai_router",  "AI routes → /api/ai/*"),
    ("src.api.messaging_api", "msg_router", "Messaging routes → /api/messages/*"),
]:
    try:
        import importlib as _il2
        app.include_router(getattr(_il2.import_module(_mod), _attr))
        logger.info(_label)
    except Exception as exc:
        logger.warning("%s not available: %s", _mod, exc)

try:
    from src.nlp.nlp_api import router as nlp_router
    app.include_router(nlp_router)
    logger.info("NLP routes registered — complaints form active")
except Exception as exc:
    logger.warning("NLP module not available: %s", exc)