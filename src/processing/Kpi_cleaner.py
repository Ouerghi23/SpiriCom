"""
KPI Data Cleaner
================
Handles all cleaning operations for the network KPI dataset.

Works with both:
  • Real DCLM data  (kpi_data.xlsx — sheets DATA + VOICE)
  • Synthetic data  (data/raw/synthetic_kpi.parquet)

Cleaning steps:
  1. Deduplication (exact rows + msisdn+timestamp per kpi_source)
  2. Physical range validation per KPI (clamp to valid bounds)
  3. Outlier handling (IQR-based: cap / flag / drop)
  4. Missing-value imputation (median per region, fallback global)
  5. Cell ID normalisation
  6. QoE category recomputation from cleaned qoe_score
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional
import pandas as pd
import numpy as np
from loguru import logger

# FIX KC1: lazy config loading
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


# Physical bounds per KPI — values outside these are physically impossible
KPI_BOUNDS: dict[str, tuple[float, float]] = {
    "dl_throughput_mbps":        (0.0,   2000.0),
    "ul_throughput_mbps":        (0.0,   1000.0),
    "latency_ms":                (1.0,  10_000.0),
    "packet_loss_pct":           (0.0,    100.0),
    "data_session_success_rate": (0.0,    100.0),
    "data_qoe_score":            (0.0,    100.0),
    "call_setup_success_rate":   (0.0,    100.0),
    "call_drop_rate":            (0.0,    100.0),
    "voice_quality_score_mos":   (1.0,      5.0),
    "handover_success_rate":     (0.0,    100.0),
    "voice_qoe_score":           (0.0,    100.0),
    "qoe_score":                 (0.0,    100.0),
}

# FIX KC3: all KPIs use median imputation — the per-key dict was only
# documenting what was already the single default.  Kept as a simple set
# of column names for clarity; strategy is applied uniformly.
_MEDIAN_IMPUTE_COLS: set[str] = set(KPI_BOUNDS.keys())


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def clean_kpi_data(
    df: pd.DataFrame,
    outlier_strategy: str   = "cap",
    iqr_multiplier:   float = 3.0,
) -> tuple[pd.DataFrame, dict]:
    """
    Full cleaning pipeline for KPI data.

    Parameters
    ----------
    df               : raw KPI DataFrame (output of data_loader.load_kpi_data)
    outlier_strategy : 'cap'  → Winsorise at IQR fences  (recommended)
                       'flag' → add kpi_outlier_flag column, keep values
                       'drop' → remove rows with any outlier KPI
    iqr_multiplier   : fence multiplier (default 3.0 — conservative)

    Returns
    -------
    (cleaned_df, report_dict)
    """
    report: dict = {}
    original_len = len(df)
    df = df.copy().reset_index(drop=True)   # FIX KC2 pre-condition: clean index

    logger.info(f"Starting KPI cleaning pipeline — {original_len:,} rows")

    df, report["duplicates"]       = _remove_kpi_duplicates(df)
    df, report["range_violations"] = _fix_range_violations(df)
    df, report["outliers"]         = _handle_outliers(df, outlier_strategy, iqr_multiplier)
    df, report["imputation"]       = _impute_kpi_missing(df)
    df = _normalise_cell_ids(df)
    df = _recompute_qoe_category(df)

    rows_removed = original_len - len(df)
    report["summary"] = {
        "original_rows":    original_len,
        "final_rows":       len(df),
        "rows_removed":     rows_removed,
        "removal_pct":      round(rows_removed / original_len * 100, 2),
        "remaining_nulls":  int(df.isnull().sum().sum()),
        "outlier_strategy": outlier_strategy,
    }
    logger.success(
        f"KPI cleaning complete — {len(df):,} rows retained "
        f"({rows_removed:,} removed)"
    )
    return df, report


# ─────────────────────────────────────────────────────────────────────────────
# STEP IMPLEMENTATIONS
# ─────────────────────────────────────────────────────────────────────────────

def _remove_kpi_duplicates(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Remove exact duplicates then (msisdn, timestamp, kpi_source) dupes."""
    n_before = len(df)
    df = df.drop_duplicates()
    n_row_dedup = n_before - len(df)

    if {"msisdn", "timestamp"}.issubset(df.columns):
        dedup_cols = ["msisdn", "timestamp"]
        if "kpi_source" in df.columns:
            dedup_cols.append("kpi_source")
        df = df.sort_values("timestamp").drop_duplicates(
            subset=dedup_cols, keep="last"
        )
    n_ts_dedup = (n_before - n_row_dedup) - len(df)

    report = {
        "exact_duplicates_removed":       n_row_dedup,
        "msisdn_timestamp_dedup_removed": n_ts_dedup,
        "total_removed":                  n_row_dedup + n_ts_dedup,
    }
    logger.info(f"  KPI dedup: {report['total_removed']} records removed")
    return df, report


