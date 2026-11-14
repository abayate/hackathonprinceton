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
from sklearn.metrics import brier_score_loss, precision_score, recall_score, roc_auc_score
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


def fit_scaled(X, y):
    """Fit scaling and regression using only the supplied training rows."""
    mu, sd = X.mean(0), X.std(0)
    sd = np.where(sd == 0, 1, sd)
    Z = (X - mu) / sd
    model = LogisticRegression(class_weight="balanced", C=0.5, max_iter=1000).fit(Z, y)
    return model, mu, sd


def prior_correct(p, prior):
    """Diagnostic odds shift from balanced classes to the training-fold prior.

    This is not fitted calibration and does not establish prospective validity.
    """
    return p * prior / (p * prior + (1 - p) * (1 - prior))


def reliability(y, p):
    rows = []
    for i in range(5):
        lo, hi = i / 5, (i + 1) / 5
        mask = (p >= lo) & ((p < hi) if i < 4 else (p <= hi))
        rows.append({
            "lower": lo, "upper": hi, "count": int(mask.sum()),
            "mean_score": round(float(p[mask].mean()), 6) if mask.any() else None,
            "stopped_rate": round(float(y[mask].mean()), 6) if mask.any() else None,
        })
    return rows


def band_outcomes(y, p, repeat_ids):
    """Observed stopped fractions, not calibrated probabilities or delay outcomes."""
    thresholds = {"watch": 0.4, "red": 0.6}
    masks = {
        "green": p < thresholds["watch"],
        "watch": (p >= thresholds["watch"]) & (p < thresholds["red"]),
        "red": p >= thresholds["red"],
    }
    bands = {}
    for name, mask in masks.items():
        count, stopped = int(mask.sum()), int(y[mask].sum())
        repeat_rates = [
            float(y[mask & (repeat_ids == repeat)].mean())
            for repeat in np.unique(repeat_ids) if (mask & (repeat_ids == repeat)).any()
        ]
        bands[name] = {
            "count": count, "stopped_count": stopped,
            "rate": round(stopped / count, 6) if count else None,
            "repeat_min": round(min(repeat_rates), 6) if repeat_rates else None,
            "repeat_max": round(max(repeat_rates), 6) if repeat_rates else None,
            "repeats_with_observations": len(repeat_rates),
        }
    return {
        "thresholds": thresholds, "repeat_count": len(np.unique(repeat_ids)),
        "count_basis": "Pooled held-out predictions, 20 per project. Repeat ranges measure split sensitivity, not confidence intervals. Outcomes are stopped, not delayed.",
        "bands": bands,
    }


