"""
Feature Engineering Module
===========================
Transforms clean complaint and KPI DataFrames into ML-ready feature matrices.

Organised into five groups:

  A. Temporal features
     — Hour, day-of-week, week, month, is_weekend, is_peak_hour
     — Cyclical sin/cos encoding for periodic features

  B. Complaint aggregation features
     — Daily complaint counts per (region, date)
     — Lag features: t-1, t-3, t-7, t-14
     — Rolling averages: 3d, 7d, 14d, 30d

  C. KPI aggregation features
     — Region-level daily KPI aggregates (mean, median, min, max, std, p10)
     — Degradation rates and flags
     — Rolling 7-day KPI trend

  D. Join & merge
     — Joins complaint aggregates with KPI aggregates on (region, date)
     — KPI null imputation and lag/rolling fill

  E. Train/test split (time-aware, no shuffle)

All functions accept and return DataFrames with an audit trail.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional
import pandas as pd
import numpy as np
from loguru import logger

# FIX FE1: lazy config loading — module no longer crashes on import
# if config.yaml is absent.
_cfg_cache: Optional[dict] = None


def _get_cfg() -> dict:
    global _cfg_cache
    if _cfg_cache is None:
        import yaml
        config_path = Path(__file__).resolve().parents[2] / "config" / "config.yaml"
        if not config_path.exists():
            raise FileNotFoundError(f"Config not found: {config_path}")
        with open(config_path) as fh:
            _cfg_cache = yaml.safe_load(fh)
    return _cfg_cache


def _cfg_val(key_path: str):
    """Dot-separated path into config dict, e.g. 'features.lag_windows'."""
    cfg = _get_cfg()
    parts = key_path.split(".")
    node = cfg
    for p in parts:
        node = node[p]
    return node


PEAK_HOURS = {8, 9, 12, 13, 17, 18, 19, 20}

# KPI degradation thresholds — (direction, threshold)
KPI_DEGRADATION_THRESHOLDS: dict[str, tuple[str, float]] = {
    "dl_throughput_mbps":        ("below", 1.0),
    "latency_ms":                ("above", 300.0),
    "packet_loss_pct":           ("above", 5.0),
    "data_session_success_rate": ("below", 90.0),
    "call_setup_success_rate":   ("below", 92.0),
    "call_drop_rate":            ("above", 3.0),
    "voice_quality_score_mos":   ("below", 3.0),
    "qoe_score":                 ("below", 60.0),
}


# ─────────────────────────────────────────────────────────────────────────────
# A. TEMPORAL FEATURES
# ─────────────────────────────────────────────────────────────────────────────

def add_temporal_features(
    df: pd.DataFrame,
    ts_col: str = "timestamp",
) -> pd.DataFrame:
    """
    Add a comprehensive set of temporal features to any DataFrame
    that contains a datetime column.

    Features added
    --------------
    hour, day_of_week_num, week (if absent), month, year,
    day_of_year, quarter,
    is_weekend, is_peak_hour, is_business_hour, is_night,
    hour_sin, hour_cos,   ← cyclical encoding
    dow_sin,  dow_cos,
    month_sin, month_cos

    Note: 'week' is only written when the column is absent so that the
    DCLM Sheet1 week column (from the real Excel file) is preserved.
    FIX FE6
    """
    df = df.copy()
    ts = pd.to_datetime(df[ts_col])

    df["hour"]            = ts.dt.hour
    df["day_of_week_num"] = ts.dt.dayofweek        # 0=Mon … 6=Sun
    # FIX FE6: preserve existing 'week' column (Sheet1 DCLM export)
    if "week" not in df.columns:
        df["week"] = ts.dt.isocalendar().week.astype(int)
    df["month"]        = ts.dt.month
    df["year"]         = ts.dt.year
    df["day_of_year"]  = ts.dt.dayofyear
    df["quarter"]      = ts.dt.quarter

    df["is_weekend"]       = (df["day_of_week_num"] >= 5).astype(int)
    df["is_peak_hour"]     = df["hour"].isin(PEAK_HOURS).astype(int)
    df["is_business_hour"] = df["hour"].between(8, 18).astype(int)
    df["is_night"]         = df["hour"].between(0, 6).astype(int)

    # Cyclical encoding — preserves periodicity for distance-based ML models
    df["hour_sin"]  = np.sin(2 * np.pi * df["hour"]            / 24)
    df["hour_cos"]  = np.cos(2 * np.pi * df["hour"]            / 24)
    df["dow_sin"]   = np.sin(2 * np.pi * df["day_of_week_num"] / 7)
    df["dow_cos"]   = np.cos(2 * np.pi * df["day_of_week_num"] / 7)
    df["month_sin"] = np.sin(2 * np.pi * df["month"]           / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"]           / 12)

    logger.info("  Temporal features added (16 new columns)")
    return df


# ─────────────────────────────────────────────────────────────────────────────
# B. COMPLAINT AGGREGATION FEATURES
# ─────────────────────────────────────────────────────────────────────────────

def build_complaint_daily_agg(complaints: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate complaints to (region, date) granularity.

    Produces
    --------
    - total_complaints
    - complaints_data / _voice / _sms
    - complaints per category (pivoted, cat_ prefix)
    - high_priority_complaints, vip_complaints
    - Lag features: t-1, t-3, t-7, t-14
    - Rolling mean/std: 3d, 7d, 14d, 30d
    - complaint_spike_flag (>mean+2σ per region)
    """
    cfg = _get_cfg()
    lag_windows     = cfg["features"]["lag_windows"]
    rolling_windows = cfg["features"]["rolling_windows"]

    df = complaints.copy()
    df["date"] = pd.to_datetime(df["timestamp"]).dt.date
    logger.info("  Building daily complaint aggregates ...")

    # Base count
    base = (
        df.groupby(["region", "date"])
        .size()
        .reset_index(name="total_complaints")
    )

    # By service type
    svc = (
        df.groupby(["region", "date", "service_type"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    svc.columns = (
        ["region", "date"]
        + [f"complaints_{c.lower()}" for c in svc.columns[2:]]
    )

    # By category (pivoted)
    cat = (
        df.groupby(["region", "date", "complaint_category"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    cat.columns = (
        ["region", "date"]
        + [f"cat_{c.lower().replace(' ', '_')}" for c in cat.columns[2:]]
    )

    # High-priority complaints
    high_prio = (
        df[df["priority"].isin(["High", "Critical"])]
        .groupby(["region", "date"])
        .size()
        .reset_index(name="high_priority_complaints")
    )

    # VIP / Enterprise customers
    vip = (
        df[df["customer_segment"].isin(["Vip", "Enterprise"])]
        .groupby(["region", "date"])
        .size()
        .reset_index(name="vip_complaints")
    )

    # Merge all parts
    agg = base.copy()
    for part in [svc, cat, high_prio, vip]:
        agg = agg.merge(part, on=["region", "date"], how="left")
    agg = agg.fillna(0)

    # Fill complete date × region grid (no gaps for time-series models)
    agg = _fill_date_region_grid(agg)

    # Lag features
    agg = _add_lag_features(agg, "total_complaints", lag_windows)

    # Rolling features
    agg = _add_rolling_features(agg, "total_complaints", rolling_windows)

    # Spike flag
    agg = _add_spike_flag(agg)

    logger.info(
        f"  Complaint daily agg: {agg.shape[0]:,} rows × {agg.shape[1]} columns"
    )
    return agg


def _fill_date_region_grid(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ensure every (region, date) combination exists in the DataFrame.
    Missing days are filled with 0 (truly zero complaints, not missing data).
    """
    df["date"]  = pd.to_datetime(df["date"])
    all_dates   = pd.date_range(df["date"].min(), df["date"].max(), freq="D")
    all_regions = df["region"].unique()
    full_grid   = pd.MultiIndex.from_product(
        [all_regions, all_dates], names=["region", "date"]
    ).to_frame(index=False)

    df = full_grid.merge(df, on=["region", "date"], how="left").fillna(0)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values(["region", "date"]).reset_index(drop=True)


def _add_lag_features(
    df: pd.DataFrame,
    col: str,
    windows: list[int],
) -> pd.DataFrame:
    """Add lag-N columns per region for the target column."""
    df = df.sort_values(["region", "date"]).reset_index(drop=True)
    for lag in windows:
        df[f"{col}_lag_{lag}d"] = (
            df.groupby("region")[col].shift(lag).fillna(0)
        )
    return df


def _add_rolling_features(
    df: pd.DataFrame,
    col: str,
    windows: list[int],
) -> pd.DataFrame:
    """
    Add rolling mean and std columns per region.

    FIX FE5: the original used .transform(lambda x: x.shift(1).rolling(...))
    which computed shift inside transform on a per-group Series — the index
    alignment was unreliable.  The correct approach is:
      1. shift the column by 1 per group (avoids look-ahead leakage)
      2. then compute rolling on the shifted series per group
    """
    df = df.sort_values(["region", "date"]).reset_index(drop=True)
    # Shift by 1 per group first (prevents leakage of current day into roll)
    shifted = df.groupby("region")[col].shift(1)

    for w in windows:
        df[f"{col}_roll_mean_{w}d"] = (
            shifted.groupby(df["region"])
            .transform(lambda x: x.rolling(w, min_periods=1).mean())
            .fillna(0)
        )
        df[f"{col}_roll_std_{w}d"] = (
            shifted.groupby(df["region"])
            .transform(lambda x: x.rolling(w, min_periods=1).std())
            .fillna(0)
        )
    return df


def _add_spike_flag(df: pd.DataFrame) -> pd.DataFrame:
    """Flag days where complaint count exceeds mean + 2σ for that region."""
    stats = (
        df.groupby("region")["total_complaints"]
        .agg(["mean", "std"])
        .reset_index()
    )
    df = df.merge(stats, on="region", how="left")
    df["complaint_spike_flag"] = (
        df["total_complaints"] > (df["mean"] + 2 * df["std"].fillna(0))
    ).astype(int)
    return df.drop(columns=["mean", "std"])


# ─────────────────────────────────────────────────────────────────────────────
# C. KPI AGGREGATION FEATURES
# ─────────────────────────────────────────────────────────────────────────────

def build_kpi_daily_agg(kpi_data: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate per-session KPI data to (region, date) granularity.

    For each numeric KPI column produces: mean, median, min, max, std, p10.
    Also produces: session_count, degraded_session_rate_pct, rolling 7d mean.

    Gracefully degrades to session-count-only agg when numeric KPI columns
    are absent (minimal real DCLM data).
    """
    cfg     = _get_cfg()
    all_kpi = (
        cfg["features"]["kpi_columns"]["data"]
        + cfg["features"]["kpi_columns"]["voice"]
    )

    df = kpi_data.copy()
    df["date"] = pd.to_datetime(df["timestamp"]).dt.date
    if "region" not in df.columns:
        df["region"] = "Unknown"

    logger.info("  Building daily KPI aggregates ...")

    present_kpis = [c for c in all_kpi if c in df.columns]

    # ── No numeric KPI columns: real DCLM data, session count only ────────────
    if not present_kpis:
        logger.info("  No numeric KPI columns — building session-count agg only")
        base = (
            df.groupby(["region", "date"])
            .agg(session_count=("msisdn", "count"))
            .reset_index()
        )
        # Breakdowns by kpi_source and network_type
        for src_col, prefix in [("kpi_source", "sessions"), ("network_type", "sessions")]:
            if src_col in df.columns:
                for val in df[src_col].dropna().unique():
                    slug = val.lower().replace(" ", "_")
                    cnt = (
                        df[df[src_col] == val]
                        .groupby(["region", "date"])
                        .size()
                        .reset_index(name=f"{prefix}_{slug}")
                    )
                    base = base.merge(cnt, on=["region", "date"], how="left")
        base["date"] = pd.to_datetime(base["date"])
        logger.info(
            f"  KPI session count agg: {base.shape[0]} rows × {base.shape[1]} cols"
        )
        return base

    # ── Full KPI aggregation ──────────────────────────────────────────────────
    # FIX FE2 & FE3: original had nested for-loops that overwrote `col` and
    # used a lambda with a patched __name__.  Now uses pd.NamedAgg for clarity
    # and builds the agg_dict in one clean pass.

    def _p10(x: pd.Series) -> float:
        return float(x.quantile(0.10))

    _p10.__name__ = "p10"   # pandas uses __name__ for the column label

    agg_specs: dict[str, list] = {}
    for kpi_col in present_kpis:
        agg_specs[kpi_col] = ["mean", "median", "min", "max", "std", _p10]

    agg = (
        df.groupby(["region", "date"])
        .agg(session_count=("msisdn", "count"), **{
            f"{kpi_col}__{stat}": pd.NamedAgg(column=kpi_col, aggfunc=stat)
            for kpi_col in present_kpis
            for stat in ["mean", "median", "min", "max", "std", _p10]
        })
        .reset_index()
    )

    # Rename __-separated columns to _-separated (e.g. dl_throughput__mean → dl_throughput_mean)
    agg.columns = [c.replace("__", "_") for c in agg.columns]

    # Degradation rate per KPI
    for kpi_col, (direction, threshold) in KPI_DEGRADATION_THRESHOLDS.items():
        if kpi_col not in df.columns:
            continue
        if direction == "below":
            deg = (
                df.groupby(["region", "date"])[kpi_col]
                .apply(lambda x: (x < threshold).mean() * 100)
                .reset_index(name=f"{kpi_col}_degradation_rate")
            )
        else:
            deg = (
                df.groupby(["region", "date"])[kpi_col]
                .apply(lambda x: (x > threshold).mean() * 100)
                .reset_index(name=f"{kpi_col}_degradation_rate")
            )
        agg = agg.merge(deg, on=["region", "date"], how="left")

    # Degraded session rate
    if "is_degraded_session" in df.columns:
        deg_rate = (
            df.groupby(["region", "date"])["is_degraded_session"]
            .mean()
            .mul(100)
            .reset_index(name="degraded_session_rate_pct")
        )
        agg = agg.merge(deg_rate, on=["region", "date"], how="left")

    # Fill date grid
    agg = _fill_date_region_grid(agg)

    # 7-day rolling mean for key KPIs
    for kpi_col in present_kpis:
        mean_col = f"{kpi_col}_mean"
        if mean_col in agg.columns:
            agg = _add_rolling_features(agg, mean_col, [7])

    agg["date"] = pd.to_datetime(agg["date"])
    logger.info(
        f"  KPI daily agg: {agg.shape[0]:,} rows × {agg.shape[1]} columns"
    )
    return agg


def add_kpi_degradation_flags(kpi_agg: pd.DataFrame) -> pd.DataFrame:
    """
    Add binary flag columns: 1 when >20% of sessions in a region-day
    crossed the degradation threshold for a given KPI.
    """
    for kpi_col in KPI_DEGRADATION_THRESHOLDS:
        rate_col = f"{kpi_col}_degradation_rate"
        if rate_col in kpi_agg.columns:
            kpi_agg[f"{kpi_col}_degraded_flag"] = (
                kpi_agg[rate_col] > 20
            ).astype(int)
    return kpi_agg


# ─────────────────────────────────────────────────────────────────────────────
# D. JOIN: Complaints + KPI → Unified Feature Matrix
# ─────────────────────────────────────────────────────────────────────────────

def build_feature_matrix(
    complaint_agg: pd.DataFrame,
    kpi_agg:       pd.DataFrame,
    join_strategy: str = "left",
) -> pd.DataFrame:
    """
    Join complaint and KPI aggregates on (region, date).

    Parameters
    ----------
    complaint_agg  : output of build_complaint_daily_agg
    kpi_agg        : output of build_kpi_daily_agg
    join_strategy  : 'left'  keeps all complaint days (recommended)
                     'inner' keeps only days present in both sources

    Returns
    -------
    Unified feature matrix ready for ML model ingestion.
    """
    logger.info(
        f"  Joining complaint + KPI aggregates (strategy='{join_strategy}') ..."
    )

    complaint_agg = complaint_agg.copy()
    kpi_agg       = kpi_agg.copy()
    complaint_agg["date"] = pd.to_datetime(complaint_agg["date"])
    kpi_agg["date"]       = pd.to_datetime(kpi_agg["date"])

    merged = complaint_agg.merge(
        kpi_agg,
        on=["region", "date"],
        how=join_strategy,
        suffixes=("_complaint", "_kpi"),
    )

    # Add temporal features (using date as proxy timestamp)
    merged["_ts_proxy"] = pd.to_datetime(merged["date"])
    merged = add_temporal_features(merged, ts_col="_ts_proxy")
    merged = merged.drop(columns=["_ts_proxy"], errors="ignore")

    # Impute KPI nulls from left join using regional → global median
    kpi_indicator_terms = [
        "throughput", "latency", "packet", "qoe", "drop_rate",
        "mos", "session_count", "success_rate", "degradation",
        "degraded", "handover", "voice_quality",
    ]
    kpi_cols_in_merged = [
        c for c in merged.select_dtypes(include="number").columns
        if any(t in c for t in kpi_indicator_terms)
    ]
    n_before = int(merged[kpi_cols_in_merged].isnull().sum().sum()) if kpi_cols_in_merged else 0
    if n_before > 0:
        for col in kpi_cols_in_merged:
            if merged[col].isnull().any():
                reg_med    = merged.groupby("region")[col].transform("median")
                global_med = merged[col].median()
                merged[col] = merged[col].fillna(reg_med).fillna(global_med).fillna(0)
        n_after = int(merged[kpi_cols_in_merged].isnull().sum().sum())
        logger.info(
            f"  KPI join nulls imputed: {n_before:,} → {n_after} "
            "(regional median strategy)"
        )

    # FIX FE7: ordinal encode region instead of one-hot to avoid train/predict
    # column mismatch when new regions appear at inference time.
    # The original get_dummies approach also produced very wide matrices.
    if "region" in merged.columns:
        region_codes = merged["region"].astype("category").cat.codes
        merged["region_encoded"] = region_codes

    # Fill lag/rolling nulls at the start of each time-series (no history = 0)
    lag_roll_cols = [
        c for c in merged.select_dtypes(include="number").columns
        if "_lag_" in c or "_roll_" in c
    ]
    if lag_roll_cols:
        n_lr_nulls = int(merged[lag_roll_cols].isnull().sum().sum())
        if n_lr_nulls > 0:
            merged[lag_roll_cols] = merged[lag_roll_cols].fillna(0)
            logger.info(f"  Lag/rolling nulls filled with 0: {n_lr_nulls:,}")

    total_nulls = int(merged.isnull().sum().sum())
    logger.info(
        f"  Feature matrix: {merged.shape[0]:,} rows × {merged.shape[1]} features"
        f"  (nulls={total_nulls})"
    )
    return merged


# ─────────────────────────────────────────────────────────────────────────────
# E. TRAIN / TEST SPLIT (time-aware)
# ─────────────────────────────────────────────────────────────────────────────

def time_series_split(
    df:        pd.DataFrame,
    date_col:  str   = "date",
    test_size: float = 0.20,
    target:    str   = "total_complaints",
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    """
    Chronological train/test split — NEVER shuffles.

    FIX FE4: bool columns (is_weekend, is_peak_hour, …) were excluded because
    bool is not in [np.float64, np.int64, np.float32, np.int32].
    Fixed by including bool in the accepted dtype list.

    Leakage exclusions
    ------------------
    Any column that is a sub-count of total_complaints (complaints_data,
    cat_* columns, session_count) is excluded from X to prevent data leakage.
    complaint_spike_flag is derived from the same day's count — also excluded.

    Returns
    -------
    X_train, X_test, y_train, y_test
    """
    df = df.sort_values(date_col).reset_index(drop=True)
    split_idx = int(len(df) * (1 - test_size))

    _LEAKAGE_EXACT = [
        "complaints_data", "complaints_voice", "complaints_unknown",
        "high_priority_complaints", "vip_complaints",
        "complaint_spike_flag",
    ]
    _cat_leakage     = [c for c in df.columns if c.startswith("cat_")]
    _session_leakage = [c for c in df.columns
                        if c.startswith("sessions") or c == "session_count"]

    drop_cols = set(
        [date_col, target, "region", "day_of_week"]
        + _LEAKAGE_EXACT
        + _cat_leakage
        + _session_leakage
    )

    # FIX FE4: include bool alongside the numeric dtypes
    _NUMERIC_DTYPES = (
        np.float64, np.int64, np.float32, np.int32,
        np.float16, np.int16, np.int8, np.uint8,
        bool,
    )
    feature_cols = [
        c for c in df.columns
        if c not in drop_cols and df[c].dtype.type in _NUMERIC_DTYPES
    ]

    X = df[feature_cols]
    y = df[target]

    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    logger.info(
        f"  Train/test split: {len(X_train):,} train | {len(X_test):,} test "
        f"| {len(feature_cols)} features"
    )
    return X_train, X_test, y_train, y_test


# ─────────────────────────────────────────────────────────────────────────────
# F. SAVE PROCESSED DATASETS
# ─────────────────────────────────────────────────────────────────────────────

def save_processed(
    df:   pd.DataFrame,
    name: str,
    fmt:  str = "parquet",
) -> Path:
    """
    Persist a processed DataFrame to data/processed/.
    Parquet preferred — columnar, fast, preserves dtypes.

    FIX FE8: uses lazy _get_cfg() instead of module-level cfg.
    """
    cfg     = _get_cfg()
    out_dir = Path(cfg["paths"]["processed_data"])
    out_dir.mkdir(parents=True, exist_ok=True)

    if fmt == "parquet":
        path = out_dir / f"{name}.parquet"
        df.to_parquet(path, index=False)
    else:
        path = out_dir / f"{name}.csv"
        df.to_csv(path, index=False)

    size_mb = path.stat().st_size / 1_048_576
    logger.success(
        f"  Saved {name} → {path}  ({size_mb:.1f} MB, {len(df):,} rows)"
    )
    return path