"""
dataCollectionist Loader & Integrator
=======================================
Intègre dataCollectionist.csv dans le pipeline SpiriCom.

Utilisation :
    from src.ingestion.data_collectionist_loader import (
        load_collectionist,
        build_kpi_from_collectionist,
        join_complaints_with_kpi,
    )

    # Charger le CSV
    dc = load_collectionist("data/raw/dataCollectionist.csv")

    # Créer kpi_agg compatible avec le pipeline (remplace synthetic_kpi.parquet)
    kpi_real = build_kpi_from_collectionist(dc)

    # Enrichir les plaintes avec les KPIs réels
    complaints_enriched = join_complaints_with_kpi(complaints_clean, dc)
"""

from __future__ import annotations
import pandas as pd
import numpy as np
from pathlib import Path
from loguru import logger

# ── Column mapping : dataCollectionist → SpiriCom naming ─────────────────────
# These are the real KPI columns that replace synthetic_kpi.parquet

KPI_COLUMN_MAP = {
    # Latency & network delay
    "e2e_delay_ms":                         "latency_ms",
    "client_rtt_ms":                        "client_rtt_ms",
    "server_rtt_ms":                        "server_rtt_ms",
    "dns_delay":                            "dns_delay_ms",
    "SYN_SYN_ACK_delay":                   "tcp_setup_delay_ms",

    # Packet loss
    "Client_Packet_Loss_Rate":              "packet_loss_pct",
    "SERVER_Packet_Loss_Rate":              "server_packet_loss_pct",

    # Throughput
    "video_streaming_download_throughput":  "dl_throughput_kbps",
    "VoIP_Voice_Downlink_Throughput":       "voice_dl_throughput_kbps",
    "VoIP_Voice_Uplink_Throughput":         "voice_ul_throughput_kbps",
    "Page_Download_Throughput":             "web_dl_throughput_kbps",
    "File_Sharing_Download_Throughput":     "file_dl_throughput_kbps",
    "File_Sharing_Upload_Throughput":       "file_ul_throughput_kbps",

    # Success rates
    "TCP_connection_sr":                    "data_session_success_rate",
    "E_RAB_SR":                             "erab_success_rate",
    "S1_MME_SR":                            "s1_attach_success_rate",
    "DNS_SR":                               "dns_success_rate",
    "Https_Handshake_Success_Rate":         "https_sr",
    "Video_Streaming_Start_Success_Rate":   "video_start_sr",
    "Page_Response_Success_Rate":           "page_response_sr",

    # Video streaming quality
    "Video_Streaming_Stall_Frequency":      "video_stall_freq",
    "Video_Streaming_Start_Delay":          "video_start_delay_ms",
    "Video_xkb_start_delay":               "video_buffer_delay_ms",

    # Web browsing
    "Page_Response_Delay":                  "page_response_delay_ms",
    "Page_Browsing_Delay":                  "page_load_delay_ms",

    # VoIP / messaging quality
    "IM_interactive_delay":                 "im_delay_ms",

    # Jitter
    "UDP_Downlink_Jitter":                  "dl_jitter_ms",
    "UDP_Uplink_Jitter":                    "ul_jitter_ms",

    # QoS derived
    "Video_Streaming_Start_Success_Rate":   "video_start_sr",
    "QUIC_Downlink_Packet_Loss_Rate":       "quic_dl_loss_pct",
    "QUIC_Uplink_Packet_Loss_Rate":         "quic_ul_loss_pct",
}

# Columns to DROP immediately (reserved, RGPD, useless)
COLS_TO_DROP = [
    "reserved_field1", "reserved_field2", "reserved_field3",
    "reserved_field4", "reserved_field5",
    "imsi",           # RGPD — drop after dedup
]

# Geography mapping
REGION_COL    = "LAYER1NAME"   # Gouvernorat level → joins to complaints region
SITE_COL      = "SITE_NAME"
LAT_COL       = "latitude"
LON_COL       = "longitude"
TIME_COL      = "TIMEE"
MSISDN_COL    = "msisdn"


