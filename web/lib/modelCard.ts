import { BANDS, type Band } from "./model";

export type BandOutcome = {
  count: number;
  stoppedCount: number;
  rate: number | null;
  repeatMin: number | null;
  repeatMax: number | null;
  repeatsWithObservations: number;
};

export type BandOutcomes = {
  thresholds: { watch: number; red: number };
  repeatCount: number;
  countBasis: string;
  bands: Record<Band, BandOutcome>;
};

export type ModelMetrics = {
  n_projects: number;
  n_stopped: number;
  n_built: number;
  roc_auc_mean: number;
  roc_auc_std: number;
  stopped_recall_at_0_5: number;
  stopped_precision_at_0_5: number;
  brier_raw_oof: number;
  brier_base_rate_oof: number;
  band_outcomes_oof: BandOutcomes;
};

export type HoldoutDemo = {
  projectId: string;
  name: string;
  score: number;
  comparison: string;
  trainingN: number;
  percentile: number;
  limitation: string;
};

export type ModelCard = {
  model: string;
  trained: string;
  defaultModel: string;
  description: string;
  metrics: ModelMetrics;
  coefficients: Record<string, number>;
  holdoutDemo: HoldoutDemo | null;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Model artifact ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Model artifact ${label} must be a non-empty string`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Model artifact ${label} must be a finite number`);
  return value;
}

function projectCount(value: unknown, label: string): number {
  const count = finite(value, label);
  if (!Number.isInteger(count) || count < 0) throw new Error(`Model artifact ${label} must be a nonnegative integer`);
  return count;
}

function unitInterval(value: unknown, label: string): number {
  const metric = finite(value, label);
  if (metric < 0 || metric > 1) throw new Error(`Model artifact ${label} must be between 0 and 1`);
  return metric;
}

function percentage(value: unknown, label: string): number {
  const percent = finite(value, label);
  if (percent < 0 || percent > 100) throw new Error(`Model artifact ${label} must be between 0 and 100`);
  return percent;
}

function holdoutDemo(value: unknown): HoldoutDemo | null {
  if (value === undefined || value === null) return null;
  const demo = record(value, "holdout_demo");
  const trainingN = projectCount(demo.training_n, "holdout_demo training_n");
  if (trainingN === 0) throw new Error("Model artifact holdout_demo training_n must be greater than 0");
  return {
    projectId: string(demo.project_id, "holdout_demo project_id"),
    name: string(demo.name, "holdout_demo name"),
    score: unitInterval(demo.score, "holdout_demo score"),
    comparison: string(demo.comparison, "holdout_demo comparison"),
    trainingN,
    percentile: percentage(demo.percentile, "holdout_demo percentile"),
    limitation: string(demo.limitation, "holdout_demo limitation"),
  };
}

function optionalRate(value: unknown, label: string): number | null {
  if (value === null) return null;
  return unitInterval(value, label);
}