def evaluate(X, y):
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=20, random_state=7)
    aucs, recalls, precisions = [], [], []
    outcomes, raw_scores, corrected_scores, base_scores = [], [], [], []
    repeat_ids = []
    for fold_index, (tr, te) in enumerate(cv.split(X, y)):
        m, fold_mu, fold_sd = fit_scaled(X[tr], y[tr])
        p = m.predict_proba((X[te] - fold_mu) / fold_sd)[:, 1]
        aucs.append(roc_auc_score(y[te], p))
        recalls.append(recall_score(y[te], p >= 0.5))
        precisions.append(precision_score(y[te], p >= 0.5, zero_division=0))
        outcomes.extend(y[te])
        raw_scores.extend(p)
        corrected_scores.extend(prior_correct(p, float(y[tr].mean())))
        base_scores.extend(np.full(len(te), y[tr].mean()))
        repeat_ids.extend([fold_index // 5] * len(te))
    observed, raw, corrected = map(np.asarray, (outcomes, raw_scores, corrected_scores))
    model, mu, sd = fit_scaled(X, y)
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
        "mean_score_training": round(float(model.predict_proba((X - mu) / sd)[:, 1].mean()), 6),
        "oof_prediction_count": len(observed),
        "oof_aggregation": "Pooled held-out predictions; each project appears once per repeat (20 times), not 20 independent projects.",
        "oof_thresholds": {
            str(t): {
                "recall": round(float(recall_score(observed, raw >= t)), 6),
                "precision": round(float(precision_score(observed, raw >= t, zero_division=0)), 6),
            } for t in (0.4, 0.5, 0.6)
        },
        "brier_raw_oof": round(float(brier_score_loss(observed, raw)), 6),
        "brier_prior_corrected_oof": round(float(brier_score_loss(observed, corrected)), 6),
        "brier_base_rate_oof": round(float(brier_score_loss(observed, base_scores)), 6),
        "reliability_raw_oof": reliability(observed, raw),
        "reliability_prior_corrected_oof": reliability(observed, corrected),
        "prior_correction": "Diagnostic log-odds shift using only each training fold's stopped share; not a calibrated deployment probability.",
        "band_outcomes_oof": band_outcomes(observed, raw, np.asarray(repeat_ids)),
    }, model, mu, sd


def holdout_demo(X, y, ids):
    pid = "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9"
    index = ids.index(pid)
    keep = np.arange(len(ids)) != index
    model, mu, sd = fit_scaled(X[keep], y[keep])
    score = float(model.predict_proba((X[[index]] - mu) / sd)[0, 1])
    reference = model.predict_proba((X[keep] - mu) / sd)[:, 1]
    return {
        "project_id": pid, "name": "Highlander SM One (San Marcos)",
        "comparison": "recent", "training_n": int(keep.sum()),
        "score": round(score, 6),
        "percentile": round(float(np.mean(reference <= score) * 100), 3),
        "percentile_basis": "Share of the other 101 recent projects with a score no greater, from the same holdout-trained model; reference scores are in-sample.",
        "handoff_score": 0.57, "reproduces_handoff_to_2dp": round(score, 2) == 0.57,
        "limitation": "Project excluded from fitting and scaling, but feature data are today's snapshot. This is not a historical backtest.",
    }


def verify_scoring_unchanged(artifact, path=OUT):
    if not path.exists():
        return
    existing = json.loads(path.read_text())
    if artifact.get("features") != existing.get("features"):
        raise ValueError("Scoring feature order changed; artifact was not written")
    for name, model in artifact["comparisons"].items():
        # Existing loaders consume coefficient values in insertion order.
        previous = existing["comparisons"][name]
        if list(model["coefficients"].items()) != list(previous["coefficients"].items()):
            raise ValueError(f"Scoring parameters changed: {name}.coefficients order/values; artifact was not written")
        for field in ("coefficients", "intercept", "feature_mean", "feature_std"):
            if model[field] != previous[field]:
                raise ValueError(f"Scoring parameters changed: {name}.{field}; artifact was not written")


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

    artifact = {
        "model": "logistic_regression_class_weighted",
        "trained": json.loads(OUT.read_text())["trained"] if OUT.exists() else date.today().isoformat(),
        "features": FEATURE_NAMES,
        "label": "1 = stopped (withdrawn, denied, moratorium, suspended, cancelled), 0 = built",
        "data": "More Than Just Parks Texas tracker (T01) + Census geocoder and county data",
        "notes": [
            "Features are today's location/project snapshot, not pre-decision observations. county_tracked_projects includes proposed projects from today's tracker, so historical leakage is possible; this is not a temporal backtest.",
            "Built projects include older colocation sites; stopped ones are mostly recent proposals. The 'recent' comparison reduces that mismatch.",
            "Small sample: treat metrics as indicative, not proof.",
            "Class-weighted scores are not calibrated probabilities. Prior correction is an evaluation diagnostic only; deployed scoring parameters are unchanged. Band stopped shares inform illustrative delay exposure scenarios, not forecasts.",
        ],
        "default_model": "recent",
        "comparisons": results,
        "holdout_demo": holdout_demo(*load("recent")[:3]),
    }
    verify_scoring_unchanged(artifact, OUT)
    default_bands = results["recent"]["metrics"]["band_outcomes_oof"]["bands"]
    rates = [default_bands[name]["rate"] for name in ("green", "watch", "red")]
    if any(rate is None for rate in rates) or rates != sorted(rates):
        raise ValueError("Default band rates are missing or not monotone; artifact was not written")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(artifact, indent=1))
    print(f"\nsaved {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
