# src/mlops/mlflow_config.py
import mlflow
from pathlib import Path

# SQLite — recommandé depuis Feb 2026, remplace FileStore
DB_PATH      = Path(__file__).resolve().parents[2] / "mlflow.db"
TRACKING_URI = f"sqlite:///{DB_PATH}"

mlflow.set_tracking_uri(TRACKING_URI)

def get_or_create_experiment(name: str) -> str:
    exp = mlflow.get_experiment_by_name(name)
    if exp is None:
        return mlflow.create_experiment(name)
    return exp.experiment_id