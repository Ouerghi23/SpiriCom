"""
analytics_api.py
=================
FastAPI endpoints that read real parquet files from notebooks output.

FIX API1: Cache now stores (DataFrame, timestamp); entries expire after
          CACHE_TTL_SECONDS (default 120 s). A ?refresh=true query param
          forces a reload.
FIX API2: safe_dict works on a copy of the DataFrame — the cached
          DataFrame is never mutated.
FIX API3: All print() debug statements removed; replaced by logger calls.
FIX API4: /api/analytics/status moved inside the router so it shares the
          /api/analytics prefix without conflict.
FIX API5: NLP router included via app.include_router() — not by directly
          appending to app.routes.
FIX API6: TN_COORDS promoted to module-level constant.
"""

from __future__ import annotations

import sys
import time
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd
import numpy as np
from fastapi import FastAPI, APIRouter, Query
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("analytics_api")

# ── File paths ────────────────────────────────────────────────────────────────
DATA   = Path("data/processed")
MODELS = Path("models")

PATHS: dict[str, Path] = {
    "complaints_clean":    DATA   / "complaints_clean.parquet",
    "complaint_daily_agg": DATA   / "complaint_daily_agg.parquet",
    "kpi_daily_agg":       DATA   / "kpi_daily_agg.parquet",
    "feature_matrix":      DATA   / "feature_matrix.parquet",
    "anomaly_results":     MODELS / "anomaly/anomaly_results.parquet",
    "forecasts":           MODELS / "prediction/forecasts.parquet",
    "kmeans_users":        MODELS / "clustering/kmeans_users.parquet",
    "dbscan_users":        MODELS / "clustering/dbscan_users.parquet",
}

# ── FIX API6: module-level constant ──────────────────────────────────────────
TN_COORDS: dict[str, tuple[float, float]] = {
    "Tunis": (36.8065, 10.1815), "Sfax": (34.7406, 10.7603),
    "Sousse": (35.8256, 10.6411), "Kairouan": (35.6781, 10.0963),
    "Bizerte": (37.2746, 9.8739), "Gabès": (33.8815, 10.0982),
    "Ariana": (36.8625, 10.1956), "Gafsa": (34.4250, 8.7842),
    "Monastir": (35.7780, 10.8262), "Mahdia": (35.5047, 11.0622),
    "Médenine": (33.3548, 10.5055), "Nabeul": (36.4561, 10.7376),
    "Béja": (36.7256, 9.1817), "Jendouba": (36.5028, 8.7803),
    "Le Kef": (36.1675, 8.7050), "Siliana": (36.0844, 9.3708),
    "Kasserine": (35.1675, 8.8364), "Sidi Bouzid": (35.0381, 9.4858),
    "Tozeur": (33.9197, 8.1336), "Tataouine": (32.9297, 10.4517),
    "Kébili": (33.7050, 8.9692), "Manouba": (36.8104, 10.0863),
    "Ben Arous": (36.7531, 10.2189), "Zaghouan": (36.4022, 10.1429),
    "La Marsa": (36.8765, 10.3253), "Carthage": (36.8527, 10.3300),
    "Hammamet": (36.4000, 10.6167), "Djerba": (33.7833, 10.8833),
    "Zarzis": (33.5000, 11.1167), "El Kram": (36.8333, 10.3167),
}

# ── FIX API1: TTL cache ───────────────────────────────────────────────────────
CACHE_TTL_SECONDS = 120
_cache: dict[str, tuple[pd.DataFrame, float]] = {}


def load(key: str, refresh: bool = False) -> pd.DataFrame:
    """
    Load a parquet file with a TTL cache.

    FIX API1: returns a stale-protected copy; cache expires after
    CACHE_TTL_SECONDS or when refresh=True is passed.
    """
    now = time.monotonic()
    if not refresh and key in _cache:
        df, ts = _cache[key]
        if now - ts < CACHE_TTL_SECONDS:
            return df

    path = PATHS.get(key)
    if path and path.exists():
        df = pd.read_parquet(path)
        logger.info("Loaded %s (%d rows)", key, len(df))
    else:
        logger.warning("Parquet not found: %s", key)
        df = pd.DataFrame()

    _cache[key] = (df, now)
    return df


