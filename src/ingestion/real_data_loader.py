"""
Data Loader — Huawei DCLM / CompSpirit
=======================================
Source file : data/raw/real_complaints.xlsx  (3 sheets)

  Sheet1  → customer complaints          (PRIMARY — always loaded)
  DATA    → KPI data sessions            (optional; real data pending)
  VOICE   → KPI voice sessions           (optional; real data pending)

NOTE (2025-PFE): Until Huawei delivers real KPI exports, only Sheet1 is
used.  DATA / VOICE loaders are present for future integration but are not
called from Notebook 01.  Synthetic KPIs are generated separately via
src/utils/synthetic_kpi_generator.py.

COLUMN MAPPING — Sheet1 (Complaints):
  Case ID                → case_id
  system                 → source_system        (always DCLM)
  case open datetime     → timestamp
  Type                   → ticket_type          (always 'complaint')
  msisdn                 → msisdn
  last status            → resolution_status
  Provider Group         → provider_group
  Typologie It/network   → complaint_typology
  category               → service_type         ← 'Data' | 'Voice'
  sub category           → complaint_category   ← actual complaint reason
  sub sub category       → complaint_subcategory
  province               → region
  city                   → city
  Segment MSISDN CONCERN → customer_segment
  bscs_custcode          → customer_code
  Week                   → week
  account contact name   → _DROP_  (GDPR)

COLUMN MAPPING — Sheet DATA (KPI Data):
  START TIME   → timestamp
  MSISDN       → msisdn
  Network Type → network_type
  Type         → data_kpi_type

COLUMN MAPPING — Sheet VOICE (KPI Voice):
  case open datetime → timestamp
  msisdn             → msisdn
  sub category       → voice_issue_type
  Type               → voice_kpi_type
"""

from __future__ import annotations  # FIX L4: enables Optional on Python 3.8/3.9

from pathlib import Path
from typing import Optional

import pandas as pd
import yaml
from loguru import logger

# Public API — only these names should be imported externally
__all__ = [
    "load_all_from_excel",
    "load_complaints",
    "load_kpi_data",
    "get_data_summary",
    "preview_excel",
]

# ── Config — lazy-loaded to avoid import-time failure ────────────────────────
# FIX L1: previously loaded at module level, crashing the entire import if
# config.yaml was absent.  Now loaded on first use via _get_cfg().
_cfg_cache: Optional[dict] = None


def _get_cfg() -> dict:
    """Return the global config dict, loading from disk on first call."""
    global _cfg_cache
    if _cfg_cache is None:
        config_path = Path(__file__).resolve().parents[2] / "config" / "config.yaml"
        if not config_path.exists():
            raise FileNotFoundError(
                f"Config file not found: {config_path}\n"
                "Create config/config.yaml before using this module."
            )
        with open(config_path) as fh:
            _cfg_cache = yaml.safe_load(fh)
    return _cfg_cache


# ── Real file name ────────────────────────────────────────────────────────────
REAL_FILE = "real_complaints.xlsx"

# ── Column maps — keys normalised to lowercase before lookup ─────────────────
# FIX L5: previously had 40+ duplicate-cased entries.  Now a single
# .str.lower() pass on column names makes the map case-insensitive with half
# the entries.

COMPLAINT_COL_MAP: dict[str, str] = {
    "case id":                  "case_id",
    "system":                   "source_system",
    "case open datetime":       "timestamp",
    "type":                     "ticket_type",
    "msisdn":                   "msisdn",
    "last status":              "resolution_status",
    "provider group":           "provider_group",
    # Both 'typologie it/network' variants handled by lower-casing
    "typologie it/network":     "complaint_typology",
    # category = service_type (Data / Voice)
    "category":                 "service_type",
    # sub category = actual complaint reason
    "sub category":             "complaint_category",
    # sub sub category = detail
    "sub sub category":         "complaint_subcategory",
    "province":                 "region",
    "city":                     "city",
    "segment msisdn concern":   "customer_segment",
    "bscs_custcode":            "customer_code",
    "week":                     "week",
    # GDPR — drop
    "account contact name":     "_DROP_",
}

