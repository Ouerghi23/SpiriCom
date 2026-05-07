"""
Spike Prediction Module
========================
Forecasts complaint volume by region using three models:

  Model 1 — ARIMA/SARIMA   (classical time-series baseline)
  Model 2 — Prophet        (trend + seasonality)
  Model 3 — XGBoost        (ML regressor on lag/rolling features)

All models trained per-region. Best selected by MAE on held-out test period.

Usage:
    from src.models.spike_predictor import SpikePredictor
    predictor = SpikePredictor()
    results   = predictor.run(complaint_agg, feature_matrix)
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from loguru import logger
from sklearn.metrics import mean_absolute_error, mean_squared_error
from statsmodels.tsa.statespace.sarimax import SARIMAX
from xgboost import XGBRegressor

# FIX S2: scoped warnings — not global suppression
warnings.filterwarnings("ignore", category=FutureWarning, module="statsmodels")
warnings.filterwarnings("ignore", category=UserWarning,   module="statsmodels")
warnings.filterwarnings("ignore", category=FutureWarning, module="pandas")

try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    logger.warning("Prophet not installed — skipping Prophet model (pip install prophet)")

# FIX S1: lazy config — no module-level crash
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
    d = Path(cfg["paths"]["models"]) / "prediction"
    d.mkdir(parents=True, exist_ok=True)
    return d


XGB_FEATURES = [
    "total_complaints_lag_1d",
    "total_complaints_lag_3d",
    "total_complaints_lag_7d",
    "total_complaints_lag_14d",
    "total_complaints_roll_mean_7d",
    "total_complaints_roll_std_7d",
    "total_complaints_roll_mean_14d",
    "hour_sin", "hour_cos",
    "dow_sin",  "dow_cos",
    "month_sin", "month_cos",
    "is_weekend", "is_peak_hour",
    "qoe_score_mean", "qoe_score_p10",
    "dl_throughput_mbps_mean",
    "latency_ms_mean",
    "call_drop_rate_mean",
    "degraded_session_rate_pct",
]


class SpikePredictor:
    """
    Trains and evaluates ARIMA, Prophet, and XGBoost per region.
    Selects best model by MAE and generates a 7-day forecast.
    """

    def __init__(self):
        self.models:                  dict = {}
        self.scores:                  dict = {}
        self.forecasts:               dict = {}
        self.best_model_per_region:   dict = {}

    # ─────────────────────────────────────────────────────────────────────
    # PUBLIC
    # ─────────────────────────────────────────────────────────────────────

    def run(
        self,
        complaint_agg:  pd.DataFrame,
        feature_matrix: pd.DataFrame,
    ) -> dict:
        """
        Full spike prediction pipeline.

        Returns
        -------
        dict with keys: scores, forecasts (DataFrame), best_models, summary
        """
        cfg              = _get_cfg()
        forecast_horizon = cfg["models"]["forecast_horizon_days"]
        rs               = cfg["models"]["random_state"]

        logger.info("=" * 55)
        logger.info("SPIKE PREDICTION")
        logger.info("=" * 55)

        regions = sorted(complaint_agg["region"].unique())
        logger.info(f"Training for {len(regions)} regions × 3 model types\n")

        for region in regions:
            logger.info(f"  ── Region: {region} ──────────────────────────")

            ts_df = complaint_agg[complaint_agg["region"] == region].sort_values("date").copy()
            fm_df = feature_matrix[feature_matrix["region"] == region].sort_values("date").copy()

            if len(ts_df) < 30:
                logger.warning(f"  {region}: insufficient data ({len(ts_df)} rows) — skipping")
                continue

            split     = len(ts_df) - forecast_horizon
            train_ts  = ts_df.iloc[:split]
            test_ts   = ts_df.iloc[split:]
            feat_cols = [c for c in XGB_FEATURES if c in fm_df.columns]

            region_scores: dict = {}

            # ARIMA
            arima_preds, arima_model = None, None
            try:
                arima_preds, arima_model = self._train_arima(train_ts, test_ts)
                region_scores["arima"] = _eval_metrics(
                    test_ts["total_complaints"].values, arima_preds
                )
                logger.info(
                    f"    ARIMA   — MAE: {region_scores['arima']['mae']:.2f}  "
                    f"MAPE: {region_scores['arima']['mape']:.1f}%"
                )
            except Exception as exc:
                logger.warning(f"    ARIMA failed [{region}]: {exc}")

            # Prophet
            prophet_preds, prophet_model = None, None
            if PROPHET_AVAILABLE:
                try:
                    prophet_preds, prophet_model = self._train_prophet(train_ts, test_ts)
                    region_scores["prophet"] = _eval_metrics(
                        test_ts["total_complaints"].values, prophet_preds
                    )
                    logger.info(
                        f"    Prophet — MAE: {region_scores['prophet']['mae']:.2f}  "
                        f"MAPE: {region_scores['prophet']['mape']:.1f}%"
                    )
                except Exception as exc:
                    logger.warning(f"    Prophet failed [{region}]: {exc}")

            # XGBoost
            xgb_preds, xgb_model = None, None
            try:
                xgb_preds, xgb_model = self._train_xgboost(fm_df, feat_cols, split)
                region_scores["xgboost"] = _eval_metrics(
                    test_ts["total_complaints"].values, xgb_preds
                )
                logger.info(
                    f"    XGBoost — MAE: {region_scores['xgboost']['mae']:.2f}  "
                    f"MAPE: {region_scores['xgboost']['mape']:.1f}%"
                )
            except Exception as exc:
                logger.warning(f"    XGBoost failed [{region}]: {exc}")

            # FIX S4: skip region if all models failed
            if not region_scores:
                logger.warning(f"    All models failed for {region} — skipping")
                continue

            best_name = min(region_scores, key=lambda k: region_scores[k]["mae"])
            self.best_model_per_region[region] = best_name
            self.scores[region]                = region_scores

            _available = {
                "arima":   arima_model,
                "prophet": prophet_model,
                "xgboost": xgb_model,
            }
            self.models[region] = {
                "best":  best_name,
                "model": _available[best_name],
                "all":   {k: v for k, v in _available.items() if v is not None},
            }
            logger.info(f"    ✓ Best model: {best_name.upper()}")

            self.forecasts[region] = self._generate_forecast(
                best_name,
                ts_df, fm_df,
                _available[best_name],
                feat_cols,
                forecast_horizon,
            )

        self._save()
        forecast_df = self._build_forecast_dataframe()
        forecast_df.to_parquet(_get_models_dir() / "forecasts.parquet", index=False)

        summary = self._build_summary()
        logger.success(f"\nSpike prediction complete for {len(self.scores)} regions")
        _print_score_table(self.scores)

        return {
            "scores":      self.scores,
            "forecasts":   forecast_df,
            "best_models": self.best_model_per_region,
            "summary":     summary,
        }

    # ─────────────────────────────────────────────────────────────────────
    # MODEL IMPLEMENTATIONS
    # ─────────────────────────────────────────────────────────────────────

    def _train_arima(
        self,
        train: pd.DataFrame,
        test:  pd.DataFrame,
    ) -> tuple[np.ndarray, object]:
        y_train = train["total_complaints"].values
        model   = SARIMAX(
            y_train,
            order          = (2, 1, 2),
            seasonal_order = (1, 0, 1, 7),
            enforce_stationarity  = False,
            enforce_invertibility = False,
        )
        fit   = model.fit(disp=False)
        preds = fit.forecast(steps=len(test))
        return np.maximum(preds, 0), fit

    def _train_prophet(
        self,
        train: pd.DataFrame,
        test:  pd.DataFrame,
    ) -> tuple[np.ndarray, object]:
        prophet_train = pd.DataFrame({
            "ds": pd.to_datetime(train["date"]),
            "y":  train["total_complaints"].values,
        })
        model = Prophet(
            yearly_seasonality    = True,
            weekly_seasonality    = True,
            daily_seasonality     = False,
            changepoint_prior_scale = 0.05,
        )
        model.fit(prophet_train)
        future   = model.make_future_dataframe(periods=len(test))
        forecast = model.predict(future)
        preds    = forecast.tail(len(test))["yhat"].values
        return np.maximum(preds, 0), model

    def _train_xgboost(
        self,
        fm_df:     pd.DataFrame,
        feat_cols: list[str],
        split_idx: int,
    ) -> tuple[np.ndarray, XGBRegressor]:
        rs = _get_cfg()["models"]["random_state"]
        X = fm_df[feat_cols].fillna(0)
        y = fm_df["total_complaints"].fillna(0)

        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train         = y.iloc[:split_idx]

        model = XGBRegressor(
            n_estimators     = 300,
            max_depth        = 5,
            learning_rate    = 0.05,
            subsample        = 0.8,
            colsample_bytree = 0.8,
            random_state     = rs,
            n_jobs           = -1,
            verbosity        = 0,
        )
        model.fit(
            X_train, y_train,
            eval_set  = [(X_test, y.iloc[split_idx:])],
            verbose   = False,
        )
        preds = np.maximum(model.predict(X_test), 0)
        return preds, model

    def _generate_forecast(
        self,
        model_name:      str,
        ts_df:           pd.DataFrame,
        fm_df:           pd.DataFrame,
        model:           object,
        feat_cols:       list[str],
        forecast_horizon: int,
    ) -> pd.DataFrame:
        """
        Generate forecast_horizon-day-ahead predictions.

        FIX S3: XGBoost branch now explicitly converts the scalar prediction
        to float() before np.tile to make the intent clear and avoid
        fragile index-0 array slicing.
        """
        last_date    = pd.to_datetime(ts_df["date"]).max()
        future_dates = pd.date_range(
            last_date + pd.Timedelta(days=1),
            periods=forecast_horizon, freq="D",
        )
        preds: np.ndarray

        if model_name == "arima" and model is not None:
            preds = np.maximum(model.forecast(steps=forecast_horizon), 0)

        elif model_name == "prophet" and model is not None:
            fut  = model.make_future_dataframe(periods=forecast_horizon)
            fc   = model.predict(fut)
            preds = np.maximum(fc.tail(forecast_horizon)["yhat"].values, 0)

        elif model_name == "xgboost" and model is not None and feat_cols:
            last_features = fm_df[feat_cols].fillna(0).iloc[[-1]]
            # FIX S3: explicit float() conversion before np.tile
            base_val = float(np.maximum(model.predict(last_features)[0], 0))
            preds    = np.tile(base_val, forecast_horizon)

        else:
            fallback = float(ts_df["total_complaints"].tail(7).mean())
            preds    = np.full(forecast_horizon, fallback)

        return pd.DataFrame({
            "date":       future_dates,
            "forecast":   preds,
            "model_used": model_name,
        })

    # ─────────────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────────────

    def _build_forecast_dataframe(self) -> pd.DataFrame:
        rows = []
        for region, fc_df in self.forecasts.items():
            fc = fc_df.copy()
            fc["region"] = region
            rows.append(fc)
        return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()

    def _build_summary(self) -> pd.DataFrame:
        rows = []
        for region, models in self.scores.items():
            for model_name, metrics in models.items():
                rows.append({
                    "region":   region,
                    "model":    model_name,
                    "mae":      metrics["mae"],
                    "rmse":     metrics["rmse"],
                    "mape":     metrics["mape"],
                    "is_best":  model_name == self.best_model_per_region.get(region),
                })
        return pd.DataFrame(rows).sort_values(["region", "mae"])

    def _save(self) -> None:
        models_dir = _get_models_dir()
        joblib.dump(self.models,    models_dir / "all_models.pkl")
        joblib.dump(self.scores,    models_dir / "scores.pkl")
        joblib.dump(self.forecasts, models_dir / "forecasts_dict.pkl")
        logger.info(f"  Models saved → {models_dir}")


# ─────────────────────────────────────────────────────────────────────────
# METRIC HELPERS
# ─────────────────────────────────────────────────────────────────────────

def _eval_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    y_true = np.array(y_true, dtype=float)
    y_pred = np.array(y_pred, dtype=float)
    mae    = mean_absolute_error(y_true, y_pred)
    rmse   = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mask   = y_true != 0
    mape   = (
        float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)
        if mask.any() else float("nan")
    )
    return {"mae": round(mae, 3), "rmse": round(rmse, 3), "mape": round(mape, 2)}


def _print_score_table(scores: dict) -> None:
    logger.info("\n  Model Performance Summary (MAE):")
    logger.info(
        f"  {'Region':<15} {'ARIMA':>8} {'Prophet':>10} {'XGBoost':>10} {'Winner':>10}"
    )
    logger.info("  " + "-" * 55)
    for region, s in sorted(scores.items()):
        arima_m   = f"{s['arima']['mae']:.2f}"   if "arima"   in s else "  N/A"
        prophet_m = f"{s['prophet']['mae']:.2f}" if "prophet" in s else "  N/A"
        xgb_m     = f"{s['xgboost']['mae']:.2f}" if "xgboost" in s else "  N/A"
        winner    = min(s, key=lambda k: s[k]["mae"]) if s else "N/A"
        logger.info(
            f"  {region:<15} {arima_m:>8} {prophet_m:>10} {xgb_m:>10} {winner:>10}"
        )