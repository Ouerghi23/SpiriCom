"""
Customer Clustering Module
===========================
Profiles affected users by experience pattern using:

  Model 1 — K-Means   (partitional, fast, interpretable)
  Model 2 — DBSCAN    (density-based, finds irregular clusters + noise)

K selection: Elbow method + Silhouette score.

Usage:
    from src.models.customer_clustering import CustomerClusterer
    clusterer = CustomerClusterer()
    results   = clusterer.run(kpi_clean, complaints_clean)
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from loguru import logger
from sklearn.cluster import DBSCAN, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import davies_bouldin_score, silhouette_score
from sklearn.preprocessing import StandardScaler

# FIX C1: lazy config — no module-level crash
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
    """Return and create models/clustering/ lazily."""
    cfg = _get_cfg()
    d = Path(cfg["paths"]["models"]) / "clustering"
    d.mkdir(parents=True, exist_ok=True)
    return d


CLUSTERING_FEATURES = [
    "dl_throughput_mbps",
    "ul_throughput_mbps",
    "latency_ms",
    "packet_loss_pct",
    "data_session_success_rate",
    "data_qoe_score",
    "call_setup_success_rate",
    "call_drop_rate",
    "voice_quality_score_mos",
    "voice_qoe_score",
    "qoe_score",
]


def _auto_label(profile: dict) -> str:
    qoe = profile.get("qoe_score", 50)
    cdr = profile.get("call_drop_rate", 5)
    lat = profile.get("latency_ms", 100)
    if qoe >= 80:
        return "High QoE — Satisfied Users"
    elif qoe >= 65 and cdr < 2:
        return "Moderate QoE — Data Issues"
    elif qoe >= 65 and cdr >= 2:
        return "Moderate QoE — Voice Issues"
    elif lat > 200:
        return "Low QoE — High Latency"
    else:
        return "Low QoE — Multi-Service Degradation"


def _auto_label_ranked(profiles_df: pd.DataFrame) -> list[str]:
    """
    Assign distinct ranked labels based on composite QoE score.

    FIX C2: original code used sort_values() then indexed with orig_idx
    (the pre-sort index), which caused IndexError when the original index
    didn't start at 0. Now uses enumerate() on the sorted result and maps
    back via the original integer position.
    """
    _LABEL_MAP = {
        0: "Premium — High QoE & Low Complaints",
        1: "Standard — Moderate QoE",
        2: "At-Risk — Degraded QoE",
        3: "Critical — High Complaints",
    }

    df = profiles_df.reset_index(drop=True).copy()

    if "qoe_score" in df.columns:
        df["_rank"] = (
            df.get("qoe_score",          pd.Series(50.0,  index=df.index)) * 0.5
            - df.get("n_complaints_mean", pd.Series(0.0,   index=df.index)) * 2.0
            - df.get("latency_ms",        pd.Series(50.0,  index=df.index)) * 0.1
            + df.get("dl_throughput_mbps",pd.Series(20.0,  index=df.index)) * 0.3
        )
        order = df["_rank"].sort_values(ascending=False).index.tolist()
    else:
        order = list(df.index)

    # Build a mapping from original integer position → label
    labels_out = [""] * len(df)
    for rank, orig_pos in enumerate(order):
        labels_out[orig_pos] = _LABEL_MAP.get(rank, f"Cluster {orig_pos}")
    return labels_out


class CustomerClusterer:
    """
    Clusters users by experience pattern.
    Selects optimal K via Elbow + Silhouette.
    Profiles each cluster and generates auto labels.
    """

    def __init__(self):
        self.kmeans:       Optional[KMeans]         = None
        self.dbscan:       Optional[DBSCAN]         = None
        self.scaler:       Optional[StandardScaler] = None
        self.pca:          Optional[PCA]            = None
        self.optimal_k:    int   = 4
        self.elbow_scores: dict  = {}
        self.sil_scores:   dict  = {}
        self.pca_variance: float = 0.0

    # ─────────────────────────────────────────────────────────────────────
    # PUBLIC
    # ─────────────────────────────────────────────────────────────────────

    def run(
        self,
        kpi_clean:        pd.DataFrame,
        complaints_clean: pd.DataFrame,
    ) -> dict:
        """
        Full clustering pipeline.

        Returns
        -------
        dict with keys: user_profiles, kmeans_results, dbscan_results,
                        cluster_profiles, elbow_data, silhouette_data,
                        pca_coords, pca_variance_pct, optimal_k
        """
        logger.info("=" * 55)
        logger.info("CUSTOMER CLUSTERING")
        logger.info("=" * 55)

        logger.info("\n[1/5] Building per-user feature matrix ...")
        user_features = self._build_user_features(kpi_clean)

        if len(user_features) > 8000:
            user_features = user_features.sample(n=8000, random_state=42)
            logger.info(
                f"  Sampled 8,000 from {kpi_clean['msisdn'].nunique():,} users"
            )

        logger.info("\n[2/5] Scaling and applying PCA ...")
        X_scaled, X_pca = self._scale_and_reduce(user_features)

        logger.info("\n[3/5] Selecting optimal K ...")
        self.optimal_k = self._select_k(X_scaled)
        logger.info(f"  Optimal K selected: {self.optimal_k}")

        logger.info(f"\n[4/5] Training K-Means (k={self.optimal_k}) ...")
        kmeans_results = self._run_kmeans(user_features, X_scaled, X_pca)

        logger.info("\n[5/5] Running DBSCAN ...")
        dbscan_results = self._run_dbscan(user_features, X_scaled, X_pca)

        profiles_km = self._profile_clusters(
            kmeans_results["user_df"], "kmeans_cluster",
            kpi_clean, complaints_clean,
        )
        profiles_db = self._profile_clusters(
            dbscan_results["user_df"], "dbscan_cluster",
            kpi_clean, complaints_clean,
        )

        models_dir = _get_models_dir()
        self._save(models_dir)
        kmeans_results["user_df"].to_parquet(models_dir / "kmeans_users.parquet", index=False)
        dbscan_results["user_df"].to_parquet(models_dir / "dbscan_users.parquet", index=False)

        # FIX C3: corrected f-string (missing newline between n_clusters and n_noise)
        logger.success(
            f"\nClustering complete:\n"
            f"  K-Means clusters : {self.optimal_k}\n"
            f"  DBSCAN clusters  : {dbscan_results['n_clusters']}"
            f"  (+{dbscan_results['n_noise']} noise points)"
        )

        return {
            "user_profiles":    kmeans_results["user_df"],
            "kmeans_results":   kmeans_results,
            "dbscan_results":   dbscan_results,
            "cluster_profiles": {"kmeans": profiles_km, "dbscan": profiles_db},
            "elbow_data": {
                "k":       list(self.elbow_scores.keys()),
                "inertia": list(self.elbow_scores.values()),
            },
            "silhouette_data": {
                "k":     list(self.sil_scores.keys()),
                "score": list(self.sil_scores.values()),
            },
            "pca_coords":       X_pca,
            "pca_variance_pct": round(self.pca_variance, 1),   # FIX N5 support
            "optimal_k":        self.optimal_k,
        }

    # ─────────────────────────────────────────────────────────────────────
    # FEATURE MATRIX
    # ─────────────────────────────────────────────────────────────────────

    def _build_user_features(self, kpi_clean: pd.DataFrame) -> pd.DataFrame:
        """
        Aggregate per-session KPI data to per-user level.

        FIX C5: mode()[0] replaced with mode().iloc[:1] + fillna to handle
        empty groups without IndexError.
        """
        feat_cols = [c for c in CLUSTERING_FEATURES if c in kpi_clean.columns]

        def _safe_mode(x: pd.Series) -> str:
            m = x.mode()
            return m.iloc[0] if len(m) > 0 else "Unknown"

        agg = kpi_clean.groupby("msisdn").agg(
            n_sessions = ("timestamp", "count"),
            region     = ("region", _safe_mode),
            **{f"{c}_mean": (c, "mean") for c in feat_cols},
            **{f"{c}_std":  (c, "std")  for c in feat_cols},
            **{f"{c}_min":  (c, "min")  for c in feat_cols},
        ).reset_index()

        if "is_degraded_session" in kpi_clean.columns:
            deg = (
                kpi_clean.groupby("msisdn")["is_degraded_session"]
                .mean()
                .reset_index(name="degraded_rate")
            )
            agg = agg.merge(deg, on="msisdn", how="left")

        agg = agg.fillna(agg.median(numeric_only=True))
        logger.info(f"  User feature matrix: {agg.shape[0]:,} users × {agg.shape[1]} cols")
        return agg

    # ─────────────────────────────────────────────────────────────────────
    # SCALING & PCA
    # ─────────────────────────────────────────────────────────────────────

    def _scale_and_reduce(
        self, user_df: pd.DataFrame
    ) -> tuple[np.ndarray, np.ndarray]:
        num_cols = [
            c for c in user_df.select_dtypes(include="number").columns
            if c != "msisdn"
        ]
        self.scaler = StandardScaler()
        X_scaled    = self.scaler.fit_transform(user_df[num_cols].fillna(0))

        n_comp = min(2, X_scaled.shape[1])
        self.pca = PCA(n_components=n_comp, random_state=_get_cfg()["models"]["random_state"])
        X_pca    = self.pca.fit_transform(X_scaled)

        self.pca_variance = float(self.pca.explained_variance_ratio_.sum() * 100)
        logger.info(f"  PCA variance explained (2 components): {self.pca_variance:.1f}%")
        return X_scaled, X_pca

    # ─────────────────────────────────────────────────────────────────────
    # K SELECTION
    # ─────────────────────────────────────────────────────────────────────

    def _select_k(self, X_scaled: np.ndarray) -> int:
        """
        Elbow + Silhouette to find optimal K.

        FIX C4: sil_scores is only populated for k >= 2 (silhouette requires
        at least 2 clusters). The fallback ensures we never call max() on an
        empty dict even if K_MIN = 1.
        """
        cfg     = _get_cfg()
        k_min, k_max = cfg["models"]["clustering_k_range"]
        rs      = cfg["models"]["random_state"]
        k_range = range(max(k_min, 2), k_max + 1)   # silhouette needs k >= 2

        for k in k_range:
            km = KMeans(n_clusters=k, random_state=rs, n_init=10)
            labels = km.fit_predict(X_scaled)
            self.elbow_scores[k] = km.inertia_
            self.sil_scores[k]   = silhouette_score(
                X_scaled, labels, sample_size=min(5000, len(X_scaled))
            )
            logger.info(
                f"  K={k}  inertia={self.elbow_scores[k]:,.0f}  "
                f"silhouette={self.sil_scores[k]:.3f}"
            )

        if not self.sil_scores:
            logger.warning("  No silhouette scores — defaulting to K=4")
            return 4

        return int(max(self.sil_scores, key=self.sil_scores.get))

    # ─────────────────────────────────────────────────────────────────────
    # K-MEANS
    # ─────────────────────────────────────────────────────────────────────

    def _run_kmeans(
        self,
        user_df:  pd.DataFrame,
        X_scaled: np.ndarray,
        X_pca:    np.ndarray,
    ) -> dict:
        rs = _get_cfg()["models"]["random_state"]
        self.kmeans = KMeans(
            n_clusters   = self.optimal_k,
            random_state = rs,
            n_init       = 20,
            max_iter     = 500,
        )
        labels = self.kmeans.fit_predict(X_scaled)

        sil = silhouette_score(X_scaled, labels, sample_size=min(5000, len(X_scaled)))
        dbi = davies_bouldin_score(X_scaled, labels)

        user_out = user_df.copy()
        user_out["kmeans_cluster"] = labels
        user_out["pca_x"]          = X_pca[:, 0]
        user_out["pca_y"]          = X_pca[:, 1] if X_pca.shape[1] > 1 else 0.0

        logger.info(f"  K-Means  silhouette={sil:.3f}  davies-bouldin={dbi:.3f}")
        return {
            "user_df":          user_out,
            "labels":           labels,
            "silhouette_score": round(sil, 3),
            "davies_bouldin":   round(dbi, 3),
            "inertia":          self.kmeans.inertia_,
        }

    # ─────────────────────────────────────────────────────────────────────
    # DBSCAN
    # ─────────────────────────────────────────────────────────────────────

    def _run_dbscan(
        self,
        user_df:  pd.DataFrame,
        X_scaled: np.ndarray,
        X_pca:    np.ndarray,
    ) -> dict:
        from sklearn.neighbors import NearestNeighbors
        k = 5
        nbrs = NearestNeighbors(n_neighbors=k).fit(X_scaled)
        distances, _ = nbrs.kneighbors(X_scaled)
        eps = float(np.percentile(distances[:, -1], 95))
        logger.info(f"  DBSCAN auto eps: {eps:.3f}")

        self.dbscan = DBSCAN(eps=eps, min_samples=k, n_jobs=-1)
        labels      = self.dbscan.fit_predict(X_scaled)

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        n_noise    = int((labels == -1).sum())

        user_out = user_df.copy()
        user_out["dbscan_cluster"] = labels
        user_out["pca_x"]          = X_pca[:, 0]
        user_out["pca_y"]          = X_pca[:, 1] if X_pca.shape[1] > 1 else 0.0

        logger.info(f"  DBSCAN: {n_clusters} clusters, {n_noise} noise points")
        return {
            "user_df":    user_out,
            "labels":     labels,
            "n_clusters": n_clusters,
            "n_noise":    n_noise,
            "eps_used":   round(eps, 3),
        }

    # ─────────────────────────────────────────────────────────────────────
    # CLUSTER PROFILING
    # ─────────────────────────────────────────────────────────────────────

    def _profile_clusters(
        self,
        user_df:          pd.DataFrame,
        cluster_col:      str,
        kpi_clean:        pd.DataFrame,
        complaints_clean: pd.DataFrame,
    ) -> pd.DataFrame:
        kpi_cols  = [c for c in CLUSTERING_FEATURES if f"{c}_mean" in user_df.columns]
        mean_cols = [f"{c}_mean" for c in kpi_cols]

        valid = user_df[user_df[cluster_col] != -1]
        if valid.empty:
            return pd.DataFrame()

        profiles = (
            valid
            .groupby(cluster_col)
            .agg(
                n_users = ("msisdn", "count"),
                **{c: (c, "mean") for c in mean_cols if c in valid.columns},
            )
            .reset_index()
        )

        # FIX C2: use _auto_label_ranked which now correctly handles non-0 indices
        try:
            profiles["cluster_label"] = _auto_label_ranked(profiles)
        except Exception as exc:
            logger.warning(f"  Auto-labelling failed: {exc} — using simple labels")
            profiles["cluster_label"] = [
                _auto_label({c.replace("_mean", ""): row[c]
                              for c in mean_cols if c in profiles.columns})
                for _, row in profiles.iterrows()
            ]

        profiles["pct_of_users"] = (
            profiles["n_users"] / profiles["n_users"].sum() * 100
        ).round(1)

        logger.info(f"\n  Cluster profiles ({cluster_col}):")
        for _, row in profiles.iterrows():
            logger.info(
                f"    Cluster {int(row[cluster_col]):>2} | "
                f"n={int(row['n_users']):>5} ({row['pct_of_users']:.1f}%) | "
                f"{row['cluster_label']}"
            )
        return profiles

    # ─────────────────────────────────────────────────────────────────────
    # SAVE / LOAD
    # ─────────────────────────────────────────────────────────────────────

    def _save(self, models_dir: Path) -> None:
        for name, obj in [
            ("kmeans.pkl", self.kmeans),
            ("dbscan.pkl", self.dbscan),
            ("scaler.pkl", self.scaler),
            ("pca.pkl",    self.pca),
        ]:
            if obj is not None:
                joblib.dump(obj, models_dir / name)
        logger.info(f"  Models saved → {models_dir}")

    @classmethod
    def load(cls) -> "CustomerClusterer":
        models_dir = _get_models_dir()
        obj = cls()
        obj.kmeans = joblib.load(models_dir / "kmeans.pkl")
        obj.dbscan = joblib.load(models_dir / "dbscan.pkl")
        obj.scaler = joblib.load(models_dir / "scaler.pkl")
        obj.pca    = joblib.load(models_dir / "pca.pkl")
        return obj