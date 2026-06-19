# src/mlops/train_all.py
import sys
from pathlib import Path

# Ajoute la racine du projet au PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.mlops.train_nlp import train as train_nlp

if __name__ == "__main__":
    print("=== SpiriCom MLOps Training Pipeline ===\n")
    print("1/1 — NLP Classifier")
    train_nlp()
    print("\n✅ Done — lance: mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5001")