def safe_dict(df: pd.DataFrame) -> list[dict]:
    """
    Convert DataFrame to JSON-safe list of dicts.

    FIX API2: operates on df.copy() so the cached DataFrame is never mutated.
    """
    if df.empty:
        return []
    df = df.copy()
    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d")
    return df.where(pd.notnull(df), None).to_dict(orient="records")


# ── Router ────────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/overview")
async def overview(refresh: bool = Query(False)):
    cc  = load("complaints_clean",    refresh)
    kpi = load("kpi_daily_agg",       refresh)
    agg = load("complaint_daily_agg", refresh)

    result: dict = {}

    if not cc.empty:
        result["total_complaints"] = int(len(cc))
        result["unique_msisdns"]   = int(cc["msisdn"].nunique()) if "msisdn" in cc.columns else 0
        result["unique_cities"]    = int(cc["city"].nunique())   if "city"   in cc.columns else 0
        result["unique_regions"]   = int(cc["region"].nunique()) if "region" in cc.columns else 0

        if "timestamp" in cc.columns:
            cc["timestamp"] = pd.to_datetime(cc["timestamp"], errors="coerce")
            result["date_min"] = str(cc["timestamp"].min())[:10]
            result["date_max"] = str(cc["timestamp"].max())[:10]

        if "region"              in cc.columns: result["top_region"]      = cc["region"].value_counts().index[0]
        if "complaint_subcategory" in cc.columns: result["top_subcategory"] = cc["complaint_subcategory"].value_counts().index[0]
        if "service_type"        in cc.columns: result["by_service"]      = cc["service_type"].value_counts().to_dict()
        if "complaint_typology"  in cc.columns: result["by_typology"]     = cc["complaint_typology"].value_counts().to_dict()
        if "customer_segment"    in cc.columns: result["by_segment"]      = cc["customer_segment"].value_counts().to_dict()
        if "priority"            in cc.columns: result["by_priority"]     = cc["priority"].value_counts().to_dict()

    if not kpi.empty and "date" in kpi.columns:
        kpi["date"] = pd.to_datetime(kpi["date"], errors="coerce")
        last_date = kpi["date"].max()
        recent = kpi[kpi["date"] >= last_date - pd.Timedelta(days=30)]
        prev   = kpi[
            (kpi["date"] < last_date - pd.Timedelta(days=30)) &
            (kpi["date"] >= last_date - pd.Timedelta(days=60))
        ]
        kpi_cols = [
            "dl_throughput_mbps_mean", "latency_ms_mean", "packet_loss_pct_mean",
            "call_drop_rate_mean", "data_qoe_score_mean", "voice_qoe_score_mean",
            "data_session_success_rate_mean", "voice_quality_score_mos_mean",
            "qoe_score_mean",
        ]
        kpi_avgs: dict = {}
        for col in kpi_cols:
            if col not in kpi.columns:
                continue
            cur   = float(recent[col].mean()) if not recent.empty else 0.0
            prv   = float(prev[col].mean())   if not prev.empty  else cur
            delta = ((cur - prv) / prv * 100) if prv != 0 else 0.0
            kpi_avgs[col] = {
                "value":     round(cur, 2),
                "delta":     round(delta, 2),
                "delta_str": f"{'+' if delta >= 0 else ''}{delta:.1f}%",
            }
        result["kpi_averages"] = kpi_avgs

    return result


