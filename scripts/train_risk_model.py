"""Train and evaluate the stopped-vs-built risk model on real Texas projects.

Inputs:  data/labels/tx_projects.csv, data/features/tx_project_features.csv
Output:  data/model/risk_model.json  (coefficients, scaling, metrics; no project rows)

The model: logistic regression, class-weighted because stopped projects are rare.
Evaluation: repeated stratified 5-fold cross-validation. We report recall on
stopped projects ("of the projects that were stopped, how many did we flag?")
and ROC AUC, not accuracy.

Run: python scripts/train_risk_model.py
"""
import csv
import json
import math
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, recall_score, roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = ROOT / "data/labels/tx_projects.csv"
FEATURES = ROOT / "data/features/tx_project_features.csv"
OUT = ROOT / "data/model/risk_model.json"

FEATURE_NAMES = [
    "in_city_limits",
    "in_urban_area",
    "log_county_density",
    "log_km_to_metro",
    "is_crypto",
    "log_county_projects",
]
# Capacity is left out on purpose: stopped proposals often never published a size,
# so "MW unknown" predicts the tracker's bookkeeping, not real-world risk.
# Water stress is left out too: in Texas it comes out with a negative sign (built
# West Texas crypto/AI campuses sit in high-stress basins), which is geography, not
# cause. Water is shown as its own check on the site page instead.


def vector(f, median_log_mw):
    yes = lambda k: 1.0 if f[k] == "yes" else 0.0
    return [
        yes("in_city_limits"),
        yes("in_urban_area"),
        math.log10(float(f["county_density_per_sqmi"]) + 1),
        math.log10(float(f["km_to_nearest_metro"]) + 1),
        yes("is_crypto"),
        math.log10(float(f["county_tracked_projects"])),
    ]


def load(comparison):
    projects = {p["project_id"]: p for p in csv.DictReader(PROJECTS.open(encoding="utf-8"))}
    feats = {f["project_id"]: f for f in csv.DictReader(FEATURES.open(encoding="utf-8"))}
    known_mw = [float(f["log_capacity_mw"]) for f in feats.values() if f["log_capacity_mw"]]
    median_log_mw = float(np.median(known_mw))

    X, y, ids = [], [], []
    for pid, p in projects.items():
        f = feats.get(pid)
        if not f or p["use_for_training"] != "yes" or f["location_reliable"] != "yes":
            continue
        if comparison == "recent" and p["tracker_status"] == "operational":
            continue
        X.append(vector(f, median_log_mw))
        y.append(1 if p["label"] == "stopped" else 0)
        ids.append(pid)
    return np.array(X), np.array(y), ids, median_log_mw


def evaluate(X, y):
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1
    Z = (X - mu) / sd
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=20, random_state=7)
    aucs, recalls, precisions = [], [], []
    for tr, te in cv.split(Z, y):
        m = LogisticRegression(class_weight="balanced", C=0.5, max_iter=1000).fit(Z[tr], y[tr])
        p = m.predict_proba(Z[te])[:, 1]
        aucs.append(roc_auc_score(y[te], p))
        recalls.append(recall_score(y[te], p >= 0.5))
        precisions.append(precision_score(y[te], p >= 0.5, zero_division=0))
    model = LogisticRegression(class_weight="balanced", C=0.5, max_iter=1000).fit(Z, y)
    return {
        "n_projects": int(len(y)),
        "n_stopped": int(y.sum()),
        "n_built": int(len(y) - y.sum()),
        "cv": "5-fold stratified, repeated 20 times",
        "roc_auc_mean": round(float(np.mean(aucs)), 3),
        "roc_auc_std": round(float(np.std(aucs)), 3),
        "stopped_recall_at_0_5": round(float(np.mean(recalls)), 3),
        "stopped_precision_at_0_5": round(float(np.mean(precisions)), 3),
        "baseline_stopped_rate": round(float(y.mean()), 3),
    }, model, mu, sd


def main():
    results = {}
    for comparison, desc in [
        ("all_built", "stopped vs all built (operating + under construction)"),
        ("recent", "stopped vs under construction only (recent projects that got through)"),
    ]:
        X, y, ids, median_log_mw = load(comparison)
        metrics, model, mu, sd = evaluate(X, y)
        results[comparison] = {
            "description": desc,
            "metrics": metrics,
            "coefficients": {n: round(float(c), 3) for n, c in zip(FEATURE_NAMES, model.coef_[0])},
            "intercept": round(float(model.intercept_[0]), 3),
            "feature_mean": [round(float(v), 5) for v in mu],
            "feature_std": [round(float(v), 5) for v in sd],
            "median_log_capacity_mw": round(median_log_mw, 4),
        }
        print(f"\n== {comparison}: {desc}")
        print(json.dumps(metrics, indent=1))
        for n, c in sorted(results[comparison]["coefficients"].items(), key=lambda kv: -abs(kv[1])):
            print(f"  {n:22s} {c:+.3f}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "model": "logistic_regression_class_weighted",
        "trained": date.today().isoformat(),
        "features": FEATURE_NAMES,
        "label": "1 = stopped (withdrawn, denied, moratorium, suspended, cancelled), 0 = built",
        "data": "More Than Just Parks Texas tracker (T01) + Census geocoder and county data",
        "notes": [
            "Features are static location and project facts, not dated signals, so they carry no outcome leakage, but they also cannot show risk changing over time.",
            "Built projects include older colocation sites; stopped ones are mostly recent proposals. The 'recent' comparison reduces that mismatch.",
            "Small sample: treat metrics as indicative, not proof.",
        ],
        "default_model": "recent",
        "comparisons": results,
    }, indent=1))
    print(f"\nsaved {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
