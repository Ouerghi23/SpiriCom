"""
complaint_classifier_trainer.py
=================================
Trains a TF-IDF + Logistic Regression classifier on the labeled rows
already in your SQLite DB (seeded by seed_db.py or real submissions).

Saves the trained model to:
    models/nlp/classifier.pkl

After this script runs, MultilingualNLPPipeline._is_complaint() will
automatically use the trained model instead of the rule-based lexicons.

Usage:
    python complaint_classifier_trainer.py          # train + evaluate
    python complaint_classifier_trainer.py --test   # train + run live test examples
    python complaint_classifier_trainer.py --info   # show DB stats without training

Requirements:
    pip install scikit-learn
"""

from __future__ import annotations

import argparse
import pickle
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from sklearn.pipeline import Pipeline
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_score, train_test_split
    from sklearn.metrics import classification_report, confusion_matrix
except ImportError:
    print("\n  scikit-learn not installed.")
    print("  Run:  pip install scikit-learn\n")
    sys.exit(1)

from src.nlp.complaint_db import ComplaintDB

OUT_PATH    = Path("models/nlp/classifier.pkl")
MIN_ROWS    = 50    # warn below this
RECOMMENDED = 200   # optimal threshold


def show_info() -> None:
    db    = ComplaintDB()
    stats = db.stats()
    df    = db.to_dataframe(limit=10_000)
    labeled = df[df["is_complaint"].notna()]

    print("\n  DB overview")
    print(f"  ├── Total rows         : {stats['total']}")
    print(f"  ├── Labeled rows       : {len(labeled)}")
    print(f"  ├── Réclamations (1)   : {labeled['is_complaint'].sum():.0f}")
    print(f"  ├── Feedback (0)       : {(~labeled['is_complaint'].astype(bool)).sum()}")
    print(f"  ├── Languages          : {stats.get('by_language', {})}")
    print(f"  └── Classifier exists  : {OUT_PATH.exists()}\n")

    if len(labeled) < RECOMMENDED:
        missing = RECOMMENDED - len(labeled)
        print(f"  ⚠  Need {missing} more labeled rows to reach the recommended minimum.")
        print(f"     Run:  python seed_db.py --count {RECOMMENDED + 50}\n")