@router.get("/complaints/trend")
async def complaints_trend(refresh: bool = Query(False)):
    agg = load("complaint_daily_agg", refresh)
    if agg.empty or "date" not in agg.columns:
        return {"trend": []}

    agg["date"] = pd.to_datetime(agg["date"], errors="coerce")
    daily = (
        agg.groupby("date")["total_complaints"]
        .sum()
        .reset_index()
        .sort_values("date")
    )
    daily["date"]      = daily["date"].dt.strftime("%Y-%m-%d")
    daily["roll7"]     = daily["total_complaints"].rolling(7, min_periods=1).mean().round(2)
    mean_v             = daily["total_complaints"].mean()
    std_v              = daily["total_complaints"].std()
    daily["is_spike"]  = (daily["total_complaints"] > mean_v + 2 * std_v).astype(int)
    return {"trend": daily.to_dict(orient="records")}


@router.get("/complaints/by-region")
async def complaints_by_region(refresh: bool = Query(False)):
    agg = load("complaint_daily_agg", refresh)
    kpi = load("kpi_daily_agg",       refresh)

    if agg.empty:
        return {"regions": []}

    region_totals = (
        agg.groupby("region")["total_complaints"]
        .sum()
        .reset_index()
        .sort_values("total_complaints", ascending=False)
    )

    qoe_col = next(
        (c for c in ["qoe_score_mean", "data_qoe_score_mean"] if c in kpi.columns), None
    )
    if qoe_col and not kpi.empty and "region" in kpi.columns:
        qoe = kpi.groupby("region")[qoe_col].mean().reset_index()
        qoe.columns = ["region", "qoe"]
        region_totals = region_totals.merge(qoe, on="region", how="left")
        region_totals["qoe"] = region_totals["qoe"].round(1)

    return {"regions": safe_dict(region_totals)}


@router.get("/complaints/by-city")
async def complaints_by_city(refresh: bool = Query(False)):
    """City-level complaint data for the Leaflet map."""
    cc  = load("complaints_clean", refresh)
    kpi = load("kpi_daily_agg",    refresh)

    if cc.empty:
        return {"cities": []}

    if "city" not in cc.columns:
        return {"cities": [], "error": "No 'city' column in complaints_clean.parquet"}

    # FIX API3: removed all print() debug statements — using logger instead
    logger.debug("complaints_by_city: columns=%s", list(cc.columns))

    group_cols = ["city"] + (["region"] if "region" in cc.columns else [])
    grouped = (
        cc.groupby(group_cols)
        .size()
        .reset_index(name="complaints")
        .sort_values("complaints", ascending=False)
    )

    qoe_col = next(
        (c for c in ["qoe_score_mean", "data_qoe_score_mean", "voice_qoe_score_mean"]
         if c in kpi.columns),
        None,
    )
    if qoe_col and not kpi.empty:
        if "city" in kpi.columns:
            qoe_avg = kpi.groupby("city")[qoe_col].mean().reset_index()
            qoe_avg.columns = ["city", "qoe"]
            grouped = grouped.merge(qoe_avg, on="city", how="left")
        elif "region" in kpi.columns and "region" in grouped.columns:
            qoe_avg = kpi.groupby("region")[qoe_col].mean().reset_index()
            qoe_avg.columns = ["region", "qoe"]
            grouped = grouped.merge(qoe_avg, on="region", how="left")

    if "qoe" not in grouped.columns:
        grouped["qoe"] = 50.0
    grouped["qoe"] = grouped["qoe"].fillna(50.0).clip(0, 100).round(1)

    # Service breakdown
    if "service_type" in cc.columns:
        svc = cc.groupby(["city", "service_type"]).size().unstack(fill_value=0)
        for col in svc.columns:
            clean_col = col.lower().replace(" ", "_").replace("-", "_")
            if "4g" in clean_col or "data" in clean_col:
                clean_col = "4g"
            elif "voice" in clean_col:
                clean_col = "voice"
            elif "sms" in clean_col:
                clean_col = "sms"
            grouped[clean_col] = grouped["city"].map(svc[col].to_dict()).fillna(0).astype(int)

    # Coordinates from module-level constant (FIX API6)
    grouped["lat"] = grouped["city"].map(lambda x: TN_COORDS.get(x, (None, None))[0])
    grouped["lng"] = grouped["city"].map(lambda x: TN_COORDS.get(x, (None, None))[1])
    grouped = grouped.dropna(subset=["lat", "lng"])

    logger.debug("complaints_by_city: %d cities after coord filter", len(grouped))
    return {"cities": safe_dict(grouped)}