function bandOutcomes(value: unknown): BandOutcomes {
  const outcomes = record(value, "band_outcomes_oof");
  const thresholds = record(outcomes.thresholds, "band_outcomes_oof thresholds");
  const watch = finite(thresholds.watch, "watch threshold");
  const red = finite(thresholds.red, "red threshold");
  if (watch !== BANDS.watch || red !== BANDS.red) {
    throw new Error(`Model artifact thresholds must match BANDS (${BANDS.watch}, ${BANDS.red})`);
  }
  const repeatCount = projectCount(outcomes.repeat_count, "repeat_count");
  if (repeatCount === 0) throw new Error("Model artifact repeat_count must be greater than 0");
  const countBasis = string(outcomes.count_basis, "count_basis");
  const rawBands = record(outcomes.bands, "band_outcomes_oof bands");
  const parsed = {} as Record<Band, BandOutcome>;

  for (const name of ["green", "watch", "red"] as const) {
    const raw = record(rawBands[name], `${name} band outcome`);
    const count = projectCount(raw.count, `${name} count`);
    const stoppedCount = projectCount(raw.stopped_count, `${name} stopped_count`);
    if (stoppedCount > count) throw new Error(`Model artifact ${name} stopped_count cannot exceed count`);
    const rate = optionalRate(raw.rate, `${name} rate`);
    const repeatsWithObservations = projectCount(raw.repeats_with_observations, `${name} repeats_with_observations`);
    if (repeatsWithObservations > repeatCount) throw new Error(`Model artifact ${name} repeats_with_observations cannot exceed repeat_count`);
    if (count === 0) {
      if (stoppedCount !== 0 || rate !== null || repeatsWithObservations !== 0) {
        throw new Error(`Model artifact ${name} rate and repeat observations must be empty when count is zero`);
      }
    } else {
      if (rate === null) throw new Error(`Model artifact ${name} rate is required when count is positive`);
      if (repeatsWithObservations === 0) throw new Error(`Model artifact ${name} repeats_with_observations is required when count is positive`);
      const observedRate = stoppedCount / count;
      if (Math.abs(rate - observedRate) > 0.000001) throw new Error(`Model artifact ${name} rate does not match stopped_count / count`);
    }

    const repeatMin = optionalRate(raw.repeat_min, `${name} repeat_min`);
    const repeatMax = optionalRate(raw.repeat_max, `${name} repeat_max`);
    if (repeatsWithObservations === 0) {
      if (repeatMin !== null || repeatMax !== null) throw new Error(`Model artifact ${name} repeat ranges must be null with no repeat observations`);
    } else {
      if (repeatMin === null || repeatMax === null) throw new Error(`Model artifact ${name} repeat ranges are required with observations`);
      if (repeatMin > repeatMax) throw new Error(`Model artifact ${name} repeat_min cannot exceed repeat_max`);
    }
    parsed[name] = { count, stoppedCount, rate, repeatMin, repeatMax, repeatsWithObservations };
  }

  return { thresholds: { watch, red }, repeatCount, countBasis, bands: parsed };
}

/** Validate and select the artifact's default comparison without filesystem or runtime dependencies. */
export function parseModelCard(value: unknown): ModelCard {
  const root = record(value, "root");
  const model = string(root.model, "model");
  const trained = string(root.trained, "trained");
  const defaultModel = string(root.default_model, "default_model");
  const comparisons = record(root.comparisons, "comparisons");
  const selected = comparisons[defaultModel];
  if (selected === undefined) throw new Error(`Model artifact has no default comparison '${defaultModel}'`);

  const comparison = record(selected, `comparison ${defaultModel}`);
  const metricsValue = record(comparison.metrics, `comparison ${defaultModel} metrics`);
  const metrics: ModelMetrics = {
    n_projects: projectCount(metricsValue.n_projects, "n_projects"),
    n_stopped: projectCount(metricsValue.n_stopped, "n_stopped"),
    n_built: projectCount(metricsValue.n_built, "n_built"),
    roc_auc_mean: unitInterval(metricsValue.roc_auc_mean, "roc_auc_mean"),
    roc_auc_std: finite(metricsValue.roc_auc_std, "roc_auc_std"),
    stopped_recall_at_0_5: unitInterval(metricsValue.stopped_recall_at_0_5, "stopped_recall_at_0_5"),
    stopped_precision_at_0_5: unitInterval(metricsValue.stopped_precision_at_0_5, "stopped_precision_at_0_5"),
    brier_raw_oof: unitInterval(metricsValue.brier_raw_oof, "brier_raw_oof"),
    brier_base_rate_oof: unitInterval(metricsValue.brier_base_rate_oof, "brier_base_rate_oof"),
    band_outcomes_oof: bandOutcomes(metricsValue.band_outcomes_oof),
  };
  if (metrics.n_projects === 0) throw new Error("Model artifact n_projects must be greater than 0");
  if (metrics.n_stopped + metrics.n_built !== metrics.n_projects) {
    throw new Error("Model artifact n_stopped plus n_built must equal n_projects");
  }
  if (metrics.roc_auc_std < 0) throw new Error("Model artifact roc_auc_std must be nonnegative");
  const coefficientValues = record(comparison.coefficients, `comparison ${defaultModel} coefficients`);
  if (Object.keys(coefficientValues).length === 0) throw new Error("Model artifact coefficients must not be empty");
  const coefficients = Object.fromEntries(Object.entries(coefficientValues).map(([key, coefficient]) => [key, finite(coefficient, `coefficient ${key}`)]));

  return {
    model,
    trained,
    defaultModel,
    description: string(comparison.description, `comparison ${defaultModel} description`),
    metrics,
    coefficients,
    holdoutDemo: holdoutDemo(root.holdout_demo),
  };
}