DATA_COL_MAP: dict[str, str] = {
    "start time":   "timestamp",
    "msisdn":       "msisdn",
    "network type": "network_type",
    "type":         "data_kpi_type",
}

VOICE_COL_MAP: dict[str, str] = {
    "case open datetime": "timestamp",
    "msisdn":             "msisdn",
    "sub category":       "voice_issue_type",
    "type":               "voice_kpi_type",
}

# FIX L6: removed redundant "Data":"Data" entries — only need lowercase→canonical
SERVICE_NORM: dict[str, str] = {
    "data":  "Data",
    "voice": "Voice",
    "sms":   "SMS",
}


# ═════════════════════════════════════════════════════════════════════════════
# PUBLIC ENTRY POINTS
# ═════════════════════════════════════════════════════════════════════════════

def load_all_from_excel(path: Optional[Path] = None) -> dict[str, pd.DataFrame]:
    """
    Load all three sheets from real_complaints.xlsx in a single pass.

    Returns
    -------
    dict with keys:
        'complaints'      : DataFrame  (Sheet1, cleaned)
        'kpi_data'        : DataFrame  (DATA + VOICE merged)
        'kpi_data_only'   : DataFrame  (DATA sheet only, region-enriched)
        'kpi_voice_only'  : DataFrame  (VOICE sheet only, region-enriched)

    Falls back to synthetic CSV data when the real file is absent.

    Example
    -------
    >>> from src.ingestion.data_loader import load_all_from_excel
    >>> data = load_all_from_excel()
    >>> complaints = data['complaints']
    """
    cfg = _get_cfg()
    if path is None:
        path = Path(cfg["paths"]["raw_data"]) / REAL_FILE

    if not path.exists():
        logger.warning(f"Real file not found: {path}")
        logger.warning("Falling back to synthetic data...")
        return _load_synthetic_fallback()

    logger.info(f"Loading: {path}")
    # FIX L8: open ExcelFile once and share across all sheet loaders
    xl = pd.ExcelFile(path)
    logger.info(f"  Sheets found: {xl.sheet_names}")

    # Sheet1 first so we can build the MSISDN→region map for KPI enrichment
    complaints_df = _load_sheet1(xl)

    kpi_data_raw  = _load_data_sheet(xl)
    kpi_voice_raw = _load_voice_sheet(xl)

    def _enrich_region(df: pd.DataFrame) -> pd.DataFrame:
        """Add region column from Sheet1 MSISDN→region map when absent."""
        if df.empty or "region" in df.columns:
            return df
        df = df.copy()
        msisdn_region = (
            complaints_df[["msisdn", "region"]]
            .dropna()
            .drop_duplicates("msisdn")
            .set_index("msisdn")["region"]
        )
        df["region"] = df["msisdn"].map(msisdn_region).fillna("Unknown")
        return df

    return {
        "complaints":      complaints_df,
        "kpi_data":        _load_kpi_merged(xl, complaints_df),
        "kpi_data_only":   _enrich_region(kpi_data_raw),
        "kpi_voice_only":  _enrich_region(kpi_voice_raw),
    }


def load_complaints(path: Optional[Path] = None) -> pd.DataFrame:
    """
    Load Sheet1 (complaints) only.

    This is the primary entry point for Notebook 01.
    Falls back to the synthetic CSV when the real file is absent.
    """
    cfg = _get_cfg()
    if path is None:
        path = Path(cfg["paths"]["raw_data"]) / REAL_FILE

    if not path.exists():
        synth = Path(cfg["paths"]["synthetic_data"]) / cfg["data"]["complaint_file"]
        logger.warning(f"Real file absent — loading synthetic: {synth}")
        df = pd.read_csv(synth)
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        return _add_temporal_features(df)

    xl = pd.ExcelFile(path)
    return _load_sheet1(xl)


