# src/mlops/mlflow_config.py
import mlflow
from pathlib import Path

BASE_DIR     = Path(__file__).resolve().parents[2]
DB_PATH      = BASE_DIR / "mlflow.db"
TRACKING_URI = f"sqlite:///{DB_PATH.as_posix()}"

mlflow.set_tracking_uri(TRACKING_URI)

def get_or_create_experiment(name: str) -> str:
    """Retourne le NOM (pas l'ID) — mlflow.set_experiment() attend un nom."""
    client = mlflow.tracking.MlflowClient()
    exp    = client.get_experiment_by_name(name)

    if exp is None:
        mlflow.create_experiment(name)
    elif exp.lifecycle_stage == "deleted":
        client.restore_experiment(exp.experiment_id)

    return name  # ← NOM, pas ID