import { describe, expect, it } from "vitest";
import { parseModelCard } from "./modelCard";

const artifact = {
  model: "logistic_regression_class_weighted",
  trained: "2026-11-14",
  default_model: "recent",
  comparisons: {
    recent: {
      description: "Stopped vs under-construction projects",
      metrics: {
        n_projects: 102,
        n_stopped: 16,
        n_built: 86,
        roc_auc_mean: 0.7,
        roc_auc_std: 0.149,
        stopped_recall_at_0_5: 0.704,
        stopped_precision_at_0_5: 0.313,
        brier_raw_oof: 0.218,
        brier_base_rate_oof: 0.132,
        band_outcomes_oof: {
          thresholds: { watch: 0.4, red: 0.6 },
          repeat_count: 20,
          count_basis: "Pooled out-of-fold predictions across repeated cross-validation",
          bands: {
            green: { count: 1014, stopped_count: 60, rate: 0.059172, repeat_min: 0.055556, repeat_max: 0.06383, repeats_with_observations: 20 },
            watch: { count: 479, stopped_count: 84, rate: 0.175365, repeat_min: 0.137931, repeat_max: 0.26087, repeats_with_observations: 20 },
            red: { count: 547, stopped_count: 176, rate: 0.321755, repeat_min: 0.259259, repeat_max: 0.36, repeats_with_observations: 20 },
          },
        },
      },
      coefficients: { in_city_limits: 0.184 },
    },
  },
  holdout_demo: {
    project_id: "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9",
    name: "Highlander SM One (San Marcos)",
    comparison: "recent",
    training_n: 101,
    score: 0.569606,
    percentile: 73.267,
    limitation: "Today's feature snapshot; not a historical backtest.",
  },
};