def load_collectionist(
    path: str | Path = "data/raw/dataCollectionist.csv",
    nrows: int | None = None,
) -> pd.DataFrame:
    """
    Load and clean dataCollectionist.csv.

    Steps:
        1. Parse timestamps
        2. Drop reserved/RGPD columns
        3. Normalize region names to match Sheet1
        4. Clean MSISDN (remove trailing .0)

    Parameters
    ----------
    path  : path to CSV
    nrows : optional row limit for testing (None = load all)

    Returns
    -------
    Cleaned DataFrame with original column names + 'region' alias
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"dataCollectionist not found: {path}")

    logger.info(f"Loading dataCollectionist from {path}...")
    dc = pd.read_csv(path, nrows=nrows, low_memory=False)
    logger.info(f"  Loaded: {dc.shape}")

    # Drop reserved columns (those that exist)
    drop_existing = [c for c in COLS_TO_DROP if c in dc.columns]
    if drop_existing:
        dc = dc.drop(columns=drop_existing)
        logger.info(f"  Dropped {len(drop_existing)} reserved/RGPD columns")

    # Parse timestamp
    if TIME_COL in dc.columns:
        dc[TIME_COL] = pd.to_datetime(dc[TIME_COL], errors="coerce")
        dc["date"]   = dc[TIME_COL].dt.date
        logger.info(f"  Date range: {dc['date'].min()} → {dc['date'].max()}")

    # Clean MSISDN (float strings like '21612345678.0')
    if MSISDN_COL in dc.columns:
        dc[MSISDN_COL] = (dc[MSISDN_COL].astype(str)
                          .str.replace(r"\.0$", "", regex=True)
                          .str.strip())

    # Add 'region' alias from LAYER1NAME (normalize to match Sheet1)
    if REGION_COL in dc.columns:
        dc["region"] = (dc[REGION_COL]
                        .astype(str)
                        .str.strip()
                        .str.title())
        logger.info(f"  Regions: {sorted(dc['region'].unique().tolist())}")

    # ── Operator segmentation ────────────────────────────────────────────────
    if "mcc" in dc.columns and "mnc" in dc.columns:
        dc["mcc"] = dc["mcc"].astype(str).str.strip()
        dc["mnc"] = dc["mnc"].astype(str).str.strip()
        is_ooredoo = (dc["mcc"] == "605") & (dc["mnc"] == "03")
        is_tt      = (dc["mcc"] == "605") & (dc["mnc"] == "02")
        is_orange  = (dc["mcc"] == "605") & (dc["mnc"] == "01")
        dc["operator"] = "Other"
        dc.loc[is_ooredoo, "operator"] = "Ooredoo"
        dc.loc[is_tt,      "operator"] = "TunisieTelecom"
        dc.loc[is_orange,  "operator"] = "Orange"
        dc.loc[dc["mcc"] != "605", "operator"] = "Foreign"
        logger.info(f"  Operator breakdown: {dc['operator'].value_counts().to_dict()}")

    # ── Remove roaming OUT (Ooredoo subscriber abroad — foreign network KPI) ──
    if "roaming_direction" in dc.columns:
        n_before = len(dc)
        dc = dc[dc["roaming_direction"].str.upper() != "OUT"]
        removed = n_before - len(dc)
        logger.info(f"  Removed {removed:,} roaming-OUT rows ({removed/n_before*100:.1f}%)")

    # ── Note about operators ──────────────────────────────────────────────────
    if "operator" in dc.columns:
        n_ooredoo = (dc["operator"] == "Ooredoo").sum()
        logger.info(f"  Ooredoo subscribers : {n_ooredoo:,} / {len(dc):,} "
                    f"({n_ooredoo/len(dc)*100:.1f}%) — joinable with DCLM complaints")
        logger.info(f"  Other operators     : {len(dc)-n_ooredoo:,} — roaming IN visitors")

    # ── Fill numeric nulls with median ────────────────────────────────────────
    num_cols = dc.select_dtypes(include="number").columns.tolist()
    for col in num_cols:
        null_pct = dc[col].isnull().mean()
        if null_pct > 0 and null_pct < 0.5:
            dc[col] = dc[col].fillna(dc[col].median())

    logger.success(f"  dataCollectionist ready: {dc.shape}")
    return dc


def build_kpi_from_collectionist(
    dc: pd.DataFrame,
    output_path: str | Path = "data/raw/real_kpi.parquet",
) -> pd.DataFrame:
    """
    Build a kpi_agg-compatible DataFrame from dataCollectionist.

    Aggregates per (region, date) to produce the same structure as
    synthetic_kpi.parquet — replaces it with real measured values.

    Returns
    -------
    DataFrame with columns: region, date, + all KPI _mean / _std / _min / _p10
    Compatible with kpi_cleaner.py and feature_engineering.py
    """
    logger.info("Building KPI aggregation from dataCollectionist...")

    if "region" not in dc.columns or "date" not in dc.columns:
        raise ValueError("Run load_collectionist() first — missing region/date columns")

    # Rename to SpiriCom naming
    rename_map = {k: v for k, v in KPI_COLUMN_MAP.items() if k in dc.columns}
    dc_kpi = dc.rename(columns=rename_map).copy()

    # KPI numeric columns (after rename)
    kpi_cols = [v for k, v in KPI_COLUMN_MAP.items()
                if v in dc_kpi.columns and k in dc.columns]
    kpi_cols = list(set(kpi_cols))  # deduplicate

    # Add dl_throughput_mbps (convert from kbps if needed)
    if "dl_throughput_kbps" in dc_kpi.columns:
        dc_kpi["dl_throughput_mbps"] = dc_kpi["dl_throughput_kbps"] / 1000
        kpi_cols.append("dl_throughput_mbps")

    # Add composite QoE score
    dc_kpi["qoe_score"] = _compute_qoe(dc_kpi)
    kpi_cols.append("qoe_score")
    dc_kpi["is_degraded_session"] = (dc_kpi["qoe_score"] < 60).astype(int)
    dc_kpi["qoe_category"] = pd.cut(
        dc_kpi["qoe_score"],
        bins=[0, 60, 80, 100],
        labels=["Poor", "Fair", "Good"],
        right=True
    )

    logger.info(f"  KPI columns to aggregate: {len(kpi_cols)}")

    # Aggregate
    agg_funcs = {col: ["mean", "std", "min", "max",
                       lambda x: x.quantile(0.10),
                       lambda x: x.quantile(0.90)]
                 for col in kpi_cols if col in dc_kpi.columns}

    agg_df = dc_kpi.groupby(["region", "date"]).agg(
        {col: ["mean", "std", "min"] for col in kpi_cols if col in dc_kpi.columns}
    )

    # Flatten column names: (col, stat) → col_stat
    agg_df.columns = ["_".join(col).strip() for col in agg_df.columns]
    agg_df = agg_df.reset_index()
    agg_df["date"] = pd.to_datetime(agg_df["date"])

    # Session count
    session_count = dc_kpi.groupby(["region", "date"]).size().reset_index(name="session_count")
    agg_df = agg_df.merge(session_count, on=["region", "date"], how="left")

    # Degraded session rate
    if "is_degraded_session" in dc_kpi.columns:
        deg = (dc_kpi.groupby(["region", "date"])["is_degraded_session"]
               .mean().reset_index(name="degraded_session_rate_pct"))
        deg["degraded_session_rate_pct"] *= 100
        agg_df = agg_df.merge(deg, on=["region", "date"], how="left")

    logger.success(f"  KPI aggregation: {agg_df.shape}")

    # Save
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    agg_df.to_parquet(output_path, index=False)
    logger.success(f"  Saved → {output_path}")

    return agg_df


def join_complaints_with_kpi(
    complaints_clean: pd.DataFrame,
    dc: pd.DataFrame,
    join_window_days: int = 3,
) -> pd.DataFrame:
    """
    Enrich each complaint with the subscriber's real KPI
    from the dataCollectionist (±join_window_days around complaint date).

    Join key: msisdn + date proximity

    Returns
    -------
    complaints_clean with additional KPI columns per complaint row.
    These become features for root_cause_classifier and customer_clustering.
    """
    logger.info("Joining complaints with real KPI per subscriber...")

    cc = complaints_clean.copy()
    cc["complaint_date"] = pd.to_datetime(cc["timestamp"]).dt.date

    # KPI columns to attach
    kpi_rename = {k: v for k, v in KPI_COLUMN_MAP.items() if k in dc.columns}
    dc_sub = dc.rename(columns=kpi_rename).copy()
    dc_sub["kpi_date"] = pd.to_datetime(dc_sub.get("date", dc_sub.get(TIME_COL))).dt.date

    kpi_cols = [v for v in kpi_rename.values() if v in dc_sub.columns]

    joined_rows = []
    total = len(cc)
    matched = 0

    for _, comp_row in cc.iterrows():
        msisdn   = str(comp_row.get("msisdn", ""))
        comp_date = comp_row["complaint_date"]

        # Find KPI records for this MSISDN within ±window days
        sub_kpi = dc_sub[dc_sub[MSISDN_COL] == msisdn]
        if not sub_kpi.empty and "kpi_date" in sub_kpi.columns:
            sub_kpi = sub_kpi[
                abs((pd.to_datetime(sub_kpi["kpi_date"]) -
                     pd.to_datetime(comp_date)).dt.days) <= join_window_days
            ]

        if not sub_kpi.empty:
            # Take mean of KPI values in the window
            kpi_vals = sub_kpi[[c for c in kpi_cols if c in sub_kpi.columns]].mean()
            row = comp_row.to_dict()
            row.update(kpi_vals.to_dict())
            matched += 1
        else:
            row = comp_row.to_dict()

        joined_rows.append(row)

    result = pd.DataFrame(joined_rows)
    logger.success(f"  Joined {matched:,}/{total:,} complaints with real KPI "
                   f"({matched/total*100:.1f}% match rate)")
    return result


def _compute_qoe(dc: pd.DataFrame) -> pd.Series:
    """
    Compute a composite QoE score [0-100] from available KPI columns.
    Adapts to whatever columns are present.
    """
    score = pd.Series(70.0, index=dc.index)  # default
    weight_sum = 0.0

    # Video component (weight 0.3)
    if "video_start_sr" in dc.columns:
        score     += 0.3 * dc["video_start_sr"].clip(0, 100)
        weight_sum += 0.3

    # Web browsing component (weight 0.25)
    if "page_response_sr" in dc.columns:
        score     += 0.25 * dc["page_response_sr"].clip(0, 100)
        weight_sum += 0.25

    # Latency component (weight 0.25) — lower is better
    if "latency_ms" in dc.columns:
        latency_score = (1 - dc["latency_ms"].clip(0, 500) / 500) * 100
        score        += 0.25 * latency_score
        weight_sum   += 0.25

    # Packet loss component (weight 0.2) — lower is better
    if "packet_loss_pct" in dc.columns:
        loss_score = (1 - dc["packet_loss_pct"].clip(0, 10) / 10) * 100
        score     += 0.20 * loss_score
        weight_sum += 0.20

    # Normalize
    if weight_sum > 0:
        score = score / (1 + weight_sum) * (1 + weight_sum)

    return score.clip(0, 100).round(2)


def get_schema_summary(dc: pd.DataFrame) -> pd.DataFrame:
    """
    Print a summary of columns, dtypes, null%, and sample values.
    Useful for first exploration of the dataset.
    """
    rows = []
    for col in dc.columns:
        rows.append({
            "column":      col,
            "dtype":       str(dc[col].dtype),
            "null_pct":    f"{dc[col].isnull().mean()*100:.1f}%",
            "unique":      dc[col].nunique(),
            "sample":      str(dc[col].dropna().iloc[0])[:40] if len(dc[col].dropna()) > 0 else "N/A",
        })
    return pd.DataFrame(rows)