import type { Band } from "./model";
import { publicDay, signalAppliesTo, type Signal } from "./signals";

export type CaseStudyProject = {
  projectId: string;
  name: string;
  county: string | null;
  state: string | null;
  city?: string | null;
  inCityLimits?: boolean | null;
  modelBand: Band | null;
  trackerStatus: string;
};

export type CaseStudyOutcome = {
  signalId: string;
  type: Signal["signal_type"];
  day: string;
  basis: "event" | "publication";
  precision: "minute" | "day";
};

export type CaseStudyRow = CaseStudyProject & {
  directCount: number;
  countyContextCount: number;
  cityContextCount: number;
  totalCount: number;
  recordStatus: "project_records" | "area_context_only";
  firstRaiseDay: string | null;
  outcome: CaseStudyOutcome | null;
  leadStatus: "positive_lead" | "no_lead" | "no_raise_recorded" | "no_outcome_record" | "no_project_record";
  leadDays: number | null;
};

export type CaseStudySummary = {
  positiveLead: number;
  noLead: number;
  raiseWithoutRecordedStopOutcome: number;
  countyContextOnly: number;
  cityContextOnly: number;
};

function outcomeDate(signal: Signal): Pick<CaseStudyOutcome, "day" | "basis" | "precision"> {
  if (signal.event_precision !== "unknown" && signal.event_at !== null) {
    return { day: publicDay({ published_at: signal.event_at, published_precision: signal.event_precision }),
      basis: "event", precision: signal.event_precision };
  }
  return { day: publicDay(signal), basis: "publication", precision: signal.published_precision };
}

function comparePublished(a: Signal, b: Signal): number {
  const day = publicDay(a).localeCompare(publicDay(b));
  if (day) return day;
  if (a.published_precision !== b.published_precision) return a.published_precision === "day" ? -1 : 1;
  const instant = a.published_precision === "minute" ? Date.parse(a.published_at) - Date.parse(b.published_at) : 0;
  return instant || a.signal_id.localeCompare(b.signal_id);
}

function daysBetween(first: string, second: string): number {
  return (Date.parse(`${second}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000;
}

/** Immutable retrospective table from manually reviewed, source-dated fixture records only. */
export function computeCaseStudies(projects: readonly CaseStudyProject[], signals: readonly Signal[]): CaseStudyRow[] {
  const reviewed = signals.filter((signal) => signal.verification.method === "manual_review"
    && signal.verification.publication_date_basis === "source_page");
  return projects.flatMap((project): CaseStudyRow[] => {
    const matching = reviewed.filter((signal) => signalAppliesTo(signal, project.projectId,
      { county: project.county, state: project.state, city: project.city, inCityLimits: project.inCityLimits }));
    if (!matching.length) return [];
    const direct = matching.filter((signal) => signal.scope === "project");
    const countyContextCount = matching.filter((signal) => signal.scope === "county").length;
    const cityContextCount = matching.filter((signal) => signal.scope === "city").length;
    const raises = direct.filter((signal) => signal.effect === "raise").sort(comparePublished);
    const firstRaiseDay = raises.length ? publicDay(raises[0]) : null;
    const outcomes = direct.filter((signal) => signal.effect === "outcome")
      .sort((a, b) => outcomeDate(a).day.localeCompare(outcomeDate(b).day) || comparePublished(a, b));
    const selected = outcomes[0];
    const outcome = selected ? { signalId: selected.signal_id, type: selected.signal_type, ...outcomeDate(selected) } : null;
    const recordStatus = direct.length ? "project_records" : "area_context_only";
    const difference = firstRaiseDay && outcome ? daysBetween(firstRaiseDay, outcome.day) : null;
    const leadStatus = recordStatus === "area_context_only" ? "no_project_record"
      : !outcome ? "no_outcome_record" : !firstRaiseDay ? "no_raise_recorded"
        : difference !== null && difference > 0 ? "positive_lead" : "no_lead";
    return [{ ...project, directCount: direct.length, countyContextCount, cityContextCount,
      totalCount: matching.length, recordStatus, firstRaiseDay, outcome, leadStatus,
      leadDays: leadStatus === "positive_lead" ? difference : null }];
  }).sort((a, b) => a.name.localeCompare(b.name) || a.projectId.localeCompare(b.projectId));
}

export function summarizeCaseStudies(rows: readonly CaseStudyRow[]): CaseStudySummary {
  const stopTypes = new Set<Signal["signal_type"]>(["outcome_denied", "outcome_suspended", "outcome_withdrawn"]);
  return {
    positiveLead: rows.filter((row) => row.leadStatus === "positive_lead").length,
    noLead: rows.filter((row) => row.outcome && ["no_raise_recorded", "no_lead"].includes(row.leadStatus)).length,
    raiseWithoutRecordedStopOutcome: rows.filter((row) => row.firstRaiseDay
      && (!row.outcome || !stopTypes.has(row.outcome.type))).length,
    countyContextOnly: rows.filter((row) => row.recordStatus === "area_context_only" && row.countyContextCount > 0).length,
    cityContextOnly: rows.filter((row) => row.recordStatus === "area_context_only" && row.cityContextCount > 0).length,
  };
}