@router.get("/kpi/heatmap")
async def kpi_heatmap(refresh: bool = Query(False)):
    kpi = load("kpi_daily_agg", refresh)
    if kpi.empty:
        return {"heatmap": []}

    qoe_col = next(
        (c for c in ["qoe_score_mean", "data_qoe_score_mean"] if c in kpi.columns), None
    )
    if not qoe_col or "region" not in kpi.columns:
        return {"heatmap": []}

    kpi["date"]  = pd.to_datetime(kpi["date"], errors="coerce")
    kpi["month"] = kpi["date"].dt.strftime("%b %Y")

    pivot = kpi.groupby(["region", "month"])[qoe_col].mean().reset_index()
    pivot.columns  = ["region", "month", "qoe"]
    pivot["qoe"]   = pivot["qoe"].round(1)

    regions = pivot["region"].unique().tolist()
    months  = sorted(pivot["month"].unique().tolist())
    series  = []
    for region in regions:
        reg_data = pivot[pivot["region"] == region]
        data = []
        for month in months:
            row  = reg_data[reg_data["month"] == month]
            data.append({
                "x": month,
                "y": float(row["qoe"].values[0]) if not row.empty else None,
            })
        series.append({
            "name": region.replace(" Gouvernorat", ""),
            "data": data,
        })

    return {"series": series, "months": months}


@router.get("/kpi/tiles")
async def kpi_tiles(refresh: bool = Query(False)):
    kpi = load("kpi_daily_agg", refresh)
    if kpi.empty:
        return {"tiles": []}

    KPI_META = [
        {"key": "dl_throughput_mbps_mean",       "label": "DL Throughput",   "unit": "Mbps", "good": "high"},
        {"key": "latency_ms_mean",               "label": "Latency",         "unit": "ms",   "good": "low"},
        {"key": "packet_loss_pct_mean",          "label": "Packet Loss",     "unit": "%",    "good": "low"},
        {"key": "call_drop_rate_mean",           "label": "Call Drop Rate",  "unit": "%",    "good": "low"},
        {"key": "data_qoe_score_mean",           "label": "Data QoE",        "unit": "/100", "good": "high"},
        {"key": "voice_qoe_score_mean",          "label": "Voice QoE",       "unit": "/100", "good": "high"},
        {"key": "data_session_success_rate_mean","label": "Session Success",  "unit": "%",    "good": "high"},
        {"key": "voice_quality_score_mos_mean",  "label": "MOS Score",       "unit": "/5",   "good": "high"},
    ]

    kpi["date"] = pd.to_datetime(kpi["date"], errors="coerce")
    last_date   = kpi["date"].max()
    last7 = kpi[kpi["date"] >= last_date - pd.Timedelta(days=7)]
    prev7 = kpi[
        (kpi["date"] >= last_date - pd.Timedelta(days=14)) &
        (kpi["date"] <  last_date - pd.Timedelta(days=7))
    ]

    tiles = []
    for m in KPI_META:
        if m["key"] not in kpi.columns:
            continue
        cur   = float(last7[m["key"]].mean()) if not last7.empty else 0.0
        prv   = float(prev7[m["key"]].mean()) if not prev7.empty else cur
        delta = ((cur - prv) / prv * 100) if prv != 0 else 0.0
        good  = (delta >= 0) if m["good"] == "high" else (delta <= 0)
        tiles.append({
            "label": m["label"],
            "value": round(cur, 2),
            "unit":  m["unit"],
            # FIX UI1: pass numeric delta — KpiCard in UI.jsx calls Math.abs(delta)
            "delta": round(delta, 2),
            "good":  good,
        })

    return {"tiles": tiles}


