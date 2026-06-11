# src/mlops/train_all.py
import sys
from pathlib import Path

# Ajoute la racine du projet au PYTHONPATH — résout tous les imports src.*
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.mlops.train_nlp import train as train_nlp

if __name__ == "__main__":
    print("=== SpiriComp MLOps Training Pipeline ===\n")
    print("1/1 — NLP Classifier")
    train_nlp()
    print("\n✅ Done — lance: mlflow ui")