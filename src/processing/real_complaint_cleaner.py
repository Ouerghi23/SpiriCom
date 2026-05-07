"""
Complaint Data Cleaner
======================
Cleaning steps:
  1. Drop debug / internal columns
  2. Deduplication (case_id + exact rows)
  3. Standardise complaint_category (sub category) + service_type
  4. Geographic validation (lat/lon when present; skipped for real DCLM data)
  5. Temporal validation (future / pre-2015 timestamps)
  6. Missing-value imputation
  7. Ordinal encoding (priority_encoded, segment_encoded)
  8. Data-quality flags
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional
import pandas as pd
import numpy as np
from loguru import logger

# FIX CC1: lazy config loading — no import-time crash if config.yaml absent
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


# FIX CC2: unified, single-cased constant name — was priority_order (lower)
# but _encode_ordinal referenced PRIORITY_ORDER (upper) → NameError.
PRIORITY_ORDER: dict[str, int] = {
    "Low": 1, "Medium": 2, "High": 3, "Critical": 4
}
SEGMENT_ORDER: dict[str, int] = {
    "Standard": 0, "Premium": 1, "Enterprise": 2, "Vip": 3
}

# ── Category aliases ──────────────────────────────────────────────────────────
# Keys must match the form produced AFTER .str.strip().str.title() is applied
# to complaint_category (i.e. Title Case).  FIX CC5.
CATEGORY_ALIASES: dict[str, str] = {
    # Data
    "Slow Speed":           "Slow Data",
    "Low Speed":            "Slow Data",
    "Slow Internet":        "Slow Data",
    "Speed":                "Slow Data",
    "No Internet":          "No Service",
    "No Network":           "No Service",
    "No Signal":            "No Service",
    "Out Of Coverage":      "No Service",
    "Network Unavailable":  "No Service",
    "Unstable Connection":  "Intermittent Connection",
    "Instable":             "Intermittent Connection",
    "Interruption":         "Intermittent Connection",
    # Voice
    "Dropped Call":         "Call Drop",
    "Call Disconnected":    "Call Drop",
    "Appel Coupe":          "Call Drop",
    "Cannot Call":          "Call Setup Failure",
    "Call Failed":          "Call Setup Failure",
    "Echec Appel":          "Call Setup Failure",
    "Bad Voice":            "Poor Voice Quality",
    "Mauvaise Qualite":     "Poor Voice Quality",
    "Echo":                 "Poor Voice Quality",
    "Noise":                "Poor Voice Quality",
    # SMS
    "Sms Not Received":     "SMS Failure",
    "Sms Not Delivered":    "SMS Failure",
    "Sms Failed":           "SMS Failure",
    # Roaming
    "Roaming":              "Roaming Issue",
    "Itinerance":           "Roaming Issue",
}

SERVICE_ALIASES: dict[str, str] = {
    "Mobile Data": "Data",
    "Internet":    "Data",
    "4G":          "Data",
    "5G":          "Data",
    "3G":          "Data",
    "Call":        "Voice",
    "Calls":       "Voice",
    "Text":        "SMS",
    "Message":     "SMS",
}

# Tunisia bounding box
LAT_MIN, LAT_MAX = 30.0, 37.5
LON_MIN, LON_MAX = 7.5,  11.6


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def clean_complaints(
    df: pd.DataFrame,
    drop_debug_cols: bool = True,
) -> tuple[pd.DataFrame, dict]:
    """
    Full cleaning pipeline for the Sheet1 complaint DataFrame.

    Returns
    -------
    (cleaned_df, report_dict)
    """
    cfg = _get_cfg()
    valid_regions    = set(cfg["data"]["regions"])
    valid_services   = set(cfg["data"]["service_types"])
    valid_categories = set(cfg["data"]["complaint_categories"])

    report: dict = {}
    original_len = len(df)
    df = df.copy()
    logger.info(f"Starting complaint cleaning pipeline — {original_len:,} rows")

    # Step 1: Drop debug / internal columns
    if drop_debug_cols:
        debug_cols = [c for c in df.columns if c.startswith("_")]
        df.drop(columns=debug_cols, errors="ignore", inplace=True)
        report["debug_cols_dropped"] = debug_cols

    # Step 2: Deduplicate
    df, report["duplicates"] = _remove_duplicates(df)

    # Step 3: Standardise categories
    df, report["category_fixes"] = _standardise_categories(df, valid_categories)
    df, report["service_fixes"]  = _standardise_service_types(df, valid_services)

    # Step 4: Geographic validation
    df, report["geo"] = _clean_geographic(df, valid_regions)

    # Step 5: Temporal validation
    df, report["temporal"] = _clean_temporal(df)

    # Step 6: Impute missing values
    df, report["imputation"] = _impute_missing(df)

    # FIX CC3: removed the duplicate priority_encoded assignment that was
    # written after _encode_ordinal — _encode_ordinal now is the single source.
    # Step 7: Ordinal encoding
    df = _encode_ordinal(df)
    report["ordinal_encoded"] = ["priority_encoded", "segment_encoded"]

    # Step 8: Quality flags
    df = _flag_unknowns(df)

    rows_removed = original_len - len(df)
    report["summary"] = {
        "original_rows":   original_len,
        "final_rows":      len(df),
        "rows_removed":    rows_removed,
        "removal_pct":     round(rows_removed / original_len * 100, 2),
        "final_columns":   len(df.columns),
        "remaining_nulls": int(df.isnull().sum().sum()),
    }
    logger.success(
        f"Cleaning complete — {len(df):,} rows retained "
        f"({rows_removed:,} removed, {report['summary']['removal_pct']}%)"
    )
    return df, report


# ─────────────────────────────────────────────────────────────────────────────
# STEP IMPLEMENTATIONS
# ─────────────────────────────────────────────────────────────────────────────

def _remove_duplicates(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Remove exact duplicate rows then duplicate case_ids (keep first)."""
    n_before = len(df)
    df = df.drop_duplicates()
    n_after_rows = len(df)

    if "case_id" in df.columns:
        df = df.drop_duplicates(subset=["case_id"], keep="first")
    n_after_ids = len(df)

    report = {
        "exact_row_duplicates_removed": n_before - n_after_rows,
        "case_id_duplicates_removed":   n_after_rows - n_after_ids,
        "total_removed":                n_before - n_after_ids,
    }
    logger.info(f"  Dedup: {report['total_removed']} duplicates removed")
    return df, report


