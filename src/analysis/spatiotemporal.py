"""
Spatio-Temporal Analysis Module
=================================
Deliverable D3 (part 1) — Geographic and time-based complaint pattern detection.

Six analysis sections:

  1. Geographic hotspot mapping
     — Complaint density by region and city
     — Cell-level hotspot ranking
     — Folium interactive heatmap (saved as HTML)

  2. Temporal pattern analysis
     — Hourly distribution (peak hour detection)
     — Day-of-week cycle
     — Monthly trends and seasonality

  3. Hour × Day-of-week heatmap
     — 2D intensity map: when are complaints highest?

  4. Anomaly burst detection
     — Days where complaint volume exceeds mean + 2σ per region
     — Burst characterisation: duration, magnitude, service type

  5. Service-type segmentation by region
     — Which regions suffer most from Data vs Voice vs SMS issues

  6. Cell-level hotspot analysis
     — Top complaint-generating cells
     — Cell complaint rate over time

Usage (from notebook):
    from src.analysis.spatiotemporal import SpatioTemporalAnalyser, REGION_CENTROIDS
    st = SpatioTemporalAnalyser()
    results = st.run(complaints_clean, complaint_agg, kpi_agg)
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from loguru import logger

# FIX ST5: only suppress specific known noisy warnings, not everything
warnings.filterwarnings("ignore", category=FutureWarning, module="pandas")
warnings.filterwarnings("ignore", category=FutureWarning, module="seaborn")

# FIX ST1: lazy config + dir initialisation — no crash on import
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


def _get_dirs() -> tuple[Path, Path]:
    """Return (reports_dir, figures_dir), creating them if needed."""
    cfg = _get_cfg()
    reports_dir = Path(cfg["paths"]["reports"]) / "exports"
    figures_dir = Path(cfg["paths"]["figures"])
    reports_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)
    return reports_dir, figures_dir


# ── Constants ────────────────────────────────────────────────────────────────
# Exported so notebooks can import instead of redefining (FIX N8)
REGION_CENTROIDS: dict[str, tuple[float, float]] = {
    "Tunis":       (36.818, 10.165),
    "Sfax":        (34.740, 10.760),
    "Sousse":      (35.825, 10.638),
    "Kairouan":    (35.671, 10.100),
    "Bizerte":     (37.275,  9.873),
    "Gabes":       (33.881, 10.097),
    "Ariana":      (36.862, 10.193),
    "Gafsa":       (34.422,  8.784),
    "Monastir":    (35.777, 10.826),
    "Ben Arous":   (36.753, 10.228),
    "Nabeul":      (36.451, 10.736),
    "Manouba":     (36.810, 10.100),
    "Zaghouan":    (36.402, 10.143),
    "Beja":        (36.733,  9.182),
    "Jendouba":    (36.501,  8.776),
    "Kef":         (36.182,  8.705),
    "Siliana":     (36.085,  9.372),
    "Mahdia":      (35.505, 11.062),
    "Sidi Bouzid": (35.038,  9.485),
    "Kasserine":   (35.167,  8.836),
    "Tozeur":      (33.920,  8.134),
    "Kebili":      (33.705,  8.965),
    "Tataouine":   (32.929, 10.452),
    "Medenine":    (33.354, 10.501),
}

PEAK_HOURS = {8, 9, 12, 13, 17, 18, 19, 20}
DOW_ORDER  = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
]


class SpatioTemporalAnalyser:
    """
    Full spatio-temporal analysis pipeline.
    All outputs are DataFrames + saved figures/HTML files.
    """

    def run(
        self,
        complaints_clean: pd.DataFrame,
        complaint_agg:    pd.DataFrame,
        kpi_agg:          pd.DataFrame,
    ) -> dict:
        """
        Run all six analysis sections.

        Returns
        -------
        dict with keys:
            regional_hotspots, cell_hotspots,
            hourly_patterns, dow_patterns, monthly_trends,
            hour_dow_heatmap, anomaly_bursts,
            service_by_region, summary
        """
        logger.info("=" * 60)
        logger.info("SPATIO-TEMPORAL ANALYSIS")
        logger.info("=" * 60)

        cc = complaints_clean.copy()
        ca = complaint_agg.copy()
        cc["timestamp"] = pd.to_datetime(cc["timestamp"])
        ca["date"]      = pd.to_datetime(ca["date"])

        # Ensure derived temporal columns exist
        for col, expr in [
            ("hour",        cc["timestamp"].dt.hour),
            ("day_of_week", cc["timestamp"].dt.day_name()),
            ("week",        cc["timestamp"].dt.isocalendar().week.astype(int)),
            ("month",       cc["timestamp"].dt.month),
            ("year",        cc["timestamp"].dt.year),
        ]:
            if col not in cc.columns:
                cc[col] = expr

        # Defaults for optional DCLM columns
        for col, default in [
            ("resolution_status",  "Unknown"),
            ("provider_group",     "Unknown"),
            ("complaint_typology", "Unknown"),
        ]:
            if col not in cc.columns:
                cc[col] = default

        # 1. Geographic hotspots
        logger.info("\n[1/6] Geographic hotspot mapping ...")
        regional_hotspots, cell_hotspots = self._geographic_hotspots(cc, kpi_agg)

        # 2. Temporal patterns
        logger.info("\n[2/6] Temporal pattern analysis ...")
        hourly, dow, monthly, peak_offpeak_ratio = self._temporal_patterns(cc)

        # 3. Hour × DoW heatmap
        logger.info("\n[3/6] Building hour × day-of-week heatmap ...")
        hour_dow = self._hour_dow_heatmap(cc)

        # 4. Anomaly burst detection
        logger.info("\n[4/6] Detecting anomaly bursts ...")
        bursts = self._anomaly_bursts(ca)

        # 5. Service-type by region
        logger.info("\n[5/6] Service-type segmentation by region ...")
        service_by_region = self._service_by_region(cc)

        # 6. Folium interactive map (FIX ST7: removed unused kpi_agg param)
        logger.info("\n[6/6] Building interactive Folium map ...")
        self._build_folium_map(regional_hotspots)

        summary = self._build_summary(
            regional_hotspots, hourly, peak_offpeak_ratio,
            bursts, service_by_region,
        )
        self._print_summary(summary)
        self._save_csv(
            regional_hotspots, cell_hotspots, hourly,
            dow, monthly, bursts, service_by_region,
        )

        return {
            "regional_hotspots":  regional_hotspots,
            "cell_hotspots":      cell_hotspots,
            "hourly_patterns":    hourly,
            "dow_patterns":       dow,
            "monthly_trends":     monthly,
            "hour_dow_heatmap":   hour_dow,
            "anomaly_bursts":     bursts,
            "service_by_region":  service_by_region,
            "summary":            summary,
        }

    # ─────────────────────────────────────────────────────────────────────
    # 1. GEOGRAPHIC HOTSPOTS
    # ─────────────────────────────────────────────────────────────────────

    def _geographic_hotspots(
        self,
        cc:      pd.DataFrame,
        kpi_agg: pd.DataFrame,
    ) -> tuple[pd.DataFrame, pd.DataFrame]:
        """
        Regional hotspot table + cell-level top-20 table.

        FIX ST2: original agg_dict used (column, func) tuples passed via
        **kwargs to groupby.agg(), which is valid but breaks when mixing
        with lambda functions in pandas>=1.3.  Replaced with explicit
        pd.NamedAgg throughout.
        """
        n_days = cc["timestamp"].dt.date.nunique()

        # Build named-agg specs dynamically
        agg_kwargs: dict[str, pd.NamedAgg] = {
            "total_complaints": pd.NamedAgg("case_id", "count"),
            "dominant_category": pd.NamedAgg(
                "complaint_category",
                lambda x: x.value_counts().index[0] if len(x) > 0 else "Unknown",
            ),
            "dominant_service": pd.NamedAgg(
                "service_type",
                lambda x: x.value_counts().index[0] if len(x) > 0 else "Unknown",
            ),
        }
        if "cell_id" in cc.columns:
            agg_kwargs["unique_cells"] = pd.NamedAgg("cell_id", "nunique")
        if "priority_encoded" in cc.columns:
            agg_kwargs["high_priority_count"] = pd.NamedAgg(
                "priority_encoded", lambda x: int((x >= 2).sum())
            )
        if "segment_encoded" in cc.columns:
            agg_kwargs["vip_count"] = pd.NamedAgg(
                "segment_encoded", lambda x: int((x >= 2).sum())
            )
        if "latitude" in cc.columns:
            agg_kwargs["lat"] = pd.NamedAgg("latitude", "mean")
        if "longitude" in cc.columns:
            agg_kwargs["lon"] = pd.NamedAgg("longitude", "mean")

        regional = cc.groupby("region").agg(**agg_kwargs).reset_index()

        # Fill optional columns with defaults
        if "unique_cells"        not in regional.columns:
            regional["unique_cells"] = 0
        if "high_priority_count" not in regional.columns:
            regional["high_priority_count"] = 0
        if "vip_count"           not in regional.columns:
            regional["vip_count"] = 0
        if "lat" not in regional.columns:
            regional["lat"] = regional["region"].map(
                lambda r: REGION_CENTROIDS.get(r, (np.nan, np.nan))[0]
            )
        if "lon" not in regional.columns:
            regional["lon"] = regional["region"].map(
                lambda r: REGION_CENTROIDS.get(r, (np.nan, np.nan))[1]
            )

        regional["complaint_rate_per_day"] = (
            regional["total_complaints"] / n_days
        ).round(2)
        regional["high_priority_pct"] = (
            regional["high_priority_count"]
            / regional["total_complaints"].replace(0, np.nan) * 100
        ).fillna(0).round(1)

        # Join average QoE from kpi_agg
        ka = kpi_agg.copy()
        ka["date"] = pd.to_datetime(ka["date"])
        qoe_col = next(
            (c for c in ["qoe_score_mean", "data_qoe_score_mean"] if c in ka.columns),
            None,
        )
        if qoe_col:
            avg_qoe = (
                ka.groupby("region")[qoe_col]
                .mean()
                .round(2)
                .reset_index()
                .rename(columns={qoe_col: "avg_qoe_score"})
            )
            regional = regional.merge(avg_qoe, on="region", how="left")
        else:
            regional["avg_qoe_score"] = np.nan

        regional["hotspot_rank"] = (
            regional["total_complaints"].rank(ascending=False).astype(int)
        )
        regional = regional.sort_values("total_complaints", ascending=False).reset_index(drop=True)

        logger.info("  Regional hotspot ranking:")
        for _, row in regional.head(5).iterrows():
            qoe_val = row.get("avg_qoe_score", np.nan)
            qoe_str = f"{qoe_val:.1f}" if pd.notna(qoe_val) else "N/A"
            logger.info(
                f"    #{int(row['hotspot_rank'])} {row['region']:<12} "
                f"{int(row['total_complaints']):>6,} complaints  QoE={qoe_str}"
            )

        # Cell-level (only when cell_id column present)
        if "cell_id" not in cc.columns:
            logger.info("  Cell-level: no cell_id column — skipping")
            cells = pd.DataFrame(
                columns=["cell_rank", "cell_id", "region",
                         "total_complaints", "dominant_category"]
            )
        else:
            cell_kwargs: dict[str, pd.NamedAgg] = {
                "total_complaints": pd.NamedAgg("case_id", "count"),
                "dominant_category": pd.NamedAgg(
                    "complaint_category",
                    lambda x: x.value_counts().index[0] if len(x) > 0 else "Unknown",
                ),
            }
            if "latitude"  in cc.columns:
                cell_kwargs["lat"] = pd.NamedAgg("latitude",  "mean")
            if "longitude" in cc.columns:
                cell_kwargs["lon"] = pd.NamedAgg("longitude", "mean")

            cells = (
                cc[cc["cell_id"] != "UNKNOWN"]
                .groupby(["cell_id", "region"])
                .agg(**cell_kwargs)
                .reset_index()
                .sort_values("total_complaints", ascending=False)
                .head(20)
                .reset_index(drop=True)
            )
            cells["cell_rank"] = cells.index + 1
            if len(cells) > 0:
                logger.info(
                    f"  Top cell: {cells.iloc[0]['cell_id']} "
                    f"({int(cells.iloc[0]['total_complaints'])} complaints)"
                )

        return regional, cells

    # ─────────────────────────────────────────────────────────────────────
    # 2. TEMPORAL PATTERNS
    # ─────────────────────────────────────────────────────────────────────

    def _temporal_patterns(
        self, cc: pd.DataFrame
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, float]:
        """
        Hourly, day-of-week, and monthly complaint distributions.

        FIX ST4: peak_offpeak_ratio was stored in every hourly row — now
        returned as a standalone float alongside the DataFrames.

        FIX ST6: monthly service_type columns sorted for deterministic order.

        Returns
        -------
        hourly, dow, monthly, peak_offpeak_ratio
        """
        total = len(cc)

        # Hourly
        hourly = (
            cc.groupby("hour")
            .size()
            .reset_index(name="complaint_count")
        )
        hourly["pct"]     = (hourly["complaint_count"] / total * 100).round(2)
        hourly["is_peak"] = hourly["hour"].isin(PEAK_HOURS).astype(int)
        hourly["period"]  = hourly["hour"].apply(_hour_label)

        peak_total    = hourly.loc[hourly["is_peak"] == 1, "complaint_count"].sum()
        offpeak_total = hourly.loc[hourly["is_peak"] == 0, "complaint_count"].sum()
        peak_offpeak_ratio = round(peak_total / max(offpeak_total, 1), 2)

        logger.info(
            f"  Peak/off-peak ratio: {peak_offpeak_ratio:.2f}x  "
            f"| Peak hours: {sorted(PEAK_HOURS)}"
        )

        # Day of week
        dow = (
            cc.groupby("day_of_week")
            .size()
            .reindex(DOW_ORDER)
            .fillna(0)
            .astype(int)
            .reset_index(name="complaint_count")
        )
        dow["pct"]        = (dow["complaint_count"] / total * 100).round(2)
        dow["is_weekend"] = dow["day_of_week"].isin(["Saturday", "Sunday"]).astype(int)

        # Monthly — FIX ST6: sort service_type columns for determinism
        cc = cc.copy()
        cc["month_label"] = cc["timestamp"].dt.to_period("M").astype(str)
        monthly = (
            cc.groupby(["month_label", "service_type"])
            .size()
            .unstack(fill_value=0)
            .reset_index()
        )
        # Sort service columns alphabetically so order never changes
        svc_cols = sorted([c for c in monthly.columns if c != "month_label"])
        monthly  = monthly[["month_label"] + svc_cols]
        monthly["total"] = monthly[svc_cols].sum(axis=1)
        monthly = monthly.sort_values("month_label").reset_index(drop=True)

        return hourly, dow, monthly, peak_offpeak_ratio

    # ─────────────────────────────────────────────────────────────────────
    # 3. HOUR × DAY-OF-WEEK HEATMAP
    # ─────────────────────────────────────────────────────────────────────

    def _hour_dow_heatmap(self, cc: pd.DataFrame) -> pd.DataFrame:
        """2D pivot: rows=day-of-week, columns=hour, values=complaint count."""
        present_days = [d for d in DOW_ORDER if d in cc["day_of_week"].unique()]
        pivot = (
            cc.groupby(["day_of_week", "hour"])
            .size()
            .unstack(fill_value=0)
            .reindex(present_days)
        )
        max_idx  = np.unravel_index(pivot.values.argmax(), pivot.shape)
        peak_day  = pivot.index[max_idx[0]]
        peak_hour = pivot.columns[max_idx[1]]
        logger.info(
            f"  Peak slot: {peak_day} at {peak_hour:02d}:00 "
            f"({pivot.values.max():,} complaints)"
        )
        return pivot

    # ─────────────────────────────────────────────────────────────────────
    # 4. ANOMALY BURST DETECTION
    # ─────────────────────────────────────────────────────────────────────

    def _anomaly_bursts(self, ca: pd.DataFrame) -> pd.DataFrame:
        """
        Identify burst events per region: consecutive days with
        complaint_count > mean + 2σ.

        FIX ST3: complaint_spike_flag may be absent (e.g. if complaint_agg
        was loaded from parquet saved before feature engineering added the
        column).  Fall back to computing the flag inline from z-score.
        """
        rows = []
        for region, grp in ca.groupby("region"):
            grp   = grp.sort_values("date").reset_index(drop=True)
            mean_ = grp["total_complaints"].mean()
            std_  = grp["total_complaints"].std()
            if std_ == 0 or pd.isna(std_):
                continue

            grp["zscore"] = (grp["total_complaints"] - mean_) / std_

            # FIX ST3: use pre-computed flag if available, else derive it
            if "complaint_spike_flag" in grp.columns:
                grp["burst"] = grp["complaint_spike_flag"].astype(int)
            else:
                grp["burst"] = (grp["zscore"] > 2).astype(int)

            grp["burst_group"] = (
                grp["burst"] != grp["burst"].shift()
            ).cumsum()

            for _, burst_df in grp[grp["burst"] == 1].groupby("burst_group"):
                rows.append({
                    "region":           region,
                    "burst_start":      burst_df["date"].min(),
                    "burst_end":        burst_df["date"].max(),
                    "duration_days":    len(burst_df),
                    "total_complaints": int(burst_df["total_complaints"].sum()),
                    "peak_complaints":  int(burst_df["total_complaints"].max()),
                    "mean_zscore":      round(float(burst_df["zscore"].mean()), 2),
                    "peak_zscore":      round(float(burst_df["zscore"].max()),  2),
                    "severity": (
                        "Critical" if burst_df["zscore"].max() > 3 else
                        "High"     if burst_df["zscore"].max() > 2 else
                        "Medium"
                    ),
                })

        if not rows:
            return pd.DataFrame()

        bursts = (
            pd.DataFrame(rows)
            .sort_values("peak_zscore", ascending=False)
            .reset_index(drop=True)
        )
        logger.info(
            f"  Burst events: {len(bursts)}  "
            f"| Critical: {(bursts['severity']=='Critical').sum()}  "
            f"| High: {(bursts['severity']=='High').sum()}"
        )
        logger.info("  Top 3 bursts:")
        for _, row in bursts.head(3).iterrows():
            logger.info(
                f"    {row['region']:<12} "
                f"{str(row['burst_start'])[:10]} → "
                f"{str(row['burst_end'])[:10]}  "
                f"peak_z={row['peak_zscore']:.2f}  [{row['severity']}]"
            )
        return bursts

    # ─────────────────────────────────────────────────────────────────────
    # 5. SERVICE TYPE BY REGION
    # ─────────────────────────────────────────────────────────────────────

    def _service_by_region(self, cc: pd.DataFrame) -> pd.DataFrame:
        """
        Per-region complaint breakdown by service type,
        normalised as % of regional total.
        """
        service = (
            cc.groupby(["region", "service_type"])
            .size()
            .unstack(fill_value=0)
            .reset_index()
        )
        # Sort service columns for determinism
        svc_cols = sorted([c for c in service.columns if c != "region"])
        service  = service[["region"] + svc_cols]

        totals = service[svc_cols].sum(axis=1)
        for col in svc_cols:
            service[f"{col}_pct"] = (
                service[col] / totals.replace(0, np.nan) * 100
            ).fillna(0).round(1)

        service["dominant_service"] = service[svc_cols].idxmax(axis=1)

        logger.info("  Service type breakdown by region:")
        pct_cols = [c for c in service.columns if c.endswith("_pct")]
        for _, row in service.iterrows():
            parts = "  ".join(
                f"{c.replace('_pct','')}:{row[c]:.0f}%" for c in pct_cols
            )
            logger.info(f"    {row['region']:<12} {parts}")

        return service

    # ─────────────────────────────────────────────────────────────────────
    # 6. FOLIUM INTERACTIVE MAP
    # ─────────────────────────────────────────────────────────────────────

    def _build_folium_map(self, regional: pd.DataFrame) -> None:
        """
        Build and save a Folium bubble map of regional complaint hotspots.

        FIX ST7: removed unused kpi_agg parameter — avg_qoe_score is
        already present in the regional DataFrame from step 1.
        """
        try:
            import folium

            reports_dir, _ = _get_dirs()
            max_complaints = regional["total_complaints"].max()

            m = folium.Map(
                location=[35.5, 10.0], zoom_start=7,
                tiles="CartoDB dark_matter",
            )

            for _, row in regional.iterrows():
                region = row["region"]
                coords = REGION_CENTROIDS.get(
                    region,
                    (row.get("lat", np.nan), row.get("lon", np.nan)),
                )
                if any(pd.isna(c) for c in coords):
                    continue

                lat, lon  = coords
                count     = int(row["total_complaints"])
                radius    = 15 + (count / max_complaints) * 40
                qoe       = row.get("avg_qoe_score", 70)
                if pd.isna(qoe):
                    qoe = 70
                color = (
                    "#2ecc71" if qoe >= 80
                    else "#f39c12" if qoe >= 60
                    else "#e74c3c"
                )

                folium.CircleMarker(
                    location=[lat, lon],
                    radius=radius,
                    color=color, fill=True,
                    fill_color=color, fill_opacity=0.55,
                    weight=2,
                    tooltip=folium.Tooltip(
                        f"<b>{region}</b><br>"
                        f"Complaints: {count:,}<br>"
                        f"QoE: {qoe:.1f}<br>"
                        f"Dominant: {row.get('dominant_category', 'N/A')}"
                    ),
                ).add_to(m)

                folium.Marker(
                    location=[lat, lon],
                    icon=folium.DivIcon(
                        html=(
                            f'<div style="font-size:9px;color:white;'
                            f'font-weight:bold;text-align:center;'
                            f'text-shadow:1px 1px 2px black;">'
                            f"{region}<br>{count:,}</div>"
                        ),
                        icon_size=(75, 28),
                        icon_anchor=(37, 14),
                    ),
                ).add_to(m)

            legend_html = """
            <div style="position:fixed;bottom:30px;left:30px;
                        background:rgba(0,0,0,0.7);padding:12px;
                        border-radius:8px;color:white;font-size:12px;">
              <b>QoE Colour Scale</b><br>
              <span style="color:#2ecc71">●</span> Good (≥ 80)<br>
              <span style="color:#f39c12">●</span> Fair (60–79)<br>
              <span style="color:#e74c3c">●</span> Poor (&lt; 60)<br>
              <i>Circle size = complaint volume</i>
            </div>"""
            m.get_root().html.add_child(folium.Element(legend_html))

            map_path = reports_dir / "st_regional_map.html"
            m.save(str(map_path))
            logger.info(f"  Regional Folium map saved → {map_path}")

        except ImportError:
            logger.warning("  folium not installed — skipping map (pip install folium)")

    # ─────────────────────────────────────────────────────────────────────
    # SUMMARY & SAVE
    # ─────────────────────────────────────────────────────────────────────

    def _build_summary(
        self,
        regional:           pd.DataFrame,
        hourly:             pd.DataFrame,
        peak_offpeak_ratio: float,          # FIX ST4: explicit param
        bursts:             pd.DataFrame,
        service:            pd.DataFrame,
    ) -> dict:
        summary: dict = {}

        if not regional.empty:
            top = regional.iloc[0]
            summary["top_hotspot_region"]     = top["region"]
            summary["top_hotspot_complaints"] = int(top["total_complaints"])
            summary["top_hotspot_category"]   = top.get("dominant_category", "N/A")

        if not hourly.empty:
            peak_h = int(hourly.loc[hourly["complaint_count"].idxmax(), "hour"])
            summary["peak_hour"]          = peak_h
            summary["peak_hour_label"]    = _hour_label(peak_h)
            summary["peak_offpeak_ratio"] = peak_offpeak_ratio   # FIX ST4

        if not bursts.empty:
            summary["total_burst_events"] = len(bursts)
            summary["critical_bursts"]    = int(
                (bursts["severity"] == "Critical").sum()
            )
            summary["most_bursty_region"] = (
                bursts.groupby("region").size().idxmax()
            )

        if not service.empty:
            summary["dominant_service_by_region"] = (
                service.set_index("region")["dominant_service"].to_dict()
            )

        return summary

    def _print_summary(self, summary: dict) -> None:
        logger.info("\n" + "=" * 60)
        logger.info("  SPATIO-TEMPORAL ANALYSIS — KEY FINDINGS")
        logger.info("=" * 60)
        if "top_hotspot_region" in summary:
            logger.info(
                f"  Top hotspot    : {summary['top_hotspot_region']} "
                f"({summary['top_hotspot_complaints']:,} complaints)"
            )
            logger.info(f"  Dominant issue : {summary['top_hotspot_category']}")
        if "peak_hour" in summary:
            logger.info(
                f"  Peak hour      : {summary['peak_hour']:02d}:00 "
                f"({summary['peak_hour_label']})  "
                f"ratio={summary['peak_offpeak_ratio']:.2f}x"
            )
        if "total_burst_events" in summary:
            logger.info(
                f"  Burst events   : {summary['total_burst_events']} total  "
                f"| {summary['critical_bursts']} critical  "
                f"| Most bursty: {summary['most_bursty_region']}"
            )
        logger.info("=" * 60)

    def _save_csv(
        self,
        regional, cells, hourly,
        dow, monthly, bursts, service,
    ) -> None:
        reports_dir, _ = _get_dirs()
        saves = {
            "st_regional_hotspots.csv": regional,
            "st_cell_hotspots.csv":     cells,
            "st_hourly_patterns.csv":   hourly,
            "st_dow_patterns.csv":      dow,
            "st_monthly_trends.csv":    monthly,
            "st_anomaly_bursts.csv":    bursts,
            "st_service_by_region.csv": service,
        }
        for fname, df in saves.items():
            if df is not None and not df.empty:
                df.to_csv(reports_dir / fname, index=False)
        logger.info(f"  ST report tables saved → {reports_dir}")


# ─────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────

def _hour_label(h: int) -> str:
    if   h < 6:  return "Night (00-05)"
    elif h < 9:  return "Early Morning (06-08)"
    elif h < 12: return "Morning (09-11)"
    elif h < 14: return "Lunch (12-13)"
    elif h < 17: return "Afternoon (14-16)"
    elif h < 21: return "Evening (17-20)"
    else:        return "Late Evening (21-23)"