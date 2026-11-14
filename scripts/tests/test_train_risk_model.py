"""Public-data regressions: evaluation must not change the deployed score model."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import train_risk_model as training


@pytest.fixture(scope="module")
def recent():
    return training.load("recent")


def test_scaling_is_fitted_only_to_each_training_fold(monkeypatch, recent):
    fitted_inputs = []
    original = training.LogisticRegression

    class RecordingRegression(original):
        def fit(self, X, y, *args, **kwargs):
            fitted_inputs.append(X.copy())
            return super().fit(X, y, *args, **kwargs)

    monkeypatch.setattr(training, "LogisticRegression", RecordingRegression)
    X, y, _, _ = recent
    training.evaluate(X, y)
    assert len(fitted_inputs) == 101  # 100 folds plus final full-data fit
    for X_train in fitted_inputs:
        np.testing.assert_allclose(X_train.mean(0), 0, atol=1e-12)


def test_repeated_evaluation_is_deterministic(recent):
    X, y, _, _ = recent
    first = training.evaluate(X, y)
    second = training.evaluate(X, y)
    assert first[0] == second[0]
    for a, b in [(first[1].coef_, second[1].coef_), (first[2], second[2]), (first[3], second[3])]:
        np.testing.assert_array_equal(a, b)


def test_thresholds_and_calibration_are_out_of_fold(recent):
    X, y, _, _ = recent
    metrics = training.evaluate(X, y)[0]
    assert metrics["oof_prediction_count"] == len(y) * 20
    assert set(metrics["oof_thresholds"]) == {"0.4", "0.5", "0.6"}
    for result in metrics["oof_thresholds"].values():
        assert 0 <= result["recall"] <= 1
        assert 0 <= result["precision"] <= 1
    for key in ["brier_raw_oof", "brier_prior_corrected_oof", "mean_score_training"]:
        assert 0 <= metrics[key] <= 1
    bins = metrics["reliability_raw_oof"]
    assert len(bins) == 5
    assert sum(row["count"] for row in bins) == len(y) * 20


def test_prior_correction_is_a_base_rate_shift_not_fitted_calibration():
    scores = training.prior_correct(np.array([0.0, 0.5, 1.0]), 0.2)
    np.testing.assert_allclose(scores, [0, 0.2, 1], atol=1e-10)
    assert np.isfinite(scores).all()


def test_holdout_is_excluded_from_fit(monkeypatch, recent):
    X, y, ids, _ = recent
    original = training.fit_scaled
    fitted_sizes = []
    keep = np.arange(len(ids)) != ids.index("1c23acb7-4ec3-459b-aa99-1bd3104a4fb9")

    def recording_fit(X_train, y_train):
        np.testing.assert_array_equal(X_train, X[keep])
        np.testing.assert_array_equal(y_train, y[keep])
        fitted_sizes.append(len(y_train))
        return original(X_train, y_train)

    monkeypatch.setattr(training, "fit_scaled", recording_fit)
    result = training.holdout_demo(X, y, ids)
    assert fitted_sizes == [len(y) - 1]
    assert result["project_id"] == "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9"
    assert result["training_n"] == 101
    assert 0 <= result["score"] <= 1
    assert 0 <= result["percentile"] <= 100
    assert result == training.holdout_demo(X, y, ids)


def test_guard_refuses_changed_parameters(tmp_path):
    existing = {"comparisons": {"recent": {"coefficients": {"a": 1}, "intercept": 0, "feature_mean": [0], "feature_std": [1]}}}
    path = tmp_path / "model.json"
    path.write_text(json.dumps(existing))
    modified = {"comparisons": {"recent": {**existing["comparisons"]["recent"], "intercept": 0.1}}}
    with pytest.raises(ValueError, match="intercept"):
        training.verify_scoring_unchanged(modified, path)
    assert json.loads(path.read_text()) == existing


def test_guard_rejects_reordered_coefficients(tmp_path):
    model = {"coefficients": {"a": 1, "b": 2}, "intercept": 0, "feature_mean": [0, 0], "feature_std": [1, 1]}
    path = tmp_path / "model.json"
    path.write_text(json.dumps({"features": ["a", "b"], "comparisons": {"recent": model}}))
    modified = {**model, "coefficients": {"b": 2, "a": 1}}
    with pytest.raises(ValueError, match="coefficients"):
        training.verify_scoring_unchanged({"features": ["a", "b"], "comparisons": {"recent": modified}}, path)


def test_metrics_use_exact_held_out_predictions(monkeypatch):
    X = np.array([[-4., 1.], [0., 5.], [2., 0.], [15., 3.]])
    y = np.array([0, 1, 0, 1])
    splits = [(np.array([0, 1]), np.array([2, 3])), (np.array([2, 3]), np.array([0, 1]))]

    class FixedSplits:
        def split(self, X, y):
            return iter(splits)

    monkeypatch.setattr(training, "RepeatedStratifiedKFold", lambda **kwargs: FixedSplits())
    expected, observed = [], []
    for tr, te in splits:
        mu, sd = X[tr].mean(0), X[tr].std(0)
        model = training.LogisticRegression(class_weight="balanced", C=0.5, max_iter=1000)
        model.fit((X[tr] - mu) / sd, y[tr])
        expected.extend(model.predict_proba((X[te] - mu) / sd)[:, 1])
        observed.extend(y[te])
    expected, observed = np.array(expected), np.array(observed)
    metrics = training.evaluate(X, y)[0]
    assert metrics["brier_raw_oof"] == round(float(np.mean((expected - observed) ** 2)), 6)
    for threshold in (0.4, 0.5, 0.6):
        flagged = expected >= threshold
        true_positive = ((observed == 1) & flagged).sum()
        result = metrics["oof_thresholds"][str(threshold)]
        assert result["recall"] == round(float(true_positive / observed.sum()), 6)
        assert result["precision"] == round(float(true_positive / flagged.sum()), 6)


def test_band_outcomes_use_held_out_scores_and_repeat_ranges():
    y = np.array([0, 1, 0, 1, 1, 0])
    p = np.array([0.1, 0.4, 0.6, 0.2, 0.5, 0.8])
    repeats = np.array([0, 0, 0, 1, 1, 1])
    result = training.band_outcomes(y, p, repeats)
    assert result["thresholds"] == {"watch": 0.4, "red": 0.6}
    assert result["repeat_count"] == 2
    green, watch, red = [result["bands"][name] for name in ("green", "watch", "red")]
    assert green == {"count": 2, "stopped_count": 1, "rate": 0.5, "repeat_min": 0.0, "repeat_max": 1.0, "repeats_with_observations": 2}
    assert watch["rate"] == 1.0
    assert red["rate"] == 0.0


def test_band_with_no_observations_is_unknown():
    result = training.band_outcomes(np.array([1]), np.array([0.5]), np.array([0]))
    assert result["bands"]["red"] == {"count": 0, "stopped_count": 0, "rate": None, "repeat_min": None, "repeat_max": None, "repeats_with_observations": 0}


def test_default_band_rates_are_monotone_and_reproduce_evidence(recent):
    X, y, _, _ = recent
    outcomes = training.evaluate(X, y)[0]["band_outcomes_oof"]
    rates = [outcomes["bands"][name]["rate"] for name in ("green", "watch", "red")]
    assert rates == sorted(rates)
    np.testing.assert_allclose(rates, [60 / 1014, 84 / 479, 176 / 547], atol=1e-6)
    assert sum(row["count"] for row in outcomes["bands"].values()) == len(y) * 20


def test_complete_artifact_is_reproducible(monkeypatch, tmp_path):
    out = tmp_path / "risk_model.json"
    out.write_text(training.OUT.read_text())
    monkeypatch.setattr(training, "OUT", out)
    monkeypatch.setattr(training, "ROOT", tmp_path)
    training.main()
    first = out.read_bytes()
    training.main()
    assert out.read_bytes() == first
    saved = json.loads(first)
    assert saved["holdout_demo"]["reproduces_handoff_to_2dp"] is True
    assert saved["holdout_demo"]["score"] == pytest.approx(0.569606, abs=1e-6)
    assert "pre-decision" in saved["notes"][0]


EXPECTED_PARAMETERS = {'all_built': {'coefficients': {'in_city_limits': 0.245, 'in_urban_area': 0.119, 'log_county_density': 0.602, 'log_km_to_metro': 1.056, 'is_crypto': -0.795, 'log_county_projects': -1.082}, 'intercept': -0.838, 'feature_mean': [0.87554, 0.81116, 2.73472, 1.53001, 0.04292, 1.02686], 'feature_std': [0.33011, 0.39138, 0.87913, 0.6825, 0.20267, 0.55734]}, 'recent': {'coefficients': {'in_city_limits': 0.184, 'in_urban_area': 0.318, 'log_county_density': 0.35, 'log_km_to_metro': 0.615, 'is_crypto': -0.333, 'log_county_projects': -0.729}, 'intercept': -0.339, 'feature_mean': [0.85294, 0.7549, 2.53855, 1.73177, 0.0098, 0.84253], 'feature_std': [0.35416, 0.43015, 0.81457, 0.60749, 0.09853, 0.57154]}}

@pytest.mark.parametrize("comparison", ["recent", "all_built"])
def test_final_scoring_parameters_reproduce_noahs_artifact(comparison):
    X, y, _, _ = training.load(comparison)
    _, model, mu, sd = training.evaluate(X, y)
    actual = {
        "coefficients": {name: round(float(c), 3) for name, c in zip(training.FEATURE_NAMES, model.coef_[0])},
        "intercept": round(float(model.intercept_[0]), 3),
        "feature_mean": [round(float(v), 5) for v in mu],
        "feature_std": [round(float(v), 5) for v in sd],
    }
    assert actual == EXPECTED_PARAMETERS[comparison]