def _fix_range_violations(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Clamp values to physically valid KPI ranges.
    Records are NOT dropped — impossible values are clamped to boundary.
    """
    report: dict = {}
    for col, (lo, hi) in KPI_BOUNDS.items():
        if col not in df.columns:
            continue
        below = int((df[col] < lo).sum())
        above = int((df[col] > hi).sum())
        if below + above > 0:
            df[col] = df[col].clip(lower=lo, upper=hi)
            report[col] = {"below_min_clamped": below, "above_max_clamped": above}

    total = sum(
        v["below_min_clamped"] + v["above_max_clamped"] for v in report.values()
    )
    logger.info(
        f"  Range violations: {total} values clamped across {len(report)} KPIs"
    )
    return df, report


def _handle_outliers(
    df:       pd.DataFrame,
    strategy: str,
    k:        float,
) -> tuple[pd.DataFrame, dict]:
    """
    IQR-based outlier handling for all numeric KPI columns.

    FIX KC2: outlier_mask was initialised with df.index which could
    misalign after upstream copy/reset operations.  Now uses a positional
    boolean NumPy array (np.zeros) which is always length-safe.
    """
    cfg     = _get_cfg()
    all_kpi = (
        cfg["features"]["kpi_columns"]["data"]
        + cfg["features"]["kpi_columns"]["voice"]
    )
    present_kpis = [c for c in all_kpi if c in df.columns]
    report: dict = {"strategy": strategy, "k": k, "affected_per_col": {}}

    if not present_kpis:
        logger.info("  Outliers: no KPI numeric columns — skipping")
        return df, report

    # FIX KC2: positional mask — safe regardless of index state
    outlier_mask = np.zeros(len(df), dtype=bool)

    for col in present_kpis:
        q1  = df[col].quantile(0.25)
        q3  = df[col].quantile(0.75)
        iqr = q3 - q1
        lo  = q1 - k * iqr
        hi  = q3 + k * iqr

        col_mask = ((df[col] < lo) | (df[col] > hi)).values  # numpy array
        n_out    = int(col_mask.sum())

        if n_out > 0:
            report["affected_per_col"][col] = n_out
            if strategy == "cap":
                df[col] = df[col].clip(lower=lo, upper=hi)
            elif strategy in ("flag", "drop"):
                outlier_mask |= col_mask

    if strategy == "drop" and outlier_mask.any():
        n_drop = int(outlier_mask.sum())
        df = df[~outlier_mask].reset_index(drop=True)
        report["rows_dropped"] = n_drop
        logger.info(f"  Outliers (drop): {n_drop} rows removed")
    elif strategy == "flag" and outlier_mask.any():
        df["kpi_outlier_flag"] = outlier_mask.astype(int)
        logger.info(f"  Outliers (flag): {int(outlier_mask.sum())} flagged")
    else:
        total_capped = sum(report["affected_per_col"].values())
        logger.info(
            f"  Outliers (cap): {total_capped} values capped across "
            f"{len(report['affected_per_col'])} KPIs"
        )

    return df, report


def _impute_kpi_missing(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Median imputation per (region, cell_id) group.
    Falls back to global median when the group median is NaN.

    FIX KC3: strategy is uniformly 'median' for all KPIs — the per-key
    KPI_IMPUTATION dict is replaced by a simple column set.
    """
    report: dict = {}
    group_cols = [c for c in ["region", "cell_id"] if c in df.columns]

    for col in _MEDIAN_IMPUTE_COLS:
        if col not in df.columns:
            continue
        n_missing = int(df[col].isnull().sum())
        if n_missing == 0:
            continue

        if group_cols:
            group_med  = df.groupby(group_cols)[col].transform("median")
            global_med = df[col].median()
            df[col]    = df[col].fillna(group_med).fillna(global_med)
        else:
            df[col] = df[col].fillna(df[col].median())

        report[col] = {"n_imputed": n_missing, "strategy": "median"}

    total = sum(v["n_imputed"] for v in report.values())
    logger.info(
        f"  KPI imputation: {total:,} values imputed across {len(report)} columns"
    )
    return df, report


def _normalise_cell_ids(df: pd.DataFrame) -> pd.DataFrame:
    """Standardise cell_id: uppercase, strip whitespace, replace NaN."""
    if "cell_id" in df.columns:
        df["cell_id"] = df["cell_id"].astype(str).str.strip().str.upper()
        df.loc[df["cell_id"].isin(["NAN", "NONE", ""]), "cell_id"] = "UNKNOWN"
    return df


def _recompute_qoe_category(df: pd.DataFrame) -> pd.DataFrame:
    """
    Recompute qoe_category from the (now-cleaned) qoe_score column.
    Ensures consistency after clamping and imputation may have shifted scores.
    """
    if "qoe_score" not in df.columns:
        return df
    cfg        = _get_cfg()
    thresholds = cfg["qoe"]["thresholds"]
    green      = thresholds["green"]
    yellow     = thresholds["yellow"]

    df["qoe_category"] = pd.cut(
        df["qoe_score"],
        bins=[-np.inf, yellow, green, np.inf],
        labels=["Poor", "Fair", "Good"],
    ).astype("object").fillna("Unknown")

    return df


# ─────────────────────────────────────────────────────────────────────────────
# REPORTING
# ─────────────────────────────────────────────────────────────────────────────

def print_cleaning_report(report: dict) -> None:
    """Pretty-print the KPI cleaning audit trail."""
    sep = "=" * 60
    print(f"\n{sep}")
    print("  KPI CLEANING REPORT")
    print(sep)
    s = report.get("summary", {})
    print(f"  Input rows        : {s.get('original_rows', '?'):>10,}")
    print(f"  Output rows       : {s.get('final_rows', '?'):>10,}")
    print(
        f"  Rows removed      : {s.get('rows_removed', '?'):>10,}"
        f"  ({s.get('removal_pct', '?')}%)"
    )
    print(f"  Remaining nulls   : {s.get('remaining_nulls', '?'):>10,}")
    print(f"  Outlier strategy  : {s.get('outlier_strategy', '?')}")

    out_detail = report.get("outliers", {}).get("affected_per_col", {})
    if out_detail:
        print("\n  Outliers per KPI:")
        for col, cnt in sorted(out_detail.items(), key=lambda x: -x[1]):
            print(f"    {col:<40} : {cnt:>8,}")
    print(f"{sep}\n")