describe("parseModelCard", () => {
  it("returns typed default comparison metrics from a valid artifact", () => {
    const card = parseModelCard(artifact);
    expect(card.trained).toBe("2026-11-14");
    expect(card.defaultModel).toBe("recent");
    expect(card.metrics.n_projects).toBe(102);
    expect(card.metrics.band_outcomes_oof.bands.red.rate).toBe(0.321755);
    expect(card.metrics.brier_raw_oof).toBe(0.218);
    expect(card.coefficients).toEqual({ in_city_limits: 0.184 });
    expect(card.holdoutDemo).toMatchObject({
      projectId: "1c23acb7-4ec3-459b-aa99-1bd3104a4fb9",
      score: 0.569606,
      trainingN: 101,
      percentile: 73.267,
    });
  });

  it("rejects an invalid artifact root", () => {
    expect(() => parseModelCard(null)).toThrow(/object/i);
    expect(() => parseModelCard([])).toThrow(/object/i);
  });

  it("rejects a missing default comparison", () => {
    expect(() => parseModelCard({ ...artifact, default_model: "missing" })).toThrow(/default comparison/i);
  });

  it("allows an absent or null holdout demo", () => {
    const withoutDemo = structuredClone(artifact) as Record<string, unknown>;
    delete withoutDemo.holdout_demo;
    expect(parseModelCard(withoutDemo).holdoutDemo).toBeNull();
    expect(parseModelCard({ ...artifact, holdout_demo: null }).holdoutDemo).toBeNull();
  });

  it.each([
    [{ ...artifact.holdout_demo, score: -0.01 }, /score.*between 0 and 1/i],
    [{ ...artifact.holdout_demo, training_n: 101.5 }, /training_n.*integer/i],
    [{ ...artifact.holdout_demo, percentile: 100.1 }, /percentile.*between 0 and 100/i],
    [{ ...artifact.holdout_demo, limitation: "" }, /limitation/i],
  ])("rejects invalid holdout-demo fields", (holdoutDemo, message) => {
    expect(() => parseModelCard({ ...artifact, holdout_demo: holdoutDemo })).toThrow(message);
  });

  it("rejects missing or non-finite required metrics", () => {
    const noCount = structuredClone(artifact);
    delete (noCount.comparisons.recent.metrics as Partial<typeof artifact.comparisons.recent.metrics>).n_projects;
    expect(() => parseModelCard(noCount)).toThrow(/n_projects/i);

    const invalidAuc = structuredClone(artifact);
    invalidAuc.comparisons.recent.metrics.roc_auc_mean = Number.NaN;
    expect(() => parseModelCard(invalidAuc)).toThrow(/roc_auc_mean/i);
  });

  it("accepts valid metric boundaries", () => {
    const boundary = structuredClone(artifact);
    boundary.comparisons.recent.metrics.n_projects = 1;
    boundary.comparisons.recent.metrics.n_stopped = 0;
    boundary.comparisons.recent.metrics.n_built = 1;
    boundary.comparisons.recent.metrics.roc_auc_mean = 0;
    boundary.comparisons.recent.metrics.roc_auc_std = 0;
    boundary.comparisons.recent.metrics.stopped_recall_at_0_5 = 1;
    boundary.comparisons.recent.metrics.stopped_precision_at_0_5 = 0;
    const parsed = parseModelCard(boundary).metrics;
    expect(parsed.n_projects).toBe(1);
    expect(parsed.roc_auc_mean).toBe(0);
    expect(parsed.stopped_recall_at_0_5).toBe(1);
  });

  it("rejects invalid project counts and inconsistent sample totals", () => {
    const fractionalCount = structuredClone(artifact);
    fractionalCount.comparisons.recent.metrics.n_stopped = 15.5;
    expect(() => parseModelCard(fractionalCount)).toThrow(/n_stopped.*integer/i);

    const negativeCount = structuredClone(artifact);
    negativeCount.comparisons.recent.metrics.n_built = -1;
    expect(() => parseModelCard(negativeCount)).toThrow(/n_built.*integer/i);

    const emptySample = structuredClone(artifact);
    emptySample.comparisons.recent.metrics.n_projects = 0;
    emptySample.comparisons.recent.metrics.n_stopped = 0;
    emptySample.comparisons.recent.metrics.n_built = 0;
    expect(() => parseModelCard(emptySample)).toThrow(/n_projects.*greater than 0/i);

    const mismatchedSample = structuredClone(artifact);
    mismatchedSample.comparisons.recent.metrics.n_built = 85;
    expect(() => parseModelCard(mismatchedSample)).toThrow(/must equal n_projects/i);
  });

  it("rejects bounded metrics outside their documented ranges", () => {
    const invalidAuc = structuredClone(artifact);
    invalidAuc.comparisons.recent.metrics.roc_auc_mean = 1.01;
    expect(() => parseModelCard(invalidAuc)).toThrow(/roc_auc_mean.*between 0 and 1/i);

    const negativeStd = structuredClone(artifact);
    negativeStd.comparisons.recent.metrics.roc_auc_std = -0.01;
    expect(() => parseModelCard(negativeStd)).toThrow(/roc_auc_std.*nonnegative/i);

    const invalidRecall = structuredClone(artifact);
    invalidRecall.comparisons.recent.metrics.stopped_recall_at_0_5 = -0.01;
    expect(() => parseModelCard(invalidRecall)).toThrow(/stopped_recall_at_0_5.*between 0 and 1/i);

    const invalidPrecision = structuredClone(artifact);
    invalidPrecision.comparisons.recent.metrics.stopped_precision_at_0_5 = 1.01;
    expect(() => parseModelCard(invalidPrecision)).toThrow(/stopped_precision_at_0_5.*between 0 and 1/i);
  });

  it("rejects an empty coefficient map", () => {
    const noCoefficients = structuredClone(artifact);
    Object.assign(noCoefficients.comparisons.recent, { coefficients: {} });
    expect(() => parseModelCard(noCoefficients)).toThrow(/coefficients must not be empty/i);
  });

  it("rejects non-finite coefficients", () => {
    const invalid = structuredClone(artifact);
    invalid.comparisons.recent.coefficients.in_city_limits = Number.POSITIVE_INFINITY;
    expect(() => parseModelCard(invalid)).toThrow(/coefficient/i);
  });

  it("rejects thresholds that do not match the product risk bands", () => {
    const invalid = structuredClone(artifact);
    invalid.comparisons.recent.metrics.band_outcomes_oof.thresholds.watch = 0.41;
    expect(() => parseModelCard(invalid)).toThrow(/thresholds.*match/i);
  });

  it("validates pooled band counts, rates, and repeat ranges", () => {
    const invalidCount = structuredClone(artifact);
    invalidCount.comparisons.recent.metrics.band_outcomes_oof.bands.green.count = 2.5;
    expect(() => parseModelCard(invalidCount)).toThrow(/green.*count.*integer/i);

    const invalidStoppedCount = structuredClone(artifact);
    invalidStoppedCount.comparisons.recent.metrics.band_outcomes_oof.bands.watch.stopped_count = 480;
    expect(() => parseModelCard(invalidStoppedCount)).toThrow(/stopped_count.*cannot exceed count/i);

    const invalidRate = structuredClone(artifact);
    invalidRate.comparisons.recent.metrics.band_outcomes_oof.bands.red.rate = 0.3;
    expect(() => parseModelCard(invalidRate)).toThrow(/red.*rate.*does not match/i);

    const invalidRange = structuredClone(artifact);
    invalidRange.comparisons.recent.metrics.band_outcomes_oof.bands.red.repeat_min = 0.5;
    expect(() => parseModelCard(invalidRange)).toThrow(/repeat_min.*cannot exceed repeat_max/i);

    const invalidMax = structuredClone(artifact);
    invalidMax.comparisons.recent.metrics.band_outcomes_oof.bands.green.repeat_max = 1.1;
    expect(() => parseModelCard(invalidMax)).toThrow(/repeat_max.*between 0 and 1/i);
  });

  it("allows an empty pooled band only with a null pooled rate", () => {
    const empty = structuredClone(artifact);
    Object.assign(empty.comparisons.recent.metrics.band_outcomes_oof.bands.green, {
      count: 0, stopped_count: 0, rate: null, repeat_min: null, repeat_max: null, repeats_with_observations: 0,
    });
    expect(parseModelCard(empty).metrics.band_outcomes_oof.bands.green.rate).toBeNull();
    Object.assign(empty.comparisons.recent.metrics.band_outcomes_oof.bands.green, { rate: 0 });
    expect(() => parseModelCard(empty)).toThrow(/green rate and repeat observations must be empty when count is zero/i);
  });
});