def _standardise_categories(
    df: pd.DataFrame,
    valid_categories: set[str],
) -> tuple[pd.DataFrame, dict]:
    """
    Apply Title-Case alias corrections to complaint_category.

    FIX CC5: CATEGORY_ALIASES keys are now Title Case to match the column
    values after .str.strip().str.title() is applied — previously keys were
    Title Case but the replace() was called before title-casing, so aliases
    never matched.
    """
    if "complaint_category" not in df.columns:
        return df, {}

    before = df["complaint_category"].value_counts().to_dict()

    # Normalise to Title Case first, then apply aliases
    df["complaint_category"] = (
        df["complaint_category"]
        .astype(str)
        .str.strip()
        .str.title()
        .replace(CATEGORY_ALIASES)
    )

    unknown_mask = ~df["complaint_category"].isin(valid_categories)
    n_unknown = int(unknown_mask.sum())
    if n_unknown > 0:
        logger.warning(
            f"  {n_unknown} complaints with unrecognised category → 'Other'"
        )
        df.loc[unknown_mask, "complaint_category"] = "Other"

    after = df["complaint_category"].value_counts().to_dict()
    report = {
        "aliases_applied":    len(CATEGORY_ALIASES),
        "unknown_relabelled": n_unknown,
        "before_counts":      before,
        "after_counts":       after,
    }
    logger.info(f"  Categories: {n_unknown} unknowns relabelled")
    return df, report