def load_kpi_data(path: Optional[Path] = None) -> pd.DataFrame:
    """
    Load and merge DATA + VOICE KPI sheets.

    FIX L3: now fetches Sheet1 first so the MSISDN→region enrichment is
    always applied (previously complaints_df was never passed here).
    """
    cfg = _get_cfg()
    if path is None:
        path = Path(cfg["paths"]["raw_data"]) / REAL_FILE

    if not path.exists():
        synth = Path(cfg["paths"]["synthetic_data"]) / cfg["data"]["kpi_file"]
        logger.warning(f"Real file absent — loading synthetic KPI: {synth}")
        df = pd.read_csv(synth)
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        return df

    xl = pd.ExcelFile(path)
    complaints_df = _load_sheet1(xl)           # needed for region enrichment
    return _load_kpi_merged(xl, complaints_df)


# ═════════════════════════════════════════════════════════════════════════════
# SHEET LOADERS (private)
# ═════════════════════════════════════════════════════════════════════════════

def _load_sheet1(xl: pd.ExcelFile) -> pd.DataFrame:
    """Load Sheet1 — customer complaints."""
    sheet_name = _find_sheet(
        xl.sheet_names,
        ["Sheet1", "Complaints", "Plaintes"],
    )
    if sheet_name is None:
        sheet_name = xl.sheet_names[0]
        logger.warning(f"  Sheet1 not found — using first tab: '{sheet_name}'")

    df = pd.read_excel(xl, sheet_name=sheet_name)
    logger.info(
        f"  Sheet1 ('{sheet_name}'): {len(df):,} rows × {len(df.columns)} cols"
    )
    logger.debug(f"  Raw columns: {list(df.columns)}")

    df.columns = df.columns.str.strip()
    df = _apply_mapping(df, COMPLAINT_COL_MAP)
    df = _standardise_complaints(df)
    logger.success(f"  Complaints loaded: {len(df):,} rows")
    return df


def _load_data_sheet(xl: pd.ExcelFile) -> pd.DataFrame:
    """Load the DATA sheet — KPI data sessions."""
    sheet_name = _find_sheet(xl.sheet_names, ["DATA", "Data", "KPI_DATA"])
    if sheet_name is None:
        logger.warning("  DATA sheet not found — skipping")
        return pd.DataFrame()

    df = pd.read_excel(xl, sheet_name=sheet_name)
    logger.info(
        f"  DATA ('{sheet_name}'): {len(df):,} rows × {len(df.columns)} cols"
    )

    df.columns = df.columns.str.strip()
    df = _apply_mapping(df, DATA_COL_MAP, warn=False)
    df["kpi_source"]   = "DATA"
    df["service_type"] = "Data"

    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(
            df["timestamp"], dayfirst=True, errors="coerce"
        )

    df = _clean_msisdn(df)
    df = _add_temporal_features(df)
    return df


def _load_voice_sheet(xl: pd.ExcelFile) -> pd.DataFrame:
    """Load the VOICE sheet — KPI voice sessions."""
    sheet_name = _find_sheet(xl.sheet_names, ["VOICE", "Voice", "KPI_VOICE"])
    if sheet_name is None:
        logger.warning("  VOICE sheet not found — skipping")
        return pd.DataFrame()

    df = pd.read_excel(xl, sheet_name=sheet_name)
    logger.info(
        f"  VOICE ('{sheet_name}'): {len(df):,} rows × {len(df.columns)} cols"
    )

    df.columns = df.columns.str.strip()
    df = _apply_mapping(df, VOICE_COL_MAP, warn=False)
    df["kpi_source"]   = "VOICE"
    df["service_type"] = "Voice"

    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(
            df["timestamp"], dayfirst=True, errors="coerce"
        )

    df = _clean_msisdn(df)
    df = _add_temporal_features(df)
    return df


