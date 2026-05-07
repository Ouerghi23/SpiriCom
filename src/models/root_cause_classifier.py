"""
Root Cause Classification Module
==================================
Maps KPI feature vectors to known complaint root causes.

  Model 1 — Random Forest   (interpretable baseline)
  Model 2 — XGBoost         (best performance, SHAP explainable)

Target variable: derived from complaint_subcategory (real DCLM values),
joined with KPI features at (region, date) level.

Usage:
    from src.models.root_cause_classifier import RootCauseClassifier
    clf = RootCauseClassifier()
    results = clf.run(complaints_clean, feature_matrix)
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from loguru import logger
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    logger.warning("SHAP not installed — explainability plots unavailable (pip install shap)")

# FIX R1: lazy config — no module-level crash
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
    cfg = _get_cfg()
    d = Path(cfg["paths"]["models"]) / "classification"
    d.mkdir(parents=True, exist_ok=True)
    return d


CLASSIFICATION_FEATURES = [
    "dl_throughput_mbps_mean", "dl_throughput_mbps_p10",
    "ul_throughput_mbps_mean",
    "latency_ms_mean", "latency_ms_max",
    "packet_loss_pct_mean",
    "data_session_success_rate_mean",
    "data_qoe_score_mean",
    "call_setup_success_rate_mean",
    "call_drop_rate_mean",
    "voice_quality_score_mos_mean",
    "handover_success_rate_mean",
    "voice_qoe_score_mean",
    "qoe_score_mean", "qoe_score_p10",
    "degraded_session_rate_pct",
    "is_weekend", "is_peak_hour",
    "month_sin", "month_cos",
]

LEAKAGE_COLS = {
    "total_complaints",
    "total_complaints_lag_1d", "total_complaints_lag_3d",
    "total_complaints_lag_7d", "total_complaints_lag_14d",
    "total_complaints_roll_mean_7d", "total_complaints_roll_std_7d",
    "total_complaints_roll_mean_14d",
    "complaint_spike_flag",
    "complaint_rate_7d",
}

# FIX R3: removed duplicate keys — Python dicts silently keep only the last
# value for duplicate keys.  All variants now use a single normalised key via
# the _normalise() function applied at lookup time.
ROOT_CAUSE_MAP = {
    # Data Performance
    "débit faible internet mobile":              "Data_Performance",
    "débit faible internet mobile 5g":           "Data_Performance",
    "debit faible internet mobile":              "Data_Performance",
    "debit faible internet mobile 5g":           "Data_Performance",
    "echec connexion internet mobile":           "Data_Performance",
    "coupure de connexion internet mobile":      "Data_Performance",
    # Coverage
    "pas d'accès internet mobile":               "Coverage",
    "pas dacces internet mobile":                "Coverage",
    "pas de couverture internet mobile 5g":      "Coverage",
    "pas de couverture voix":                    "Coverage",
    # Voice Quality
    "mauvaise qualité de son":                   "Voice_Quality",
    "mauvaise qualite de son":                   "Voice_Quality",
    "coupure dappel":                            "Voice_Quality",
    "coupure d'appel":                           "Voice_Quality",
    "echec émission/réception appel":            "Voice_Quality",
    "echec emission/reception appel":            "Voice_Quality",
}


def _normalise(s: str) -> str:
    """Lowercase, strip accents approximation, collapse whitespace."""
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(s.strip().lower().split())


# Pre-build normalised lookup once
_NORM_MAP: dict[str, str] = {_normalise(k): v for k, v in ROOT_CAUSE_MAP.items()}


class RootCauseClassifier:
    """
    Trains Random Forest and XGBoost classifiers to map
    KPI degradation patterns to complaint root causes.
    """

    def __init__(self):
        self.rf_model:     Optional[RandomForestClassifier] = None
        self.xgb_model:    Optional[XGBClassifier]          = None
        self.label_enc:    Optional[LabelEncoder]           = None
        self.feature_cols: list[str]                        = []
        self.classes_:     Optional[np.ndarray]             = None

    # ─────────────────────────────────────────────────────────────────────
    # PUBLIC
    # ─────────────────────────────────────────────────────────────────────

    def run(
        self,
        complaints_clean: pd.DataFrame,
        feature_matrix:   pd.DataFrame,
    ) -> dict:
        """
        Full root cause classification pipeline.

        Returns
        -------
        dict with keys: rf_report, xgb_report, shap_values,
                        feature_importance, confusion_matrices,
                        classes, best_model, X_test, y_test, feature_cols
        """
        logger.info("=" * 55)
        logger.info("ROOT CAUSE CLASSIFICATION")
        logger.info("=" * 55)

        cfg = _get_cfg()

        logger.info("\n[1/4] Building labelled dataset ...")
        X, y, self.feature_cols = self._build_dataset(complaints_clean, feature_matrix)

        self.label_enc = LabelEncoder()
        y_enc          = self.label_enc.fit_transform(y)
        self.classes_  = self.label_enc.classes_
        logger.info(f"  Classes ({len(self.classes_)}): {list(self.classes_)}")

        test_size = cfg["models"]["test_size"]
        split     = int(len(X) * (1 - test_size))
        X_train, X_test = X.iloc[:split],  X.iloc[split:]
        y_train, y_test = y_enc[:split],   y_enc[split:]
        logger.info(f"  Train: {len(X_train):,}  Test: {len(X_test):,}")

        logger.info("\n[2/4] Training Random Forest ...")
        rf_results = self._train_random_forest(X_train, X_test, y_train, y_test)

        logger.info("\n[3/4] Training XGBoost ...")
        xgb_results = self._train_xgboost(X_train, X_test, y_train, y_test)

        shap_values = None
        if SHAP_AVAILABLE:
            logger.info("\n[4/4] Computing SHAP values ...")
            shap_values = self._compute_shap(X_test)
        else:
            logger.info("\n[4/4] SHAP skipped — install with: pip install shap")

        best = (
            "xgboost"
            if xgb_results["f1_macro"] >= rf_results["f1_macro"]
            else "random_forest"
        )
        logger.info(
            f"\n  Best model : {best.upper()}\n"
            f"  RF  F1-macro={rf_results['f1_macro']:.3f}  "
            f"Accuracy={rf_results['accuracy']:.3f}\n"
            f"  XGB F1-macro={xgb_results['f1_macro']:.3f}  "
            f"Accuracy={xgb_results['accuracy']:.3f}"
        )

        self._save()

        return {
            "rf_report":          rf_results,
            "xgb_report":         xgb_results,
            "shap_values":        shap_values,
            "feature_importance": self._feature_importance(),
            "confusion_matrices": {
                "random_forest": rf_results["confusion_matrix"],
                "xgboost":       xgb_results["confusion_matrix"],
            },
            "classes":      list(self.classes_),
            "best_model":   best,
            "X_test":       X_test,
            "y_test":       y_test,
            "feature_cols": self.feature_cols,
        }

    # ─────────────────────────────────────────────────────────────────────
    # DATASET BUILDER
    # ─────────────────────────────────────────────────────────────────────

    def _build_dataset(
        self,
        complaints:     pd.DataFrame,
        feature_matrix: pd.DataFrame,
    ) -> tuple[pd.DataFrame, np.ndarray, list[str]]:
        """
        Join complaint subcategories with KPI features at (region, date).

        FIX R2: mapping coverage logged BEFORE the second drop of 'Other'
        rows so the log reflects true coverage, not always 100%.

        FIX R4: single drop of 'Other' rows — the original code dropped
        Other twice (once with a guard, once unconditionally), silently
        discarding valid rows.

        FIX R5: consistent indentation and f-string formatting.
        """
        df = complaints.copy()
        df["date"] = pd.to_datetime(df["timestamp"]).dt.normalize()

        subcat_col = next(
            (c for c in ["complaint_subcategory", "complaint_category"]
             if c in df.columns),
            None,
        )
        if subcat_col is None:
            raise ValueError(
                "No complaint subcategory column found in complaints DataFrame."
            )
        logger.info(f"  Using subcategory column: {subcat_col}")
        logger.info(
            f"  Sample values: {df[subcat_col].value_counts().head(5).to_dict()}"
        )

        # Map subcategory → root cause using normalised keys
        df["root_cause"] = (
            df[subcat_col]
            .astype(str)
            .str.strip()
            .map(lambda s: _NORM_MAP.get(_normalise(s), "Other"))
        )

        # FIX R2: log coverage BEFORE dropping Other
        n_total  = len(df)
        n_mapped = int((df["root_cause"] != "Other").sum())
        n_other  = int((df["root_cause"] == "Other").sum())
        logger.info(
            f"  Mapping coverage: {n_mapped:,}/{n_total:,} "
            f"({n_mapped / max(n_total, 1) * 100:.1f}%) mapped  |  "
            f"{n_other:,} Other"
        )
        if n_mapped / max(n_total, 1) < 0.05:
            logger.warning(
                "  Less than 5% of subcategory values matched ROOT_CAUSE_MAP.\n"
                "  Check that ROOT_CAUSE_MAP keys match your complaint_subcategory values."
            )

        # FIX R4: single drop of Other rows
        df = df[df["root_cause"] != "Other"].copy()
        logger.info(f"  After dropping Other: {len(df):,} rows")

        if len(df) < 100:
            raise ValueError(
                f"Too few labelled rows after mapping ({len(df)}). "
                "Extend ROOT_CAUSE_MAP to cover more subcategory values."
            )

        # Dominant root cause per (region, date)
        dominant = (
            df.groupby(["region", "date"])["root_cause"]
            .agg(lambda x: x.value_counts().index[0])
            .reset_index()
        )

        fm = feature_matrix.copy()
        fm["date"] = pd.to_datetime(fm["date"]).dt.normalize()
        merged = fm.merge(dominant, on=["region", "date"], how="inner")
        logger.info(f"  Merged rows: {len(merged):,}")

        feat_cols = [
            c for c in CLASSIFICATION_FEATURES
            if c in merged.columns and c not in LEAKAGE_COLS
        ]
        feat_cols += [
            c for c in merged.columns
            if c.startswith("region_") and c not in LEAKAGE_COLS
        ]

        X = merged[feat_cols].fillna(merged[feat_cols].median())
        y = merged["root_cause"].values

        logger.info(
            f"  Final dataset: {len(X):,} rows × {len(feat_cols)} features "
            f"| {len(set(y))} classes"
        )
        logger.info(f"  Class distribution:\n{pd.Series(y).value_counts().to_string()}")
        return X, y, feat_cols

    # ─────────────────────────────────────────────────────────────────────
    # RANDOM FOREST
    # ─────────────────────────────────────────────────────────────────────

    def _train_random_forest(
        self, X_train, X_test, y_train, y_test
    ) -> dict:
        rs = _get_cfg()["models"]["random_state"]
        self.rf_model = RandomForestClassifier(
            n_estimators     = 300,
            max_depth        = 12,
            min_samples_leaf = 5,
            class_weight     = "balanced",
            random_state     = rs,
            n_jobs           = -1,
        )
        self.rf_model.fit(X_train, y_train)
        y_pred = self.rf_model.predict(X_test)

        cv        = StratifiedKFold(n_splits=5, shuffle=True, random_state=rs)
        cv_scores = cross_val_score(
            self.rf_model, X_train, y_train,
            scoring="f1_macro", cv=cv, n_jobs=-1,
        )
        report = classification_report(
            y_test, y_pred,
            target_names=self.classes_,
            output_dict=True,
            zero_division=0,
        )
        return {
            "f1_macro":              f1_score(y_test, y_pred, average="macro", zero_division=0),
            "accuracy":              accuracy_score(y_test, y_pred),
            "cv_f1_mean":            cv_scores.mean(),
            "cv_f1_std":             cv_scores.std(),
            "classification_report": report,
            "confusion_matrix":      confusion_matrix(y_test, y_pred),
            "y_pred":                y_pred,
        }

    # ─────────────────────────────────────────────────────────────────────
    # XGBOOST
    # ─────────────────────────────────────────────────────────────────────

    def _train_xgboost(
        self, X_train, X_test, y_train, y_test
    ) -> dict:
        rs = _get_cfg()["models"]["random_state"]
        self.xgb_model = XGBClassifier(
            n_estimators     = 400,
            max_depth        = 6,
            learning_rate    = 0.05,
            subsample        = 0.8,
            colsample_bytree = 0.8,
            eval_metric      = "mlogloss",
            random_state     = rs,
            n_jobs           = -1,
            verbosity        = 0,
        )
        from sklearn.utils.class_weight import compute_sample_weight
        sample_weights = compute_sample_weight(class_weight="balanced", y=y_train)
        self.xgb_model.fit(
            X_train, y_train,
            sample_weight = sample_weights,
            eval_set      = [(X_test, y_test)],
            verbose       = False,
        )
        y_pred = self.xgb_model.predict(X_test)

        cv        = StratifiedKFold(n_splits=5, shuffle=True, random_state=rs)
        cv_scores = cross_val_score(
            self.xgb_model, X_train, y_train,
            scoring="f1_macro", cv=cv, n_jobs=-1,
        )
        report = classification_report(
            y_test, y_pred,
            target_names=self.classes_,
            output_dict=True,
            zero_division=0,
        )
        return {
            "f1_macro":              f1_score(y_test, y_pred, average="macro", zero_division=0),
            "accuracy":              accuracy_score(y_test, y_pred),
            "cv_f1_mean":            cv_scores.mean(),
            "cv_f1_std":             cv_scores.std(),
            "classification_report": report,
            "confusion_matrix":      confusion_matrix(y_test, y_pred),
            "y_pred":                y_pred,
        }

    # ─────────────────────────────────────────────────────────────────────
    # SHAP
    # ─────────────────────────────────────────────────────────────────────

    def _compute_shap(self, X_test: pd.DataFrame) -> Optional[object]:
        """
        Compute SHAP values for the XGBoost model.
        Returns shap_values object (may be list or ndarray depending on version).
        """
        try:
            explainer   = shap.TreeExplainer(self.xgb_model)
            shap_values = explainer.shap_values(X_test)
            shape_str   = (
                str(np.array(shap_values).shape)
                if not isinstance(shap_values, list)
                else f"list of {len(shap_values)} arrays"
            )
            logger.info(f"  SHAP values computed: {shape_str}")
            joblib.dump(shap_values, _get_models_dir() / "shap_values.pkl")
            return shap_values
        except Exception as exc:
            logger.warning(f"  SHAP computation failed: {exc}")
            return None

    # ─────────────────────────────────────────────────────────────────────
    # FEATURE IMPORTANCE
    # ─────────────────────────────────────────────────────────────────────

    def _feature_importance(self) -> pd.DataFrame:
        """Merge RF + XGB feature importances into a single ranked table."""
        rows_rf, rows_xgb = [], []
        if self.rf_model and self.feature_cols:
            rows_rf = [
                {"feature": f, "importance_rf": imp}
                for f, imp in zip(self.feature_cols, self.rf_model.feature_importances_)
            ]
        if self.xgb_model and self.feature_cols:
            rows_xgb = [
                {"feature": f, "importance_xgb": imp}
                for f, imp in zip(self.feature_cols, self.xgb_model.feature_importances_)
            ]

        df_rf  = pd.DataFrame(rows_rf)
        df_xgb = pd.DataFrame(rows_xgb)
        if df_rf.empty and df_xgb.empty:
            return pd.DataFrame()

        merged = df_rf.merge(df_xgb, on="feature", how="outer").fillna(0)
        merged["importance_mean"] = merged[["importance_rf", "importance_xgb"]].mean(axis=1)
        return merged.sort_values("importance_mean", ascending=False).reset_index(drop=True)

    # ─────────────────────────────────────────────────────────────────────
    # SAVE / LOAD
    # ─────────────────────────────────────────────────────────────────────

    def _save(self) -> None:
        models_dir = _get_models_dir()
        joblib.dump(self.rf_model,     models_dir / "random_forest.pkl")
        joblib.dump(self.xgb_model,    models_dir / "xgboost_classifier.pkl")
        joblib.dump(self.label_enc,    models_dir / "label_encoder.pkl")
        joblib.dump(self.feature_cols, models_dir / "feature_cols.pkl")
        logger.info(f"  Models saved → {models_dir}")

    @classmethod
    def load(cls) -> "RootCauseClassifier":
        models_dir   = _get_models_dir()
        obj          = cls()
        obj.rf_model     = joblib.load(models_dir / "random_forest.pkl")
        obj.xgb_model    = joblib.load(models_dir / "xgboost_classifier.pkl")
        obj.label_enc    = joblib.load(models_dir / "label_encoder.pkl")
        obj.feature_cols = joblib.load(models_dir / "feature_cols.pkl")
        obj.classes_     = obj.label_enc.classes_
        return obj

    def predict(self, X: pd.DataFrame) -> pd.DataFrame:
        """Predict root cause + confidence for new KPI data."""
        X         = X[self.feature_cols].fillna(0)
        probs     = self.xgb_model.predict_proba(X)
        pred_idx  = probs.argmax(axis=1)
        pred_lbl  = self.label_enc.inverse_transform(pred_idx)
        confidence= probs.max(axis=1)
        return pd.DataFrame({
            "predicted_root_cause": pred_lbl,
            "confidence":           confidence.round(3),
        })