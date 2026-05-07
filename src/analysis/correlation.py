"""
Correlation & Root Cause Analysis Module
==========================================
Deliverable D3 — Statistical linkage between network KPIs
and customer complaint patterns.

Five analysis sections:

  1. Pearson & Spearman correlation matrices
     — KPI means vs complaint counts at (region, date) level

  2. KPI threshold detection
     — Decision-tree stump finds the KPI breakpoint beyond which
       complaint spikes become significantly more likely

  3. Granger causality testing
     — Does KPI degradation *precede* complaint spikes?
     — Tests lags 1–7 days per region

  4. QoE degradation event analysis
     — Links low-QoE region-days to complaint surges

  5. KPI–complaint cross-correlation (CCF)
     — Time-lagged correlation; shows peak lag per KPI

Usage:
    from src.analysis.correlation import CorrelationAnalyser
    analyser = CorrelationAnalyser()
    results  = analyser.run(complaint_agg, kpi_agg, feature_matrix)
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from loguru import logger
from scipy import stats
from scipy.stats import pearsonr, spearmanr
from sklearn.tree import DecisionTreeClassifier

# FIX C6: scoped warnings — not global suppression
warnings.filterwarnings("ignore", category=FutureWarning, module="pandas")
warnings.filterwarnings("ignore", category=FutureWarning, module="statsmodels")

try:
    from statsmodels.tsa.stattools import grangercausalitytests
    STATSMODELS_OK = True
except ImportError:
    STATSMODELS_OK = False
    logger.warning("statsmodels not installed — Granger causality will be skipped")

# FIX C1: lazy config loading — no module-level crash
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


def _get_reports_dir() -> Path:
    """Return reports/exports dir, creating it if needed. FIX C8."""
    cfg = _get_cfg()
    d = Path(cfg["paths"]["reports"]) / "exports"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Constants ──────────────────────────────────────────────────────────────────
KPI_LABELS = {
    "dl_throughput_mbps":        "DL Throughput (Mbps)",
    "ul_throughput_mbps":        "UL Throughput (Mbps)",
    "latency_ms":                "Latency (ms)",
    "packet_loss_pct":           "Packet Loss (%)",
    "data_session_success_rate": "Data Session SR (%)",
    "data_qoe_score":            "Data QoE Score",
    "call_setup_success_rate":   "Call Setup SR (%)",
    "call_drop_rate":            "Call Drop Rate (%)",
    "voice_quality_score_mos":   "Voice MOS",
    "handover_success_rate":     "Handover SR (%)",
    "voice_qoe_score":           "Voice QoE Score",
}

# Sentinel value DecisionTree uses when a node does NOT split
_TREE_UNDEFINED = -2.0


class CorrelationAnalyser:
    """
    Full correlation & root cause analysis pipeline.
    Returns DataFrames suitable for notebook visualisation and thesis export.
    """

    def run(
        self,
        complaint_agg:  pd.DataFrame,
        kpi_agg:        pd.DataFrame,
        feature_matrix: pd.DataFrame,
    ) -> dict:
        """
        Run all five analysis sections.

        Returns
        -------
        dict with keys:
            pearson_matrix, spearman_matrix, top_correlations,
            thresholds, granger_results, qoe_event_analysis,
            ccf_results, joined, summary
        """
        logger.info("=" * 60)
        logger.info("CORRELATION & ROOT CAUSE ANALYSIS  (D3)")
        logger.info("=" * 60)

        logger.info("\n[0/5] Joining complaint + KPI aggregates ...")
        joined = self._build_joined(complaint_agg, kpi_agg)
        logger.info(f"  Joined dataset: {joined.shape[0]:,} rows")

        logger.info("\n[1/5] Computing Pearson & Spearman correlation matrices ...")
        pearson_mat, spearman_mat, top_corr = self._correlation_matrices(joined)

        logger.info("\n[2/5] Detecting KPI complaint-spike thresholds ...")
        thresholds = self._threshold_detection(joined)

        logger.info("\n[3/5] Running Granger causality tests ...")
        granger_results = self._granger_causality(complaint_agg, kpi_agg)

        logger.info("\n[4/5] Analysing QoE degradation events ...")
        qoe_events = self._qoe_event_analysis(joined)

        logger.info("\n[5/5] Computing KPI–complaint cross-correlations ...")
        ccf_results = self._cross_correlation(complaint_agg, kpi_agg)

        summary = self._build_summary(top_corr, thresholds, granger_results, qoe_events)
        self._print_summary(summary)
        self._save_report(top_corr, thresholds, granger_results, qoe_events, ccf_results)

        return {
            "pearson_matrix":     pearson_mat,
            "spearman_matrix":    spearman_mat,
            "top_correlations":   top_corr,
            "thresholds":         thresholds,
            "granger_results":    granger_results,
            "qoe_event_analysis": qoe_events,
            "ccf_results":        ccf_results,
            "joined":             joined,
            "summary":            summary,
        }

    # ─────────────────────────────────────────────────────────────────────
    # 0. JOIN
    # ─────────────────────────────────────────────────────────────────────

    def _build_joined(
        self,
        complaint_agg: pd.DataFrame,
        kpi_agg:       pd.DataFrame,
    ) -> pd.DataFrame:
        """
        Inner join complaints + KPI at (region, date).

        FIX C2: optional complaint columns are only included when present,
        preventing KeyError on real minimal DCLM data.
        """
        ca = complaint_agg.copy()
        ka = kpi_agg.copy()
        ca["date"] = pd.to_datetime(ca["date"])
        ka["date"] = pd.to_datetime(ka["date"])

        kpi_mean_cols = [c for c in ka.columns
                         if c.endswith("_mean") and "roll" not in c]
        session_cols  = [c for c in ka.columns
                         if c.startswith("session") or c == "session_count"]
        ka_slim = ka[["region", "date"] + kpi_mean_cols + session_cols].copy()

        # Derive composite QoE if absent
        if "qoe_score_mean" not in ka_slim.columns:
            has_data  = "data_qoe_score_mean"  in ka_slim.columns
            has_voice = "voice_qoe_score_mean" in ka_slim.columns
            if has_data and has_voice:
                ka_slim["qoe_score_mean"] = (
                    0.55 * ka_slim["data_qoe_score_mean"]
                    + 0.45 * ka_slim["voice_qoe_score_mean"]
                ).round(2)
            elif has_data:
                ka_slim["qoe_score_mean"] = ka_slim["data_qoe_score_mean"]

        # FIX C2: build complaint column list from what actually exists
        _BASE_COLS = ["region", "date", "total_complaints"]
        _OPTIONAL  = [
            "complaints_data", "complaints_voice",
            "high_priority_complaints", "complaint_spike_flag",
        ]
        cat_cols    = [c for c in ca.columns if c.startswith("cat_")]
        keep_cols   = (
            _BASE_COLS
            + [c for c in _OPTIONAL if c in ca.columns]
            + cat_cols
        )
        ca_slim = ca[keep_cols].copy()

        joined = ca_slim.merge(ka_slim, on=["region", "date"], how="inner")
        return joined.sort_values(["region", "date"]).reset_index(drop=True)

    # ─────────────────────────────────────────────────────────────────────
    # 1. CORRELATION MATRICES
    # ─────────────────────────────────────────────────────────────────────

    def _correlation_matrices(
        self, joined: pd.DataFrame
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """
        Pearson and Spearman correlations between KPI _mean columns
        and total_complaints.

        FIX C3: guards against the case where no KPI mean columns exist
        or all values are NaN — returns empty DataFrames with a warning.
        """
        kpi_mean_cols = [c for c in joined.columns
                         if c.endswith("_mean") and "roll" not in c]
        target = "total_complaints"

        _EMPTY_TOP = pd.DataFrame(columns=[
            "kpi", "kpi_label", "pearson_r", "pearson_p",
            "spearman_r", "spearman_p",
            "pearson_sig", "spearman_sig", "pearson_significant",
        ])

        if not kpi_mean_cols:
            logger.warning("  No KPI _mean columns — returning empty correlation tables")
            empty_mat = pd.DataFrame()
            return empty_mat, empty_mat, _EMPTY_TOP

        analysis_cols = kpi_mean_cols + [target]
        df_num = joined[analysis_cols].dropna()

        # FIX C3: guard against empty numeric frame
        if df_num.empty or df_num.shape[0] < 5:
            logger.warning("  Insufficient non-null rows for correlation matrices")
            empty_mat = pd.DataFrame(index=analysis_cols, columns=analysis_cols)
            return empty_mat, empty_mat, _EMPTY_TOP

        pearson_mat  = df_num.corr(method="pearson")
        spearman_mat = df_num.corr(method="spearman")

        rows = []
        for kpi in kpi_mean_cols:
            pair = joined[[kpi, target]].dropna()
            if len(pair) < 10:
                continue
            p_r,  p_p  = pearsonr(pair[kpi], pair[target])
            sp_r, sp_p = spearmanr(pair[kpi], pair[target])
            rows.append({
                "kpi":                 kpi,
                "kpi_label":           KPI_LABELS.get(kpi.replace("_mean", ""), kpi),
                "pearson_r":           round(p_r,  4),
                "pearson_p":           round(p_p,  4),
                "spearman_r":          round(sp_r, 4),
                "spearman_p":          round(sp_p, 4),
                "pearson_sig":         "✓" if p_p  < 0.05 else "✗",
                "pearson_significant": p_p < 0.05,
                "spearman_sig":        "✓" if sp_p < 0.05 else "✗",
                "abs_pearson":         abs(p_r),
            })

        if not rows:
            return pearson_mat, spearman_mat, _EMPTY_TOP

        top_corr = (
            pd.DataFrame(rows)
            .sort_values("abs_pearson", ascending=False)
            .reset_index(drop=True)
            .drop(columns=["abs_pearson"])
        )

        logger.info("  Top 5 KPIs correlated with total_complaints (Pearson):")
        for _, row in top_corr.head(5).iterrows():
            logger.info(
                f"    {row['kpi_label']:<35} r={row['pearson_r']:+.3f}  "
                f"p={row['pearson_p']:.4f}  {row['pearson_sig']}"
            )
        return pearson_mat, spearman_mat, top_corr

    # ─────────────────────────────────────────────────────────────────────
    # 2. THRESHOLD DETECTION
    # ─────────────────────────────────────────────────────────────────────

    def _threshold_detection(self, joined: pd.DataFrame) -> pd.DataFrame:
        """
        Depth-1 decision tree finds the KPI value that best separates
        spike days from normal days.

        FIX C4: when all samples share the same class the tree does NOT
        split and tree_.threshold[0] == TREE_UNDEFINED (-2.0).  Those
        KPIs are now skipped with a debug log instead of emitting a
        nonsense threshold in the results table.
        """
        _EMPTY = pd.DataFrame(columns=[
            "kpi", "kpi_label", "threshold_value", "direction",
            "spike_rate_below", "spike_rate_above",
            "gini_improvement", "n_samples",
        ])

        kpi_mean_cols = [c for c in joined.columns
                         if c.endswith("_mean") and "roll" not in c]
        if not kpi_mean_cols:
            logger.warning("  No KPI _mean columns — skipping threshold detection")
            return _EMPTY

        spike_col = "complaint_spike_flag"
        if spike_col not in joined.columns:
            logger.warning("  complaint_spike_flag absent — skipping thresholds")
            return _EMPTY

        rows = []
        for kpi in kpi_mean_cols:
            pair = joined[[kpi, spike_col]].dropna()
            if len(pair) < 20 or pair[spike_col].sum() < 5:
                continue

            X = pair[[kpi]].values
            y = pair[spike_col].values.astype(int)

            tree = DecisionTreeClassifier(max_depth=1, random_state=42)
            tree.fit(X, y)

            threshold = float(tree.tree_.threshold[0])

            # FIX C4: skip if tree did not split (only one class present)
            if abs(threshold - _TREE_UNDEFINED) < 1e-6:
                logger.debug(f"  {kpi}: tree did not split (single class) — skipped")
                continue

            gini_improv = float(
                tree.tree_.impurity[0]
                - (tree.tree_.n_node_samples[1] / len(y)) * tree.tree_.impurity[1]
                - (tree.tree_.n_node_samples[2] / len(y)) * tree.tree_.impurity[2]
            )

            below = pair[pair[kpi] <= threshold][spike_col]
            above = pair[pair[kpi] >  threshold][spike_col]
            rate_below = float(below.mean()) if len(below) > 0 else 0.0
            rate_above = float(above.mean()) if len(above) > 0 else 0.0
            direction  = "above" if rate_above > rate_below else "below"

            rows.append({
                "kpi":              kpi,
                "kpi_label":        KPI_LABELS.get(kpi.replace("_mean", ""), kpi),
                "threshold_value":  round(threshold, 3),
                "direction":        direction,
                "spike_rate_below": round(rate_below, 3),
                "spike_rate_above": round(rate_above, 3),
                "gini_improvement": round(gini_improv, 5),
                "n_samples":        len(pair),
            })

        if not rows:
            logger.warning("  No valid thresholds found (all trees unsplit or insufficient data)")
            return _EMPTY

        thresholds = (
            pd.DataFrame(rows)
            .sort_values("gini_improvement", ascending=False)
            .reset_index(drop=True)
        )

        logger.info("  Top 5 KPI thresholds by Gini improvement:")
        for _, row in thresholds.head(5).iterrows():
            logger.info(
                f"    {row['kpi_label']:<35} "
                f"threshold={row['threshold_value']:.2f}  "
                f"dir={row['direction']}  "
                f"spike↑={row['spike_rate_above']:.1%}"
            )
        return thresholds

    # ─────────────────────────────────────────────────────────────────────
    # 3. GRANGER CAUSALITY
    # ─────────────────────────────────────────────────────────────────────

    def _granger_causality(
        self,
        complaint_agg: pd.DataFrame,
        kpi_agg:       pd.DataFrame,
        max_lag:       int = 7,
    ) -> pd.DataFrame:
        """
        Tests whether past KPI values Granger-cause future complaint counts.

        FIX C5: the original bare `except Exception: continue` was inside
        the kpi loop but the outer region loop had no guard — a DataFrame
        error outside the kpi loop could abort silently.  Now the entire
        per-region block is wrapped in a try/except with a logged warning.
        """
        if not STATSMODELS_OK:
            logger.warning("  statsmodels not installed — Granger causality skipped")
            return pd.DataFrame()

        ca = complaint_agg.copy()
        ka = kpi_agg.copy()
        ca["date"] = pd.to_datetime(ca["date"])
        ka["date"] = pd.to_datetime(ka["date"])

        kpi_mean_cols = [c for c in ka.columns
                         if c.endswith("_mean") and "roll" not in c][:6]
        if not kpi_mean_cols:
            logger.warning("  No KPI _mean columns — Granger skipped")
            return pd.DataFrame()

        rows = []
        for region in sorted(ca["region"].unique()):
            try:   # FIX C5: region-level guard
                ca_r = ca[ca["region"] == region].sort_values("date")
                ka_r = ka[ka["region"] == region].sort_values("date")
                merged = (
                    ca_r[["date", "total_complaints"]]
                    .merge(ka_r[["date"] + kpi_mean_cols], on="date", how="inner")
                    .dropna()
                )

                if len(merged) < max_lag * 4:
                    continue

                for kpi in kpi_mean_cols:
                    try:
                        data = merged[["total_complaints", kpi]].values
                        gc   = grangercausalitytests(data, maxlag=max_lag, verbose=False)
                        p_vals  = {lag: gc[lag][0]["ssr_ftest"][1]
                                   for lag in range(1, max_lag + 1)}
                        best_lag = min(p_vals, key=p_vals.get)
                        min_p    = p_vals[best_lag]

                        rows.append({
                            "region":         region,
                            "kpi":            kpi,
                            "kpi_label":      KPI_LABELS.get(kpi.replace("_mean",""), kpi),
                            "best_lag_days":  best_lag,
                            "min_p_value":    round(min_p, 5),
                            "is_significant": min_p < 0.05,
                            "interpretation": (
                                f"{kpi.replace('_mean','').replace('_',' ').title()} "
                                f"Granger-causes complaints with {best_lag}-day lag"
                                if min_p < 0.05 else "Not significant"
                            ),
                        })
                    except Exception as exc:
                        logger.debug(f"  Granger skip [{region}] {kpi}: {exc}")
                        continue

            except Exception as exc:
                logger.warning(f"  Granger region [{region}] failed: {exc}")
                continue

        granger_df = (
            pd.DataFrame(rows)
            .sort_values("min_p_value")
            .reset_index(drop=True)
        ) if rows else pd.DataFrame()

        n_sig = int(granger_df["is_significant"].sum()) if not granger_df.empty else 0
        logger.info(f"  Granger: {n_sig} significant KPI→complaint causal links")
        if not granger_df.empty:
            for _, row in granger_df[granger_df["is_significant"]].head(5).iterrows():
                logger.info(
                    f"    [{row['region']}] {row['kpi_label']:<35} "
                    f"lag={row['best_lag_days']}d  p={row['min_p_value']:.4f}"
                )
        return granger_df

    # ─────────────────────────────────────────────────────────────────────
    # 4. QoE DEGRADATION EVENT ANALYSIS
    # ─────────────────────────────────────────────────────────────────────

    def _qoe_event_analysis(self, joined: pd.DataFrame) -> pd.DataFrame:
        """
        Compare complaint counts on QoE-degraded vs normal region-days.
        Uses Mann-Whitney U (non-parametric) for significance testing.
        Adaptive threshold: falls back to p25 when insufficient degraded days.
        """
        cfg = _get_cfg()
        qoe_threshold_cfg = cfg["qoe"]["thresholds"]["yellow"]  # 60

        qoe_col = next(
            (c for c in ["qoe_score_mean", "data_qoe_score_mean"] if c in joined.columns),
            None,
        )
        if qoe_col is None:
            logger.warning("  No QoE column found — skipping QoE event analysis")
            return pd.DataFrame()

        threshold = qoe_threshold_cfg
        if (joined[qoe_col] < threshold).sum() < 10:
            threshold = round(float(joined[qoe_col].quantile(0.25)), 1)
            logger.info(
                f"  No days below QoE={qoe_threshold_cfg} — "
                f"using adaptive threshold (p25={threshold})"
            )

        rows = []
        for region, grp in joined.groupby("region"):
            grp      = grp.copy()
            degraded = grp[grp[qoe_col] < threshold]
            normal   = grp[grp[qoe_col] >= threshold]

            if len(degraded) < 3 or len(normal) < 3:
                continue

            mean_deg  = degraded["total_complaints"].mean()
            mean_norm = normal["total_complaints"].mean()
            pct_incr  = ((mean_deg - mean_norm) / (mean_norm + 1e-9)) * 100

            stat, p_val = stats.mannwhitneyu(
                degraded["total_complaints"],
                normal["total_complaints"],
                alternative="greater",
            )

            rows.append({
                "region":                    region,
                "n_degraded_days":           len(degraded),
                "n_normal_days":             len(normal),
                "mean_complaints_degraded":  round(mean_deg, 2),
                "mean_complaints_normal":    round(mean_norm, 2),
                "pct_increase":              round(pct_incr, 1),
                "mannwhitney_stat":          round(stat, 2),
                "p_value":                   round(p_val, 5),
                "is_significant":            p_val < 0.05,
                "avg_qoe_degraded":          round(degraded[qoe_col].mean(), 1),
                "avg_qoe_normal":            round(normal[qoe_col].mean(), 1),
            })

        result = (
            pd.DataFrame(rows)
            .sort_values("pct_increase", ascending=False)
            .reset_index(drop=True)
        )

        n_sig = int(result["is_significant"].sum()) if not result.empty else 0
        logger.info(
            f"  QoE events: {n_sig} regions show significant complaint increase "
            f"during QoE degradation (threshold={threshold})"
        )
        for _, row in result.head(5).iterrows():
            logger.info(
                f"    {row['region']:<12} +{row['pct_increase']:.1f}% complaints  "
                f"p={row['p_value']:.4f}  {'✓' if row['is_significant'] else '✗'}"
            )
        return result

    # ─────────────────────────────────────────────────────────────────────
    # 5. CROSS-CORRELATION FUNCTION (CCF)
    # ─────────────────────────────────────────────────────────────────────

    def _cross_correlation(
        self,
        complaint_agg: pd.DataFrame,
        kpi_agg:       pd.DataFrame,
        max_lag:       int = 14,
    ) -> pd.DataFrame:
        """
        Time-lagged Pearson correlation between each KPI mean and future
        complaint counts.  Answers: how many days after a KPI degrades do
        complaints peak?

        FIX C7: column is consistently named peak_correlation (not peak_r).
        """
        ca = complaint_agg.copy()
        ka = kpi_agg.copy()
        ca["date"] = pd.to_datetime(ca["date"])
        ka["date"] = pd.to_datetime(ka["date"])

        kpi_mean_cols = [c for c in ka.columns
                         if c.endswith("_mean") and "roll" not in c]

        _EMPTY = pd.DataFrame(columns=[
            "region", "kpi", "kpi_label",
            "best_lag_days", "peak_correlation", "abs_correlation", "direction",
        ])
        if not kpi_mean_cols:
            logger.warning("  No KPI _mean columns — skipping cross-correlation")
            return _EMPTY

        rows = []
        for region in sorted(ca["region"].unique()):
            ca_r = ca[ca["region"] == region].sort_values("date")
            ka_r = ka[ka["region"] == region].sort_values("date")
            merged = (
                ca_r[["date", "total_complaints"]]
                .merge(ka_r[["date"] + kpi_mean_cols], on="date", how="inner")
                .dropna()
                .reset_index(drop=True)
            )
            if len(merged) < max_lag + 10:
                continue

            complaints = merged["total_complaints"].values

            for kpi in kpi_mean_cols:
                kpi_series = merged[kpi].values
                best_lag, best_corr = 0, 0.0

                for lag in range(0, max_lag + 1):
                    x = kpi_series if lag == 0 else kpi_series[:-lag]
                    y = complaints  if lag == 0 else complaints[lag:]
                    if len(x) < 10:
                        continue
                    r, _ = pearsonr(x, y)
                    if abs(r) > abs(best_corr):
                        best_corr = r
                        best_lag  = lag

                rows.append({
                    "region":           region,
                    "kpi":              kpi,
                    "kpi_label":        KPI_LABELS.get(kpi.replace("_mean",""), kpi),
                    "best_lag_days":    best_lag,
                    "peak_correlation": round(best_corr, 4),   # FIX C7: consistent name
                    "abs_correlation":  abs(best_corr),
                    "direction":        "inverse" if best_corr < 0 else "direct",
                })

        ccf_df = (
            pd.DataFrame(rows)
            .sort_values("abs_correlation", ascending=False)
            .reset_index(drop=True)
        ) if rows else _EMPTY

        logger.info("  Top CCF results (KPI → complaint peak lag):")
        for _, row in ccf_df.head(5).iterrows():
            logger.info(
                f"    [{row['region']:<10}] {row['kpi_label']:<35} "
                f"lag={row['best_lag_days']}d  r={row['peak_correlation']:+.3f} ({row['direction']})"
            )
        return ccf_df

    # ─────────────────────────────────────────────────────────────────────
    # SUMMARY & SAVE
    # ─────────────────────────────────────────────────────────────────────

    def _build_summary(self, top_corr, thresholds, granger, qoe_events) -> dict:
        summary: dict = {}

        if not top_corr.empty:
            top3 = top_corr.head(3)
            summary["top_correlated_kpis"] = top3["kpi_label"].tolist()
            summary["top_pearson_r"]        = top3["pearson_r"].tolist()

        if not thresholds.empty:
            top_t = thresholds.iloc[0]
            summary["most_predictive_threshold"] = {
                "kpi":       top_t["kpi_label"],
                "threshold": top_t["threshold_value"],
                "direction": top_t["direction"],
            }

        if not granger.empty:
            sig = granger[granger["is_significant"]]
            summary["granger_significant_pairs"] = len(sig)
            if not sig.empty:
                best = sig.iloc[0]
                summary["strongest_granger_cause"] = {
                    "kpi":     best["kpi_label"],
                    "lag":     best["best_lag_days"],
                    "p_value": best["min_p_value"],
                }

        if not qoe_events.empty:
            sig_qoe = qoe_events[qoe_events["is_significant"]]
            summary["qoe_degradation_impact"] = {
                "significant_regions": len(sig_qoe),
                "max_pct_increase":    float(qoe_events["pct_increase"].max()),
                "avg_pct_increase":    float(round(qoe_events["pct_increase"].mean(), 1)),
            }

        return summary

    def _print_summary(self, summary: dict) -> None:
        logger.info("\n" + "=" * 60)
        logger.info("  D3 CORRELATION STUDY — KEY FINDINGS")
        logger.info("=" * 60)

        if "top_correlated_kpis" in summary:
            logger.info("  Most correlated KPIs with complaints:")
            for kpi, r in zip(summary["top_correlated_kpis"], summary["top_pearson_r"]):
                logger.info(f"    {kpi:<40} r={r:+.3f}")

        if "most_predictive_threshold" in summary:
            t = summary["most_predictive_threshold"]
            logger.info(f"\n  Best threshold: {t['kpi']} {t['direction']} {t['threshold']}")

        if "granger_significant_pairs" in summary:
            logger.info(f"\n  Granger causality: {summary['granger_significant_pairs']} significant pairs")
            if "strongest_granger_cause" in summary:
                g = summary["strongest_granger_cause"]
                logger.info(f"    Strongest: {g['kpi']} (lag={g['lag']}d, p={g['p_value']:.4f})")

        if "qoe_degradation_impact" in summary:
            q = summary["qoe_degradation_impact"]
            logger.info(f"\n  QoE degradation impact:")
            logger.info(f"    Significant regions : {q['significant_regions']}")
            logger.info(f"    Max complaint spike : +{q['max_pct_increase']:.1f}%")
            logger.info(f"    Avg complaint spike : +{q['avg_pct_increase']:.1f}%")
        logger.info("=" * 60)

    def _save_report(
        self, top_corr, thresholds, granger, qoe_events, ccf_results
    ) -> None:
        """Save all result tables to reports/exports/ as CSV. FIX C8."""
        reports_dir = _get_reports_dir()   # creates dir lazily
        saves = {
            "d3_correlation_rankings.csv": top_corr,
            "d3_kpi_thresholds.csv":       thresholds,
            "d3_granger_causality.csv":    granger,
            "d3_qoe_event_analysis.csv":   qoe_events,
            "d3_cross_correlation.csv":    ccf_results,
        }
        for fname, df in saves.items():
            if df is not None and not df.empty:
                df.to_csv(reports_dir / fname, index=False)
        logger.info(f"  D3 report tables saved → {reports_dir}")