def _standardise_service_types(
    df: pd.DataFrame,
    valid_services: set[str],
) -> tuple[pd.DataFrame, dict]:
    """Correct service_type variations to canonical values."""
    if "service_type" not in df.columns:
        return df, {}

    df["service_type"] = (
        df["service_type"].astype(str).str.strip().str.title().replace(SERVICE_ALIASES)
    )

    unknown_mask = ~df["service_type"].isin(valid_services)
    n_unknown    = int(unknown_mask.sum())

    if n_unknown > 0:
        # Infer from complaint_category where possible
        inferred = df.loc[unknown_mask, "complaint_category"].map({
            "Call Drop":          "Voice",
            "Call Setup Failure": "Voice",
            "Poor Voice Quality": "Voice",
            "Slow Data":          "Data",
            "SMS Failure":        "SMS",
        })
        df.loc[unknown_mask & inferred.notna(), "service_type"] = inferred.dropna()
        still_unknown = ~df["service_type"].isin(valid_services)
        df.loc[still_unknown, "service_type"] = "Unknown"

    report = {
        "aliases_applied": len(SERVICE_ALIASES),
        "n_unknown_processed": n_unknown,
        "final_unknown_count": int((~df["service_type"].isin(valid_services | {"Unknown"})).sum()),
    }
    logger.info(f"  Service types: {n_unknown} unknowns processed")
    return df, report


def _clean_geographic(
    df: pd.DataFrame,
    valid_regions: set[str],
) -> tuple[pd.DataFrame, dict]:
    """
    Validate coordinates if present; skip for real DCLM data (no lat/lon).

    FIX CC4: the original geo_imputed flag compared a column against itself
    (df[lat] == df.get(lat,...)) — always True, making the flag meaningless.
    Now tracks which rows actually had missing coords before imputation.
    """
    report: dict = {}

    _REGION_CENTROIDS = {
        "Tunis":     (36.818, 10.165),
        "Sfax":      (34.740, 10.760),
        "Sousse":    (35.825, 10.638),
        "Kairouan":  (35.671, 10.100),
        "Bizerte":   (37.275,  9.873),
        "Gabes":     (33.881, 10.097),
        "Ariana":    (36.862, 10.193),
        "Gafsa":     (34.422,  8.784),
        "Monastir":  (35.777, 10.826),
        "Ben Arous": (36.753, 10.228),
    }

    if "latitude" not in df.columns or "longitude" not in df.columns:
        logger.info("  Geo: no lat/lon columns — skipping (real DCLM data)")
        return df, {"status": "no_geo_columns"}

    # Track which rows are missing BEFORE imputation (FIX CC4)
    missing_mask = df["latitude"].isnull() | df["longitude"].isnull()
    n_missing    = int(missing_mask.sum())

    # Impute from region centroid
    if "region" in df.columns:
        for region, (lat, lon) in _REGION_CENTROIDS.items():
            mask = missing_mask & (df["region"] == region)
            df.loc[mask, "latitude"]  = lat
            df.loc[mask, "longitude"] = lon

    # Fallback: Tunisia centroid
    still_missing = df["latitude"].isnull() | df["longitude"].isnull()
    df.loc[still_missing, "latitude"]  = 34.0
    df.loc[still_missing, "longitude"] = 9.0

    # Flag only rows that were imputed (correct FIX CC4)
    df["geo_imputed"] = missing_mask.astype(int)

    # Clamp out-of-bounds coordinates
    out_of_bounds = (
        (df["latitude"]  < LAT_MIN) | (df["latitude"]  > LAT_MAX) |
        (df["longitude"] < LON_MIN) | (df["longitude"] > LON_MAX)
    )
    n_oob = int(out_of_bounds.sum())
    df.loc[out_of_bounds, "latitude"]  = df.loc[out_of_bounds, "latitude"].clip(LAT_MIN, LAT_MAX)
    df.loc[out_of_bounds, "longitude"] = df.loc[out_of_bounds, "longitude"].clip(LON_MIN, LON_MAX)

    # Validate region names
    if "region" in df.columns:
        invalid = ~df["region"].isin(valid_regions)
        n_invalid = int(invalid.sum())
        df.loc[invalid, "region"] = "Unknown"
        report["invalid_regions_relabelled"] = n_invalid

    report.update({
        "missing_coords_imputed": n_missing,
        "out_of_bounds_clamped":  n_oob,
    })
    logger.info(f"  Geo: {n_missing} coords imputed, {n_oob} clamped")
    return df, report