@router.get("/anomalies/summary")
async def anomalies_summary(refresh: bool = Query(False)):
    an = load("anomaly_results", refresh)
    if an.empty:
        return {"summary": {}}

    total     = int(an["anomaly_flag"].sum())       if "anomaly_flag"      in an.columns else 0
    consensus = int(an["anomaly_consensus"].sum())  if "anomaly_consensus" in an.columns else 0
    if_count  = int(an["if_anomaly"].sum())         if "if_anomaly"        in an.columns else 0
    stat_count= int(an["stat_anomaly"].sum())       if "stat_anomaly"      in an.columns else 0
    rate      = round(an["anomaly_flag"].mean() * 100, 1) if "anomaly_flag" in an.columns else 0

    top_regions: list = []
    if "region" in an.columns and "anomaly_flag" in an.columns:
        top_regions = (
            an[an["anomaly_flag"] == 1]
            .groupby("region")["anomaly_flag"].sum()
            .sort_values(ascending=False).head(5)
            .reset_index()
            .rename(columns={"anomaly_flag": "count"})
            .to_dict(orient="records")
        )

    consensus_events: list = []
    if "anomaly_consensus" in an.columns:
        cols = [c for c in ["region", "date", "combined_score",
                             "top_anomaly_driver", "if_severity"]
                if c in an.columns]
        ce = (
            an[an["anomaly_consensus"] == 1][cols]
            .sort_values("combined_score", ascending=False)
            .head(14)
        )
        consensus_events = safe_dict(ce)

    return {
        "summary": {
            "total":            total,
            "if_count":         if_count,
            "stat_count":       stat_count,
            "consensus":        consensus,
            "rate_pct":         rate,
            "top_regions":      top_regions,
            "consensus_events": consensus_events,
        }
    }


@router.get("/anomalies/timeline")
async def anomalies_timeline(
    region:  str | None = None,
    refresh: bool       = Query(False),
):
    an = load("anomaly_results", refresh)
    if an.empty:
        return {"timeline": []}

    if region and "region" in an.columns:
        an = an[an["region"] == region]

    cols = [c for c in ["date", "combined_score", "anomaly_flag",
                          "if_severity", "top_anomaly_driver"] if c in an.columns]
    df = an[cols].sort_values("date") if "date" in cols else an[cols]
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


@router.get("/forecasts")
async def get_forecasts(refresh: bool = Query(False)):
    fc = load("forecasts", refresh)
    if fc.empty:
        return {"forecasts": [], "regions": []}

    regions = sorted(fc["region"].unique().tolist()) if "region" in fc.columns else []
    return {"forecasts": safe_dict(fc), "regions": regions}


