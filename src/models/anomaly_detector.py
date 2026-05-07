"""
Anomaly Detection Module
========================
Detects abnormal KPI drops and complaint surge events using:

  Model 1 — Isolation Forest (multivariate, unsupervised)
  Model 2 — Statistical Control Charts (Z-score + CUSUM)

Both models produce:
  - anomaly_flag   (0 = normal, 1 = anomaly)
  - anomaly_score  (continuous severity score)
  - Trained artifacts saved to models/anomaly/

Usage:
    from src.models.anomaly_detector import AnomalyDetector
    detector = AnomalyDetector()
    results  = detector.run(kpi_agg)
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from loguru import logger
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# FIX A5: scoped warnings — not global suppression
warnings.filterwarnings("ignore", category=FutureWarning, module="sklearn")
warnings.filterwarnings("ignore", category=FutureWarning, module="pandas")

# FIX A1: lazy config — no module-level crash
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


def _get_models_dir() -> Path:
    """Return and create models/anomaly/ lazily. FIX A1 + A4."""
    cfg = _get_cfg()
    d = Path(cfg["paths"]["models"]) / "anomaly"
    d.mkdir(parents=True, exist_ok=True)
    return d


ANOMALY_FEATURES = [
    "qoe_score_mean", "qoe_score_p10",
    "dl_throughput_mbps_mean", "dl_throughput_mbps_p10",
    "latency_ms_mean", "latency_ms_max",
    "packet_loss_pct_mean",
    "call_drop_rate_mean",
    "voice_quality_score_mos_mean",
    "data_session_success_rate_mean",
    "call_setup_success_rate_mean",
    "degraded_session_rate_pct",
]


class AnomalyDetector:
    """
    Unified anomaly detection wrapper.
    Trains Isolation Forest and Z-score/CUSUM detectors,
    evaluates them, and returns a combined anomaly report.
    """

    def __init__(self):
        self.iso_forest:   Optional[IsolationForest] = None
        self.scaler:       Optional[StandardScaler]  = None
        self.results_if:   Optional[pd.DataFrame]    = None
        self.results_stat: Optional[pd.DataFrame]    = None

    # ─────────────────────────────────────────────────────────────────────
    # PUBLIC
    # ─────────────────────────────────────────────────────────────────────

    def run(self, kpi_agg: pd.DataFrame) -> dict:
        """
        Full anomaly detection pipeline.

        Parameters
        ----------
        kpi_agg : daily KPI aggregates (output of build_kpi_daily_agg)

        Returns
        -------
        dict with keys: isolation_forest, statistical, combined, metrics
        """
        logger.info("=" * 55)
        logger.info("ANOMALY DETECTION")
        logger.info("=" * 55)

        logger.info("\n[1/3] Training Isolation Forest ...")
        self.results_if = self._run_isolation_forest(kpi_agg)

        logger.info("\n[2/3] Running statistical control charts ...")
        self.results_stat = self._run_statistical(kpi_agg)

        logger.info("\n[3/3] Combining results ...")
        combined, metrics = self._combine_results(self.results_if, self.results_stat)

        # FIX A4: use lazy _get_models_dir() — dir created on first call
        models_dir = _get_models_dir()
        self._save(models_dir)
        combined.to_parquet(models_dir / "anomaly_results.parquet", index=False)

        logger.success(
            f"\nAnomaly detection complete:\n"
            f"  Isolation Forest anomalies : {self.results_if['if_anomaly'].sum():>5}\n"
            f"  Statistical anomalies      : {self.results_stat['stat_anomaly'].sum():>5}\n"
            f"  Combined (either)          : {combined['anomaly_flag'].sum():>5}\n"
            f"  Combined (both agree)      : {combined['anomaly_consensus'].sum():>5}"
        )
        return {
            "isolation_forest": self.results_if,
            "statistical":      self.results_stat,
            "combined":         combined,
            "metrics":          metrics,
        }

    # ─────────────────────────────────────────────────────────────────────
    # MODEL 1 — ISOLATION FOREST
    # ─────────────────────────────────────────────────────────────────────

    def _run_isolation_forest(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        FIX A2: returns an empty-anomaly DataFrame when no feature columns
        are present instead of raising ValueError and crashing the pipeline.
        """
        cfg  = _get_cfg()
        contamination = cfg["models"]["anomaly_contamination"]
        random_state  = cfg["models"]["random_state"]

        feat_cols = [c for c in ANOMALY_FEATURES if c in df.columns]

        if not feat_cols:
            logger.warning(
                "  No anomaly feature columns found in kpi_agg — "
                "returning zero-anomaly result (real data with no numeric KPIs)"
            )
            result = df[["region", "date"]].copy()
            result["if_anomaly"]       = 0
            result["if_score"]         = 0.0
            result["if_score_norm"]    = 0.0
            result["if_severity"]      = "Low"
            result["top_anomaly_driver"] = "N/A"
            return result

        X = df[feat_cols].fillna(df[feat_cols].median())

        self.scaler = StandardScaler()
        X_scaled    = self.scaler.fit_transform(X)

        self.iso_forest = IsolationForest(
            n_estimators  = 200,
            contamination = contamination,
            random_state  = random_state,
            n_jobs        = -1,
        )
        preds  = self.iso_forest.fit_predict(X_scaled)
        scores = self.iso_forest.decision_function(X_scaled)

        result = df[["region", "date"]].copy()
        result["if_anomaly"]   = (preds == -1).astype(int)
        result["if_score"]     = -scores
        result["if_score_norm"]= _minmax(result["if_score"])
        result["if_severity"]  = pd.cut(
            result["if_score_norm"],
            bins=[-np.inf, 0.33, 0.66, np.inf],
            labels=["Low", "Medium", "High"],
        )
        result["top_anomaly_driver"] = _top_driver(
            pd.DataFrame(X, columns=feat_cols), feat_cols, self.iso_forest
        )

        logger.info(
            f"  IF: {result['if_anomaly'].sum()} anomalies "
            f"({result['if_anomaly'].mean() * 100:.1f}% of records)"
        )
        return result

    # ─────────────────────────────────────────────────────────────────────
    # MODEL 2 — STATISTICAL CONTROL CHARTS
    # ─────────────────────────────────────────────────────────────────────

    def _run_statistical(
        self,
        df: pd.DataFrame,
        zscore_threshold: float = 3.0,
        cusum_threshold:  float = 5.0,
    ) -> pd.DataFrame:
        """
        Z-score + CUSUM per region on qoe_score_mean.

        FIX A3: stat_score now correctly reflects both z-score and CUSUM
        contributions — previously it was 0 when only CUSUM triggered.
        The score is now max(zscore_component, cusum_component) normalised.
        """
        monitoring_col = next(
            (c for c in ["qoe_score_mean"] + [c for c in df.columns if "qoe" in c]
             if c in df.columns),
            None,
        )
        if monitoring_col is None:
            logger.warning("  No QoE column found — returning zero-anomaly statistical result")
            result = df[["region", "date"]].copy()
            for col in ["stat_anomaly", "zscore", "cusum", "stat_score"]:
                result[col] = 0.0
            return result

        result_rows = []
        for region, grp in df.groupby("region"):
            grp    = grp.sort_values("date").copy()
            series = grp[monitoring_col].fillna(grp[monitoring_col].median())

            # Z-score (rolling 14-day)
            roll_mean = series.rolling(14, min_periods=3).mean()
            roll_std  = series.rolling(14, min_periods=3).std().replace(0, 1e-6)
            zscore    = ((series - roll_mean) / roll_std).abs()

            # CUSUM (global statistics)
            mean_global = series.mean()
            std_global  = series.std() if series.std() > 0 else 1e-6
            cusum_pos   = _cusum(series,  mean_global, std_global)
            cusum_neg   = _cusum(-series, -mean_global, std_global)
            cusum_max   = np.maximum(cusum_pos, cusum_neg)

            stat_anomaly = (
                (zscore > zscore_threshold) | (cusum_max > cusum_threshold)
            ).astype(int)

            # FIX A3: stat_score = max of both components, normalised to [0,1]
            z_norm     = (zscore / zscore_threshold).clip(0, 3) / 3.0
            cusum_norm = (cusum_max / cusum_threshold).clip(0, 3) / 3.0
            stat_score = np.maximum(z_norm.values, cusum_norm)

            tmp = grp[["region", "date"]].copy()
            tmp["zscore"]       = zscore.values
            tmp["cusum"]        = cusum_max
            tmp["stat_anomaly"] = stat_anomaly.values
            tmp["stat_score"]   = stat_score
            result_rows.append(tmp)

        result = pd.concat(result_rows, ignore_index=True)
        logger.info(
            f"  Statistical: {result['stat_anomaly'].sum()} anomalies "
            f"({result['stat_anomaly'].mean() * 100:.1f}% of records)"
        )
        return result

    # ─────────────────────────────────────────────────────────────────────
    # COMBINE
    # ─────────────────────────────────────────────────────────────────────

    def _combine_results(
        self,
        if_res:   pd.DataFrame,
        stat_res: pd.DataFrame,
    ) -> tuple[pd.DataFrame, dict]:
        combined = if_res.merge(
            stat_res[["region", "date", "stat_anomaly",
                       "zscore", "cusum", "stat_score"]],
            on=["region", "date"],
            how="left",
        )
        combined["anomaly_flag"] = (
            (combined["if_anomaly"] == 1) | (combined["stat_anomaly"] == 1)
        ).astype(int)
        combined["anomaly_consensus"] = (
            (combined["if_anomaly"] == 1) & (combined["stat_anomaly"] == 1)
        ).astype(int)
        combined["combined_score"] = (
            0.6 * combined["if_score_norm"]
            + 0.4 * combined["stat_score"].fillna(0).clip(0, 1)
        )

        metrics = {
            "total_records":       len(combined),
            "if_anomalies":        int(combined["if_anomaly"].sum()),
            "stat_anomalies":      int(combined["stat_anomaly"].sum()),
            "union_anomalies":     int(combined["anomaly_flag"].sum()),
            "consensus_anomalies": int(combined["anomaly_consensus"].sum()),
            "anomaly_rate_pct":    round(combined["anomaly_flag"].mean() * 100, 2),
            "top_anomaly_regions": (
                combined[combined["anomaly_flag"] == 1]["region"]
                .value_counts().head(5).to_dict()
            ),
        }
        return combined, metrics

    # ─────────────────────────────────────────────────────────────────────
    # SAVE / LOAD
    # ─────────────────────────────────────────────────────────────────────

    def _save(self, models_dir: Path) -> None:
        """FIX A4: accepts models_dir as parameter instead of using module-level global."""
        if self.iso_forest is not None:
            joblib.dump(self.iso_forest, models_dir / "isolation_forest.pkl")
        if self.scaler is not None:
            joblib.dump(self.scaler,     models_dir / "if_scaler.pkl")
        logger.info(f"  Models saved → {models_dir}")

    @classmethod
    def load(cls) -> "AnomalyDetector":
        models_dir = _get_models_dir()
        obj = cls()
        obj.iso_forest = joblib.load(models_dir / "isolation_forest.pkl")
        obj.scaler     = joblib.load(models_dir / "if_scaler.pkl")
        return obj


# ─────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────

def _minmax(s: pd.Series) -> pd.Series:
    mn, mx = s.min(), s.max()
    return (s - mn) / (mx - mn + 1e-9)


def _cusum(
    series: pd.Series,
    mu:     float,
    sigma:  float,
    k:      float = 0.5,
) -> np.ndarray:
    """One-sided upper CUSUM statistic."""
    s = np.zeros(len(series))
    vals = series.values
    for i in range(1, len(vals)):
        s[i] = max(0.0, s[i - 1] + (vals[i] - mu) / sigma - k)
    return s


def _top_driver(
    X:     pd.DataFrame,
    cols:  list[str],
    model: IsolationForest,
) -> pd.Series:
    """
    Approximate per-sample feature driver: column with highest absolute
    z-deviation from the sample median. Full SHAP explainability for
    Isolation Forest is available via shap.TreeExplainer (see notebook).
    """
    medians    = X.median()
    stds       = X.std().replace(0, 1e-9)
    deviations = ((X - medians) / stds).abs()
    return deviations.idxmax(axis=1)