def _clean_temporal(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Remove records with future timestamps or timestamps before 2015
    (pre-4G era — no valid DCLM data expected).
    """
    n_before = len(df)
    now      = pd.Timestamp.now()
    min_date = pd.Timestamp("2015-01-01")

    future_mask = df["timestamp"] > now
    past_mask   = df["timestamp"] < min_date

    n_future = int(future_mask.sum())
    n_past   = int(past_mask.sum())
    df = df[~future_mask & ~past_mask].copy()

    report = {
        "future_timestamps_removed":  n_future,
        "pre_2015_timestamps_removed": n_past,
        "total_removed":              n_before - len(df),
    }
    logger.info(f"  Temporal: {n_future} future + {n_past} pre-2015 rows removed")
    return df, report


def _impute_missing(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Column-specific imputation:
      - Categorical columns → constant placeholder
      - customer_segment, priority → mode
    """
    log: dict = {}

    _CAT_FILL = {
        "complaint_subcategory":    "Unknown",
        "complaint_subsubcategory": "Unknown",
        "cell_id":                  "UNKNOWN",
        "resolution_status":        "Unknown",
        "provider_group":           "Unknown",
        "complaint_typology":       "Unknown",
        "customer_code":            "Unknown",
        "comment":                  "",
    }
    for col, fill_val in _CAT_FILL.items():
        if col in df.columns:
            n = int(df[col].isnull().sum())
            df[col] = df[col].fillna(fill_val)
            log[col] = {"strategy": f"constant='{fill_val}'", "n_imputed": n}

    for col in ["customer_segment", "priority"]:
        if col in df.columns and df[col].isnull().any():
            mode_val = df[col].mode()[0]
            n = int(df[col].isnull().sum())
            df[col] = df[col].fillna(mode_val)
            log[col] = {"strategy": f"mode='{mode_val}'", "n_imputed": n}

    logger.info(f"  Imputation: {len(log)} columns processed")
    return df, log


def _encode_ordinal(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add ordinal-encoded columns for priority and customer_segment.

    FIX CC2: was referencing PRIORITY_ORDER in the function but the
    constant was defined as priority_order (lowercase) at module level.
    Unified to PRIORITY_ORDER throughout.

    FIX CC3: clean_complaints no longer contains a second .map(priority_order)
    call — this function is the single source of truth.
    """
    if "priority" in df.columns:
        df["priority_encoded"] = (
            df["priority"].map(PRIORITY_ORDER).fillna(2).astype(int)
        )
    if "customer_segment" in df.columns:
        df["segment_encoded"] = (
            df["customer_segment"].map(SEGMENT_ORDER).fillna(-1).astype(int)
        )
    return df


def _flag_unknowns(df: pd.DataFrame) -> pd.DataFrame:
    """Binary flag: 1 if any imputation or quality correction was applied."""
    flags = []
    if "geo_imputed" in df.columns:
        flags.append(df["geo_imputed"])
    if "complaint_category" in df.columns:
        flags.append((df["complaint_category"] == "Other").astype(int))
    if "service_type" in df.columns:
        flags.append((df["service_type"] == "Unknown").astype(int))
    if flags:
        df["data_quality_flag"] = (sum(flags) > 0).astype(int)
    return df


# ─────────────────────────────────────────────────────────────────────────────
# REPORTING
# ─────────────────────────────────────────────────────────────────────────────

def print_cleaning_report(report: dict) -> None:
    """Pretty-print the complaint cleaning audit trail."""
    sep = "=" * 60
    print(f"\n{sep}")
    print("  COMPLAINT CLEANING REPORT")
    print(sep)
    s = report.get("summary", {})
    print(f"  Input rows        : {s.get('original_rows', '?'):>10,}")
    print(f"  Output rows       : {s.get('final_rows', '?'):>10,}")
    print(
        f"  Rows removed      : {s.get('rows_removed', '?'):>10,}"
        f"  ({s.get('removal_pct', '?')}%)"
    )
    print(f"  Output columns    : {s.get('final_columns', '?'):>10}")
    print(f"  Remaining nulls   : {s.get('remaining_nulls', '?'):>10,}")
    print("\n  Step Details:")
    for step, detail in report.items():
        if step == "summary":
            continue
        print(f"\n  [{step}]")
        if isinstance(detail, dict):
            for k, v in detail.items():
                if not isinstance(v, dict):
                    print(f"    {k:<35} : {v}")
        elif isinstance(detail, list):
            print(f"    {detail}")
    print(f"{sep}\n")