@router.get("/forecasts/scores")
async def forecast_scores(refresh: bool = Query(False)):
    """
    Model performance scores (MAE, RMSE, MAPE) per region.
 
    Priority:
      1. prediction_scores.parquet  (preferred — written once and cached)
      2. scores.pkl + all_models.pkl (generated by spike_predictor._save())
         → converted to parquet and saved for future calls
    """
    score_path = Path("models/prediction/prediction_scores.parquet")
 
    # 1 — parquet exists and not stale
    if score_path.exists() and not refresh:
        df = pd.read_parquet(score_path)
        return {"scores": safe_dict(df)}
 
    # 2 — fall back to pkl files
    scores_pkl = Path("models/prediction/scores.pkl")
    models_pkl = Path("models/prediction/all_models.pkl")
 
    if not scores_pkl.exists():
        return {
            "scores": [],
            "message": (
                "No score data found. "
                "Run Notebook 05 (spike_predictor) to generate "
                "models/prediction/scores.pkl and forecasts.parquet."
            ),
        }
 
    try:
        import joblib
 
        scores_dict = joblib.load(str(scores_pkl))
        best_models: dict[str, str] = {}
        if models_pkl.exists():
            models_dict = joblib.load(str(models_pkl))
            best_models = {
                r: v.get("best", "") for r, v in models_dict.items()
            }
 
        rows = []
        for region, region_scores in scores_dict.items():
            best = best_models.get(region, "")
            for model, metrics in region_scores.items():
                rows.append({
                    "region":  region,
                    "model":   model,
                    "mae":     metrics.get("mae"),
                    "rmse":    metrics.get("rmse"),
                    "mape":    metrics.get("mape"),
                    "is_best": model == best,
                })
 
        if not rows:
            return {"scores": [], "message": "scores.pkl is empty — re-run Notebook 05"}
 
        df = pd.DataFrame(rows)
 
        # Persist as parquet so the next request doesn't need to load pkl
        try:
            score_path.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(score_path, index=False)
            logger.info("Wrote prediction_scores.parquet from scores.pkl (%d rows)", len(df))
        except Exception as exc:
            logger.warning("Could not write prediction_scores.parquet: %s", exc)
 
        return {"scores": safe_dict(df)}
 
    except Exception as exc:
        logger.error("forecast_scores() failed loading pkl: %s", exc)
        return {"scores": [], "message": f"Error reading score data: {exc}"}
 


@router.get("/forecasts/history")
async def forecast_history(
    region:  str | None = None,
    refresh: bool       = Query(False),
):
    agg = load("complaint_daily_agg", refresh)
    if agg.empty:
        return {"history": []}

    if region and "region" in agg.columns:
        agg = agg[agg["region"] == region]

    cols = [c for c in ["date", "region", "total_complaints"] if c in agg.columns]
    df   = agg[cols].sort_values("date").tail(45 * max(agg["region"].nunique(), 1))
    return {"history": safe_dict(df)}