def train(run_live_test: bool = False) -> None:
    db = ComplaintDB()
    df = db.to_dataframe(limit=10_000)

    # Only rows with a confirmed label
    labeled = df[df["is_complaint"].notna()].copy()
    n       = len(labeled)

    print(f"\n  Training on {n} labeled rows")

    if n < MIN_ROWS:
        print(f"\n  ✗ Not enough data ({n} rows, minimum is {MIN_ROWS}).")
        print(f"    Run:  python seed_db.py --count {RECOMMENDED}\n")
        sys.exit(1)

    if n < RECOMMENDED:
        print(f"  ⚠  {n} rows — model will work but accuracy improves above {RECOMMENDED}.")

    X = labeled["text_original"].fillna("").astype(str).tolist()
    y = labeled["is_complaint"].astype(int).tolist()

    # ── Model ─────────────────────────────────────────────────────────────────
    # character n-grams (2–4 chars) work across Arabic, French, and English
    # without language-specific tokenization — subwords capture morphology.
    model = Pipeline([
        ("tfidf", TfidfVectorizer(
            analyzer      = "char_wb",     # char n-grams inside word boundaries
            ngram_range   = (2, 4),        # bigrams to 4-grams
            max_features  = 30_000,
            sublinear_tf  = True,          # log-scale TF → reduces high-freq dominance
            strip_accents = "unicode",     # accent-insensitive (FIX-1 equivalent)
        )),
        ("clf", LogisticRegression(
            C             = 1.0,
            class_weight  = "balanced",   # handles unequal complaint/feedback ratio
            max_iter      = 500,
            solver        = "lbfgs",
            random_state  = 42,
        )),
    ])

    # ── Cross-validation (5-fold) ──────────────────────────────────────────────
    print("\n  Cross-validation (5-fold) …")
    cv_f1  = cross_val_score(model, X, y, cv=5, scoring="f1",        n_jobs=-1)
    cv_acc = cross_val_score(model, X, y, cv=5, scoring="accuracy",  n_jobs=-1)
    cv_pre = cross_val_score(model, X, y, cv=5, scoring="precision", n_jobs=-1)
    cv_rec = cross_val_score(model, X, y, cv=5, scoring="recall",    n_jobs=-1)

    print(f"  ├── F1        : {cv_f1.mean():.3f}  ±{cv_f1.std():.3f}")
    print(f"  ├── Accuracy  : {cv_acc.mean():.3f}  ±{cv_acc.std():.3f}")
    print(f"  ├── Precision : {cv_pre.mean():.3f}  ±{cv_pre.std():.3f}")
    print(f"  └── Recall    : {cv_rec.mean():.3f}  ±{cv_rec.std():.3f}")

    # ── Hold-out evaluation (20% test split) ──────────────────────────────────
    if n >= 80:
        X_tr, X_te, y_tr, y_te = train_test_split(
            X, y, test_size=0.2, stratify=y, random_state=42
        )
        model.fit(X_tr, y_tr)
        y_pred = model.predict(X_te)
        print("\n  Hold-out classification report (20% test set):")
        print(classification_report(
            y_te, y_pred,
            target_names=["Feedback (0)", "Réclamation (1)"],
            digits=3,
        ))

        cm = confusion_matrix(y_te, y_pred)
        print(f"  Confusion matrix:")
        print(f"  [[TN={cm[0][0]:4d}  FP={cm[0][1]:4d}]")
        print(f"   [FN={cm[1][0]:4d}  TP={cm[1][1]:4d}]]")
        print()

    # ── Final model — trained on ALL labeled data ─────────────────────────────
    print("  Training final model on all labeled data …")
    model.fit(X, y)

    # ── Save ──────────────────────────────────────────────────────────────────
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "wb") as f:
        pickle.dump(model, f)

    print(f"\n  ✓ Model saved → {OUT_PATH}")
    print(f"  ✓ MultilingualNLPPipeline will now use this model automatically.")
    print(f"    (falls back to rule-based if the file is missing or deleted)\n")

    # ── Optional live test ────────────────────────────────────────────────────
    if run_live_test:
        _live_test(model)


def _live_test(model) -> None:
    """Quick sanity-check on unseen sentences."""
    examples = [
        ("mon reseau coupe tout le temps !!",                 True,  "FR complaint (no accent)"),
        ("pas de 4g depuis hier soir c'est inacceptable",     True,  "FR complaint"),
        ("شبكتي مقطوعة في تونس منذ 3 أيام",                  True,  "AR complaint"),
        ("my network keeps dropping in Tunis since yesterday", True,  "EN complaint"),
        ("merci pour votre excellent service",                 False, "FR positive feedback"),
        ("comment activer le roaming international ?",        False, "FR question"),
        ("شكراً على الخدمة الممتازة",                          False, "AR positive"),
        ("what are your 5G plans?",                           False, "EN inquiry"),
    ]

    print("  Live test on unseen examples:")
    print(f"  {'Text':<50} {'Expected':<12} {'Predicted':<12} {'OK?'}")
    print("  " + "─" * 85)

    passed = 0
    for text, expected, note in examples:
        pred  = bool(model.predict([text])[0])
        ok    = pred == expected
        mark  = "✓" if ok else "✗"
        label = lambda v: "RÉCLAMATION" if v else "FEEDBACK   "
        print(f"  {text[:48]:<50} {label(expected):<12} {label(pred):<12} {mark}  {note}")
        if ok:
            passed += 1

    print(f"\n  {passed}/{len(examples)} passed\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train the is_complaint classifier on labeled DB data."
    )
    parser.add_argument(
        "--test",  action="store_true",
        help="After training, run a live test on unseen examples."
    )
    parser.add_argument(
        "--info",  action="store_true",
        help="Show DB stats without training."
    )
    args = parser.parse_args()

    if args.info:
        show_info()
    else:
        train(run_live_test=args.test)