def _load_kpi_merged(
    xl: pd.ExcelFile,
    complaints_df: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    """
    Merge DATA and VOICE sheets into one KPI DataFrame.

    When complaints_df is provided the function enriches the merged result
    with a 'region' column via MSISDN → Sheet1 join (DATA/VOICE sheets have
    no region column of their own).
    """
    df_data  = _load_data_sheet(xl)
    df_voice = _load_voice_sheet(xl)

    frames = [f for f in [df_data, df_voice] if not f.empty]
    if not frames:
        logger.error("No valid KPI sheets found!")
        return pd.DataFrame()

    merged = pd.concat(frames, ignore_index=True, sort=False)
    if "timestamp" in merged.columns:
        merged = merged.sort_values("timestamp", na_position="last")
    merged = merged.reset_index(drop=True)

    # Region enrichment via MSISDN → Sheet1 join
    if "region" not in merged.columns and complaints_df is not None:
        msisdn_region = (
            complaints_df[["msisdn", "region"]]
            .dropna()
            .drop_duplicates(subset=["msisdn"])
        )
        merged = merged.merge(msisdn_region, on="msisdn", how="left")
        n_matched = merged["region"].notna().sum()
        logger.info(
            f"  Region enrichment: {n_matched:,}/{len(merged):,} KPI rows "
            "matched to a region via MSISDN"
        )
        merged["region"] = merged["region"].fillna("Unknown")

    logger.success(
        f"  KPI merged: {len(df_data):,} DATA + {len(df_voice):,} VOICE "
        f"= {len(merged):,} total rows"
    )
    return merged


# ═════════════════════════════════════════════════════════════════════════════
# STANDARDISATION HELPERS (private)
# ═════════════════════════════════════════════════════════════════════════════

# FIX L7: replaced Python for-loop with vectorised pd.Series operations.
# The old approach called _infer_service_from_text() once per row which is
# O(n) in pure Python; the new approach uses str.contains on the whole column.

_VOICE_PATTERN = "|".join([
    r"appel coup",          # appel coupé / coupé
    r"coupure.*appel",
    r"mauvaise qualit.*voix",
    r"pas de couverture voix",
    r"qualit.*voix",
    r"probl.me voix",
    r"voix", r"appel", r"vocal", r"sonnerie",
    r"echo", r"bruit", r"num.rotation",
    r"renvoi appel", r"messagerie", r"rejet appel",
    r"non abouti", r"coup.", r"volte",
    r"mo.?call", r"mt.?call",
    r"4g voice", r"3g voice",
    r"voice", r"call",
])

_DATA_PATTERN = "|".join([
    r"lenteur internet",
    r"d.bit faible",
    r"pas de connexion",
    r"pas de service",
    r"pas de r.seau",
    r"pas de couverture data",
    r"probl.me data",
    r"navigation lente",
    r"internet", r"data", r"d.bit", r"lenteur",
    r"connexion", r"navigation",
    r"t.l.chargement", r"download", r"upload",
    r"ping", r"latenc",
    r"streaming", r"sms", r"mms",
    r"lte", r"4g data", r"5g data", r"3g data",
    r"slow", r"no service",
])


def _infer_service_type_vectorised(
    sub_cat: pd.Series,
    sub_sub_cat: Optional[pd.Series] = None,
) -> pd.Series:
    """
    Vectorised service_type inference from complaint_category text.

    Checks Voice keywords first (more specific), then Data keywords.
    Returns a Series of 'Voice' | 'Data' strings.

    Parameters
    ----------
    sub_cat     : Series of complaint_category values
    sub_sub_cat : Optional Series of complaint_subcategory values
    """
    combined = sub_cat.astype(str).str.lower()
    if sub_sub_cat is not None:
        combined = combined + " " + sub_sub_cat.astype(str).str.lower()

    is_voice = combined.str.contains(_VOICE_PATTERN, regex=True, na=False)
    is_data  = combined.str.contains(_DATA_PATTERN,  regex=True, na=False)

    result = pd.Series("Data", index=sub_cat.index, dtype=str)
    result[is_data]  = "Data"
    result[is_voice] = "Voice"   # Voice overwrites Data (higher specificity)
    return result


def _standardise_complaints(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply all standardisation rules to the Sheet1 complaint DataFrame.

    Steps (order matters):
      1. Parse timestamps
      2. Map service_type from 'category' column
      3. Infer service_type for unmapped rows from sub_category text
      4. Normalise string columns with .str.title()
      5. Clean MSISDN
      6. Derive priority from customer_segment
      7. Fill default values for absent columns
      8. Add temporal features
    """
    # ── 1. Timestamp ────────────────────────────────────────────────────────
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(
            df["timestamp"], dayfirst=True, errors="coerce"
        )
        n_fail = df["timestamp"].isnull().sum()
        if n_fail > 0:
            logger.warning(f"  {n_fail:,} timestamps could not be parsed")

    # ── 2. service_type: direct map from 'category' column ──────────────────
    # Run on RAW text BEFORE str.title() to avoid losing case sensitivity
    if "service_type" in df.columns:
        raw_svc = df["service_type"].astype(str).str.strip().str.lower()
        df["service_type"] = raw_svc.map(SERVICE_NORM)
    else:
        df["service_type"] = pd.NA

    # ── 3. Infer service_type for rows not covered by direct map ────────────
    unmapped_mask = df["service_type"].isna()
    if unmapped_mask.any() and "complaint_category" in df.columns:
        sub_sub = (
            df["complaint_subcategory"]
            if "complaint_subcategory" in df.columns
            else None
        )
        df.loc[unmapped_mask, "service_type"] = _infer_service_type_vectorised(
            df.loc[unmapped_mask, "complaint_category"],
            sub_sub.loc[unmapped_mask] if sub_sub is not None else None,
        )
        logger.info(
            f"  {int(unmapped_mask.sum())} service_type values inferred from "
            "sub_category text"
        )

    df["service_type"] = df["service_type"].fillna("Data")
    logger.info(f"  service_type: {df['service_type'].value_counts().to_dict()}")

    # ── 4. String normalisation — AFTER service_type inference ──────────────
    _STR_COLS = [
        "complaint_category", "complaint_subcategory",
        "region", "city", "customer_segment",
        "resolution_status", "provider_group",
        "complaint_typology", "source_system",
    ]
    for col in _STR_COLS:
        if col in df.columns and df[col].dtype == object:
            df[col] = (
                df[col].astype(str).str.strip().str.title().replace("Nan", pd.NA)
            )

    # ── 5. MSISDN ────────────────────────────────────────────────────────────
    df = _clean_msisdn(df)

    # ── 6. Priority (no 'priority' column in DCLM — derive from segment) ────
    if "priority" not in df.columns:
        _SEG_PRIORITY = {
            "Vip":        "Critical",
            "Enterprise": "High",
            "Premium":    "Medium",
            "Standard":   "Low",
        }
        df["priority"] = (
            df.get("customer_segment", pd.Series(dtype=str))
            .map(_SEG_PRIORITY)
            .fillna("Medium")
        )

    # ── 7. Default values for columns absent in DCLM export ─────────────────
    _DEFAULTS = {
        "resolution_status":     "Unknown",
        "provider_group":        "Unknown",
        "complaint_typology":    "Unknown",
        "complaint_subcategory": "Unknown",
        "customer_code":         "Unknown",
        "source_system":         "DCLM",
        "ticket_type":           "complaint",
    }
    for col, val in _DEFAULTS.items():
        if col not in df.columns:
            df[col] = val

    # ── 8. Temporal features ─────────────────────────────────────────────────
    df = _add_temporal_features(df)
    return df


def _add_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add date, hour, day_of_week, week, month, year from the timestamp column.

    The 'week' column is preserved from Sheet1 when present (it comes directly
    from the DCLM export) and only computed from the timestamp for other sheets.
    """
    if "timestamp" not in df.columns:
        return df

    if not pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
        df["timestamp"] = pd.to_datetime(
            df["timestamp"], dayfirst=True, errors="coerce"
        )

    ts = df["timestamp"]
    df["date"]        = ts.dt.date
    df["hour"]        = ts.dt.hour
    df["day_of_week"] = ts.dt.day_name()
    # Preserve Sheet1's 'week' column; compute from timestamp only when absent
    if "week" not in df.columns:
        df["week"] = ts.dt.isocalendar().week.astype("Int64")
    df["month"] = ts.dt.month
    df["year"]  = ts.dt.year
    return df


def _clean_msisdn(df: pd.DataFrame) -> pd.DataFrame:
    """Normalise MSISDN: strip whitespace, remove leading +/00."""
    if "msisdn" in df.columns:
        df["msisdn"] = (
            df["msisdn"]
            .astype(str)
            .str.replace(r"\s+", "", regex=True)
            .str.replace(r"^\+", "", regex=True)
            .str.replace(r"^00", "", regex=True)
            .str.strip()
        )
    return df


# ═════════════════════════════════════════════════════════════════════════════
# UTILITIES (private)
# ═════════════════════════════════════════════════════════════════════════════

def _apply_mapping(
    df: pd.DataFrame,
    col_map: dict[str, str],
    warn: bool = True,
) -> pd.DataFrame:
    """
    Rename / drop columns according to col_map.

    Keys are compared case-insensitively (columns lower-cased before lookup)
    so the map no longer needs duplicate casing entries.  FIX L5.
    """
    df = df.copy()

    # Normalise column names to lowercase for lookup
    lower_map = {k.lower(): v for k, v in col_map.items()}

    rename: dict[str, str] = {}
    to_drop: list[str] = []

    for col in df.columns:
        target = lower_map.get(col.lower())
        if target is None:
            continue
        if target == "_DROP_":
            to_drop.append(col)
        else:
            rename[col] = target

    if to_drop:
        df = df.drop(columns=to_drop, errors="ignore")
        logger.info(f"  Dropped (GDPR): {to_drop}")

    df = df.rename(columns=rename)
    logger.info(f"  {len(rename)} columns renamed")

    if warn:
        mapped_targets = {v for v in col_map.values() if v != "_DROP_"}
        unmapped = [c for c in df.columns if c not in mapped_targets]
        if unmapped:
            logger.warning(f"  Unmapped columns (kept as-is): {unmapped}")

    return df


def _find_sheet(
    available: list[str],
    candidates: list[str],
) -> Optional[str]:
    """
    Return the first candidate sheet name found in available, case-insensitive.

    Returns None when no match is found.
    """
    available_lower = {s.strip().upper(): s for s in available}
    for candidate in candidates:
        match = available_lower.get(candidate.strip().upper())
        if match is not None:
            return match
    return None


def _load_synthetic_fallback() -> dict[str, pd.DataFrame]:
    """
    Load synthetic CSV data when the real Excel file is absent.

    FIX L2: the original code used DataFrame.get() to filter by service_type
    which returns a Series, not a scalar string, causing silent comparison
    failures.  Fixed to use standard boolean indexing.
    """
    cfg = _get_cfg()
    synth_dir = Path(cfg["paths"]["synthetic_data"])

    complaints = pd.read_csv(synth_dir / cfg["data"]["complaint_file"])
    kpi_data   = pd.read_csv(synth_dir / cfg["data"]["kpi_file"])

    complaints["timestamp"] = pd.to_datetime(complaints["timestamp"])
    kpi_data["timestamp"]   = pd.to_datetime(kpi_data["timestamp"])

    has_svc = "service_type" in kpi_data.columns
    kpi_data_only  = kpi_data[kpi_data["service_type"] == "Data"]  if has_svc else kpi_data
    kpi_voice_only = kpi_data[kpi_data["service_type"] == "Voice"] if has_svc else pd.DataFrame()

    return {
        "complaints":      complaints,
        "kpi_data":        kpi_data,
        "kpi_data_only":   kpi_data_only,
        "kpi_voice_only":  kpi_voice_only,
    }


# ═════════════════════════════════════════════════════════════════════════════
# DIAGNOSTIC TOOLS (public)
# ═════════════════════════════════════════════════════════════════════════════

def get_data_summary(df: pd.DataFrame, name: str = "Dataset") -> None:
    """Print a concise summary of shape, period, nulls, and service split."""
    sep = "=" * 65
    print(f"\n{sep}")
    print(f"  {name}")
    print(sep)
    print(f"  Shape      : {df.shape[0]:,} rows × {df.shape[1]} columns")

    if "timestamp" in df.columns:
        print(f"  Period     : {df['timestamp'].min()} → {df['timestamp'].max()}")
    if "service_type" in df.columns:
        print(f"  Services   : {df['service_type'].value_counts().to_dict()}")
    if "kpi_source" in df.columns:
        print(f"  KPI source : {df['kpi_source'].value_counts().to_dict()}")

    missing = df.isnull().sum()
    missing = missing[missing > 0]
    if not missing.empty:
        print("\n  Missing values:")
        for col, cnt in missing.items():
            print(f"    {col:<42} {cnt:>6,}  ({cnt / len(df) * 100:.1f}%)")
    print(f"{sep}\n")


def preview_excel(path: Optional[Path] = None) -> None:
    """
    Print a mapping preview for all three sheets in real_complaints.xlsx.

    Useful in Notebook 00 to verify column detection before running the
    full pipeline.

    Usage
    -----
    >>> from src.ingestion.data_loader import preview_excel
    >>> preview_excel()
    """
    cfg = _get_cfg()
    if path is None:
        path = Path(cfg["paths"]["raw_data"]) / REAL_FILE

    if not path.exists():
        print(f"File not found: {path}")
        return

    xl = pd.ExcelFile(path)
    print(f"\nFile   : {path.name}")
    print(f"Sheets : {xl.sheet_names}\n")

    # Identify which map applies to each sheet by sampling 2 rows
    _SHEET_MARKERS = {
        "complaint": {"case id", "case open datetime", "province",
                      "segment msisdn concern"},
        "data":      {"start time", "network type"},
        "voice":     {"sub category", "case open datetime"},
    }
    _MAP_LOOKUP = {
        "complaint": COMPLAINT_COL_MAP,
        "data":      DATA_COL_MAP,
        "voice":     VOICE_COL_MAP,
    }

    for sheet in xl.sheet_names:
        df_raw = pd.read_excel(xl, sheet_name=sheet, nrows=2)
        df_raw.columns = df_raw.columns.str.strip()
        lower_cols = {c.lower() for c in df_raw.columns}

        chosen_map = VOICE_COL_MAP  # default
        for kind, markers in _SHEET_MARKERS.items():
            if markers & lower_cols:
                chosen_map = _MAP_LOOKUP[kind]
                break

        rows = []
        lower_chosen = {k.lower(): v for k, v in chosen_map.items()}
        for col in df_raw.columns:
            target = lower_chosen.get(col.lower(), "KEEP AS-IS")
            if target == "_DROP_":
                action = "DROP (GDPR)"
            elif target == "KEEP AS-IS":
                action = "KEEP"
            else:
                action = f"RENAME → {target}"
            sample = (
                str(df_raw[col].dropna().iloc[0])[:30]
                if not df_raw[col].dropna().empty
                else "-"
            )
            rows.append({"Excel column": col, "Action": action, "Sample": sample})

        print(f"{'─' * 65}")
        print(f"  Sheet: {sheet}")
        print(f"{'─' * 65}")
        print(pd.DataFrame(rows).to_string(index=False))
        print()