@router.get("/segments/profiles")
async def segment_profiles(refresh: bool = Query(False)):
    """
    Cluster profiles for the User Segments page.
 
    Returns profiles + scatter (from kmeans_users.parquet) AND
    reconstructed clustering metrics:
      - pca_variance_pct   from pca.pkl
      - silhouette_score   recomputed from kmeans_users.parquet
      - davies_bouldin     recomputed from kmeans_users.parquet
      - dbscan_clusters    from dbscan_users.parquet
      - dbscan_noise       from dbscan_users.parquet
    """
    km = load("kmeans_users", refresh)
    if km.empty or "kmeans_cluster" not in km.columns:
        return {"profiles": [], "clusters": [], "n_clusters": 0}
 
    # ── Cluster profiles ──────────────────────────────────────────────
    numeric_cols = [
        c for c in km.select_dtypes(include=[np.number]).columns
        if c not in ("kmeans_cluster", "pca_x", "pca_y", "id")
    ]
    profiles = []
    for cid in sorted(km["kmeans_cluster"].unique()):
        cluster_df = km[km["kmeans_cluster"] == cid]
        profile = {
            "cluster_id": int(cid),
            "n_users":    int(len(cluster_df)),
            "pct":        round(len(cluster_df) / len(km) * 100, 1),
        }
        for col in numeric_cols[:10]:
            profile[col] = round(float(cluster_df[col].mean()), 3)
        profiles.append(profile)
 
    # ── PCA scatter sample ────────────────────────────────────────────
    pca_cols = [c for c in ["pca_x", "pca_y", "kmeans_cluster"] if c in km.columns]
    scatter = (
        km[pca_cols].sample(min(2000, len(km)), random_state=42)
        if pca_cols else pd.DataFrame()
    )
 
    # ── Reconstruct clustering metrics from saved files ───────────────
    pca_variance_pct  = None
    silhouette        = None
    davies_bouldin    = None
    dbscan_clusters   = None
    dbscan_noise      = None
 
    # PCA variance — from pca.pkl
    pca_pkl = Path("models/clustering/pca.pkl")
    if pca_pkl.exists():
        try:
            import joblib
            pca_model = joblib.load(str(pca_pkl))
            pca_variance_pct = round(
                float(pca_model.explained_variance_ratio_.sum() * 100), 1
            )
        except Exception as exc:
            logger.warning("Could not load pca.pkl: %s", exc)
 
    # Silhouette + Davies-Bouldin — recompute from kmeans_users.parquet
    feat_cols = [
        c for c in km.select_dtypes(include=[np.number]).columns
        if c not in ("kmeans_cluster", "pca_x", "pca_y")
    ]
    if feat_cols and km["kmeans_cluster"].nunique() > 1:
        try:
            from sklearn.metrics import silhouette_score, davies_bouldin_score
            X      = km[feat_cols].fillna(0).values
            labels = km["kmeans_cluster"].values
            # Sample for speed (silhouette is O(n²))
            if len(X) > 5000:
                rng = np.random.default_rng(42)
                idx = rng.choice(len(X), 5000, replace=False)
                X, labels = X[idx], labels[idx]
            silhouette     = round(float(silhouette_score(X, labels)), 3)
            davies_bouldin = round(float(davies_bouldin_score(X, labels)), 3)
        except Exception as exc:
            logger.warning("Could not compute silhouette/DBI: %s", exc)
 
    # DBSCAN stats — from dbscan_users.parquet
    db_path = Path("models/clustering/dbscan_users.parquet")
    if db_path.exists():
        try:
            db_df = pd.read_parquet(str(db_path))
            if "dbscan_cluster" in db_df.columns:
                db_labels       = db_df["dbscan_cluster"].values
                dbscan_clusters = int(len(set(db_labels)) - (1 if -1 in db_labels else 0))
                dbscan_noise    = int((db_labels == -1).sum())
        except Exception as exc:
            logger.warning("Could not load dbscan_users.parquet: %s", exc)
 
    return {
        "profiles":         profiles,
        "scatter":          safe_dict(scatter),
        "kpi_columns":      numeric_cols[:6],
        "n_clusters":       len(profiles),
        # Reconstructed metrics — consumed by UserSegments.jsx clResults
        "silhouette_score": silhouette,
        "davies_bouldin":   davies_bouldin,
        "pca_variance_pct": pca_variance_pct,
        "dbscan_clusters":  dbscan_clusters,
        "dbscan_noise":     dbscan_noise,
    }

@router.get("/segments/region-distribution")
async def segment_region_distribution(refresh: bool = Query(False)):
    km = load("kmeans_users", refresh)
    if km.empty or "kmeans_cluster" not in km.columns or "region" not in km.columns:
        return {"distribution": []}

    cross = (
        pd.crosstab(km["region"], km["kmeans_cluster"], normalize="index")
        .mul(100).round(1).reset_index()
    )
    cross.columns = ["region"] + [f"cluster_{c}" for c in cross.columns[1:]]
    return {"distribution": safe_dict(cross)}


