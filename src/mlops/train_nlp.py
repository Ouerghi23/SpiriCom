# src/mlops/train_nlp.py
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import mlflow
import mlflow.sklearn
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import f1_score, accuracy_score, precision_score, recall_score

from src.mlops.mlflow_config import get_or_create_experiment
from src.nlp.complaint_db import ComplaintDB

MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "nlp" / "classifier.pkl"

def train():
    # ── Données ───────────────────────────────────────────────────────
    db      = ComplaintDB()
    df      = db.to_dataframe(limit=10_000)
    labeled = df[df["is_complaint"].notna()].copy()

    if len(labeled) < 50:
        print(f"⚠  Pas assez de données ({len(labeled)} lignes). Lance seed_db.py d'abord.")
        return

    X = labeled["text_original"].fillna("").astype(str).tolist()
    y = labeled["is_complaint"].astype(int).tolist()

    # ── Paramètres du modèle ──────────────────────────────────────────
    params = {
        "tfidf_analyzer":    "char_wb",
        "tfidf_ngram_range": "(2, 4)",
        "tfidf_max_features": 30_000,
        "tfidf_sublinear_tf": True,
        "lr_C":              1.0,
        "lr_class_weight":   "balanced",
        "lr_max_iter":       500,
        "n_samples":         len(labeled),
    }

    # ── MLflow run ────────────────────────────────────────────────────
    mlflow.set_experiment(get_or_create_experiment("SpiriComp — NLP Classifier"))


    with mlflow.start_run(run_name="nlp-complaint-classifier"):

        # Log params
        mlflow.log_params(params)

        # Modèle
        model = Pipeline([
            ("tfidf", TfidfVectorizer(
                analyzer="char_wb", ngram_range=(2, 4),
                max_features=30_000, sublinear_tf=True,
                strip_accents="unicode",
            )),
            ("clf", LogisticRegression(
                C=1.0, class_weight="balanced",
                max_iter=500, solver="lbfgs", random_state=42,
            )),
        ])

        # Cross-validation
        cv_f1  = cross_val_score(model, X, y, cv=5, scoring="f1",       n_jobs=-1)
        cv_acc = cross_val_score(model, X, y, cv=5, scoring="accuracy", n_jobs=-1)

        mlflow.log_metrics({
            "cv_f1_mean":       round(cv_f1.mean(),  3),
            "cv_f1_std":        round(cv_f1.std(),   3),
            "cv_acc_mean":      round(cv_acc.mean(), 3),
        })

        # Hold-out evaluation
        if len(labeled) >= 80:
            X_tr, X_te, y_tr, y_te = train_test_split(
                X, y, test_size=0.2, stratify=y, random_state=42
            )
            model.fit(X_tr, y_tr)
            y_pred = model.predict(X_te)

            mlflow.log_metrics({
                "test_f1":        round(f1_score(y_te, y_pred),        3),
                "test_accuracy":  round(accuracy_score(y_te, y_pred),  3),
                "test_precision": round(precision_score(y_te, y_pred), 3),
                "test_recall":    round(recall_score(y_te, y_pred),    3),
            })

        # Entraîne sur TOUT + sauvegarde
        model.fit(X, y)
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Log le modèle dans MLflow Registry
        mlflow.sklearn.log_model(
        model,
        artifact_path="nlp_classifier",
        )

        # Sauvegarde aussi le .pkl pour FastAPI
        import pickle
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(model, f)

        print(f"✅ NLP model logged — F1={cv_f1.mean():.3f} | run_id: {mlflow.active_run().info.run_id}")

if __name__ == "__main__":
    train()