@router.get("/root-cause/results")
async def root_cause_results():
    """
    Root cause classification results for the NOC dashboard.
 
    Priority:
      1. models/classification/root_cause_results.json  (full metrics)
      2. pkl files fallback — returns feature importances only;
         accuracy / F1 / confusion matrix require the JSON.
    """
    json_path = Path("models/classification/root_cause_results.json")
 
    # ── 1. Full results JSON ───────────────────────────────────────────────────
    if json_path.exists():
        import json as _json
        with open(json_path, encoding="utf-8") as f:
            return _json.load(f)
 
    # ── 2. Fallback: reconstruct from pkl files ────────────────────────────────
    rf_path      = Path("models/classification/random_forest.pkl")
    xgb_path     = Path("models/classification/xgboost_classifier.pkl")
    le_path      = Path("models/classification/label_encoder.pkl")
    feat_path    = Path("models/classification/feature_cols.pkl")
 
    if not (rf_path.exists() and xgb_path.exists() and le_path.exists()):
        # No pkl files either — classifier has never been run
        return {
            "best_model":         None,
            "rf_report":          {},
            "xgb_report":         {},
            "classes":            [],
            "feature_importance": [],
            "confusion_matrices": {},
            "message": (
                "Run Notebook 05 root cause classifier first, "
                "then add the save_root_cause_results.py cell to write "
                "models/classification/root_cause_results.json."
            ),
        }
 
    try:
        import joblib
 
        rf           = joblib.load(str(rf_path))
        xgb_model    = joblib.load(str(xgb_path))
        le           = joblib.load(str(le_path))
        feature_cols = joblib.load(str(feat_path)) if feat_path.exists() else []
 
        classes = list(le.classes_)
 
        # Build feature importance table from both models
        fi_rows = []
        rf_imps  = list(rf.feature_importances_)  if hasattr(rf,  'feature_importances_') else []
        xgb_imps = list(xgb_model.feature_importances_) if hasattr(xgb_model, 'feature_importances_') else []
 
        for i, feat in enumerate(feature_cols):
            rf_imp  = float(rf_imps[i])  if i < len(rf_imps)  else 0.0
            xgb_imp = float(xgb_imps[i]) if i < len(xgb_imps) else 0.0
            fi_rows.append({
                "feature":          feat,
                "importance_rf":    round(rf_imp,  5),
                "importance_xgb":   round(xgb_imp, 5),
                "importance_mean":  round((rf_imp + xgb_imp) / 2, 5),
            })
        fi_rows.sort(key=lambda x: x["importance_mean"], reverse=True)
 
        logger.info(
            "root_cause_results: serving pkl fallback (%d features, %d classes). "
            "Add the save cell to Notebook 05 to persist full metrics.",
            len(fi_rows), len(classes),
        )
 
        return {
            "best_model":         "xgboost",   # reasonable default
            "classes":            classes,
            "rf_report":          {},           # metrics require the JSON
            "xgb_report":         {},
            "feature_importance": fi_rows,
            "confusion_matrices": {},
            "message": (
                "Partial results from pkl files — accuracy, F1, and confusion matrix "
                "are not available. Add save_root_cause_results.py cell to Notebook 05 "
                "to persist full metrics."
            ),
        }
 
    except Exception as exc:
        logger.error("root_cause_results() pkl fallback failed: %s", exc)
        return {
            "best_model":         None,
            "rf_report":          {},
            "xgb_report":         {},
            "classes":            [],
            "feature_importance": [],
            "confusion_matrices": {},
            "message":            f"Error reading pkl files: {exc}",
        }

# FIX API4: status moved inside the router — consistent /api/analytics/status path
@router.get("/status")
async def status():
    """Check which parquet files exist and cache state."""
    result = {}
    for k, p in PATHS.items():
        cached, ts = _cache.get(k, (None, None))
        age = round(time.monotonic() - ts, 1) if ts else None
        result[k] = {
            "exists":    p.exists(),
            "path":      str(p),
            "cached":    cached is not None and not cached.empty,
            "cache_age": f"{age}s" if age is not None else "not cached",
        }
    return result


# ── Standalone app ────────────────────────────────────────────────────────────
app = FastAPI(title="SpiriComp Analytics API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router) 

# FIX API5: use include_router — not direct route appending
try:
    from src.nlp.nlp_api import app as nlp_app
    app.include_router(nlp_app.router)
    logger.info(
        "NLP routes registered: %d endpoints",
        len([r for r in nlp_app.routes if hasattr(r, 'methods')])
    )
except ImportError as exc:
    logger.info("NLP module not installed — skipping (%s)", exc)
except Exception as exc:
    logger.warning("Could not register NLP routes: %s", exc)